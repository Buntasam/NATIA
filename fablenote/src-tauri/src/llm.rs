//! IA intégrée : llama.cpp (`llama-server`) tourne sur ce PC, rien ne quitte la machine.
//!
//! - Le moteur et les modèles sont téléchargés à la demande, uniquement depuis
//!   des adresses figées dans ce fichier, et vérifiés par leur empreinte SHA-256.
//! - Le serveur n'écoute que sur 127.0.0.1, avec une clé aléatoire à chaque
//!   lancement et sans interface web. Il est rattaché à NATIA (Job Object
//!   Windows) : il s'arrête avec l'app, même en cas de plantage.
//! - Il démarre au premier message envoyé à l'IA intégrée, pas avant.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

// ─── Moteur et catalogue ──────────────────────────────────────────────────────

const ENGINE_VERSION: &str = "b11476";
const ENGINE_URL: &str = "https://github.com/ggml-org/llama.cpp/releases/download/b11476/llama-b11476-bin-win-vulkan-x64.zip";
const ENGINE_SHA256: &str = "5c71e7b749697da4a8d46e9ee55486845cbba27c9dfbecb4007f31ba6610d523";
const ENGINE_SIZE: u64 = 33_380_424;
const SERVER_EXE: &str = "llama-server.exe";

pub const PROGRESS_EVENT: &str = "llm-download";
const CONTEXT_SIZE: &str = "8192";
const START_TIMEOUT: Duration = Duration::from_secs(240);

pub struct CatalogModel {
    pub id: &'static str,
    pub name: &'static str,
    repo: &'static str,
    file: &'static str,
    sha256: &'static str,
    pub size: u64,
    pub license: &'static str,
    pub license_url: &'static str,
}

impl CatalogModel {
    fn url(&self) -> String {
        format!("https://huggingface.co/{}/resolve/main/{}", self.repo, self.file)
    }
}

/// Modèles proposés, tous en libre téléchargement (sans compte), quantifiés en Q4_K_M.
pub const CATALOG: &[CatalogModel] = &[
    CatalogModel {
        id: "gemma3-1b", name: "Gemma 3 1B",
        repo: "ggml-org/gemma-3-1b-it-GGUF", file: "gemma-3-1b-it-Q4_K_M.gguf",
        sha256: "8ccc5cd1f1b3602548715ae25a66ed73fd5dc68a210412eea643eb20eb75a135", size: 806_058_240,
        license: "Gemma", license_url: "https://ai.google.dev/gemma/terms",
    },
    CatalogModel {
        id: "gemma3-4b", name: "Gemma 3 4B",
        repo: "ggml-org/gemma-3-4b-it-GGUF", file: "gemma-3-4b-it-Q4_K_M.gguf",
        sha256: "882e8d2db44dc554fb0ea5077cb7e4bc49e7342a1f0da57901c0802ea21a0863", size: 2_489_757_856,
        license: "Gemma", license_url: "https://ai.google.dev/gemma/terms",
    },
    CatalogModel {
        id: "phi4-mini", name: "Phi-4 mini",
        repo: "unsloth/Phi-4-mini-instruct-GGUF", file: "Phi-4-mini-instruct-Q4_K_M.gguf",
        sha256: "88c00229914083cd112853aab84ed51b87bdf6b9ce42f532d8c85c7c63b1730a", size: 2_491_874_272,
        license: "MIT", license_url: "https://huggingface.co/microsoft/Phi-4-mini-instruct/blob/main/LICENSE",
    },
    CatalogModel {
        id: "mistral-7b", name: "Mistral 7B",
        repo: "bartowski/Mistral-7B-Instruct-v0.3-GGUF", file: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
        sha256: "1270d22c0fbb3d092fb725d4d96c457b7b687a5f5a715abe1e818da303e562b6", size: 4_372_812_000,
        license: "Apache 2.0", license_url: "https://www.apache.org/licenses/LICENSE-2.0",
    },
    CatalogModel {
        id: "gemma3-12b", name: "Gemma 3 12B",
        repo: "ggml-org/gemma-3-12b-it-GGUF", file: "gemma-3-12b-it-Q4_K_M.gguf",
        sha256: "7bb69bff3f48a7b642355d64a90e481182a7794707b3133890646b1efa778ff5", size: 7_300_574_976,
        license: "Gemma", license_url: "https://ai.google.dev/gemma/terms",
    },
];

fn catalog_model(id: &str) -> Result<&'static CatalogModel, String> {
    CATALOG.iter().find(|m| m.id == id).ok_or_else(|| "Modèle inconnu".to_string())
}

/// Modèle conseillé selon la mémoire de la carte graphique dédiée et la RAM (en Go).
pub(crate) fn recommend(ram_gb: f64, vram_gb: f64) -> &'static str {
    if vram_gb >= 10.0 { "gemma3-12b" }
    else if vram_gb >= 6.0 { "mistral-7b" }
    else if vram_gb >= 3.5 || ram_gb >= 15.0 { "gemma3-4b" }
    else { "gemma3-1b" }
}

// ─── État ─────────────────────────────────────────────────────────────────────

struct Server {
    child: Child,
    port: u16,
    key: String,
    model_id: String,
}

#[derive(Clone, Serialize)]
pub struct Gpu {
    pub device: String,
    pub name: String,
    pub vram_mib: u64,
    pub integrated: bool,
}

#[derive(Default)]
pub struct LlmState {
    server: tokio::sync::Mutex<Option<Server>>,
    downloading: AtomicBool,
    cancel: AtomicBool,
    gpus: Mutex<Option<Vec<Gpu>>>,
    #[cfg(windows)]
    job: Mutex<Option<usize>>,
}

fn llm_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("llm"))
}

fn engine_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(llm_dir(app)?.join(format!("engine-{}", ENGINE_VERSION)))
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(llm_dir(app)?.join("models"))
}

fn model_path(app: &AppHandle, m: &CatalogModel) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(m.file))
}

fn engine_installed(app: &AppHandle) -> bool {
    engine_dir(app).map(|d| d.join(SERVER_EXE).is_file()).unwrap_or(false)
}

/// Lance une commande sans ouvrir de fenêtre de console.
fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

// ─── Matériel ─────────────────────────────────────────────────────────────────

fn total_ram_gb() -> f64 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut s: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        s.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if unsafe { GlobalMemoryStatusEx(&mut s) } != 0 {
            return s.ullTotalPhys as f64 / (1024.0 * 1024.0 * 1024.0);
        }
    }
    0.0
}

fn is_integrated(name: &str) -> bool {
    let n = name.to_lowercase();
    ["intel(r) uhd", "intel(r) hd", "intel(r) iris", "radeon(tm) graphics", "radeon graphics", "microsoft basic"]
        .iter()
        .any(|p| n.contains(p))
}

/// Lignes de `llama-server --list-devices` : `  Vulkan1: NVIDIA GeForce RTX 3050 (3962 MiB, 3367 MiB free)`.
pub(crate) fn parse_devices(output: &str) -> Vec<Gpu> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (device, rest) = line.split_once(": ")?;
            if device.is_empty() || device.contains(' ') { return None; }
            let open = rest.rfind(" (")?;
            let name = rest[..open].trim().to_string();
            let vram_mib = rest[open + 2..].split_whitespace().next()?.parse().ok()?;
            Some(Gpu { device: device.to_string(), integrated: is_integrated(&name), name, vram_mib })
        })
        .collect()
}

/// Carte graphique à utiliser : la carte dédiée la mieux dotée, sinon laisser llama.cpp choisir.
pub(crate) fn pick_gpu(gpus: &[Gpu]) -> Option<&Gpu> {
    gpus.iter().filter(|g| !g.integrated).max_by_key(|g| g.vram_mib)
}

fn detect_gpus(app: &AppHandle, state: &LlmState) -> Vec<Gpu> {
    if let Some(g) = state.gpus.lock().ok().and_then(|g| g.clone()) { return g; }
    let Ok(dir) = engine_dir(app) else { return vec![] };
    let out = hidden(Command::new(dir.join(SERVER_EXE)).arg("--list-devices").current_dir(&dir)).output();
    let gpus = out
        .map(|o| parse_devices(&format!("{}\n{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr))))
        .unwrap_or_default();
    if let Ok(mut g) = state.gpus.lock() { *g = Some(gpus.clone()); }
    gpus
}

// ─── Statut ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ModelInfo {
    id: &'static str,
    name: &'static str,
    size: u64,
    license: &'static str,
    license_url: &'static str,
    installed: bool,
}

#[derive(Serialize)]
pub struct LlmStatus {
    engine_installed: bool,
    engine_version: &'static str,
    engine_size: u64,
    models: Vec<ModelInfo>,
    recommended: &'static str,
    ram_gb: f64,
    gpu: Option<Gpu>,
    running: Option<String>,
    downloading: bool,
}

#[tauri::command]
pub async fn llm_status(app: AppHandle, state: State<'_, LlmState>) -> Result<LlmStatus, String> {
    let installed = engine_installed(&app);
    let gpus = if installed { detect_gpus(&app, &state) } else { vec![] };
    let gpu = pick_gpu(&gpus).cloned();
    let ram_gb = total_ram_gb();
    let vram_gb = gpu.as_ref().map(|g| g.vram_mib as f64 / 1024.0).unwrap_or(0.0);
    let models = CATALOG
        .iter()
        .map(|m| ModelInfo {
            id: m.id, name: m.name, size: m.size, license: m.license, license_url: m.license_url,
            installed: model_path(&app, m).map(|p| p.is_file()).unwrap_or(false),
        })
        .collect();
    let running = state.server.lock().await.as_ref().map(|s| s.model_id.clone());
    Ok(LlmStatus {
        engine_installed: installed,
        engine_version: ENGINE_VERSION,
        engine_size: ENGINE_SIZE,
        models,
        recommended: recommend(ram_gb, vram_gb),
        ram_gb,
        gpu,
        running,
        downloading: state.downloading.load(Ordering::SeqCst),
    })
}

// ─── Téléchargements vérifiés ─────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct Progress<'a> {
    kind: &'a str,
    id: &'a str,
    received: u64,
    total: u64,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Télécharge `url` vers `dest` en vérifiant la taille et l'empreinte SHA-256.
/// Le fichier n'apparaît à `dest` qu'une fois vérifié.
async fn download_verified(
    app: &AppHandle, state: &LlmState, url: &str, dest: &Path,
    sha256: &str, size: u64, kind: &str, id: &str,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let part = dest.with_extension("part");
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client.get(url).send().await.map_err(|e| format!("Téléchargement impossible : {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Téléchargement impossible : {}", resp.status()));
    }

    let result = async {
        let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut received: u64 = 0;
        let mut last_emit = Instant::now() - Duration::from_secs(1);
        while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Téléchargement interrompu : {}", e))? {
            if state.cancel.load(Ordering::SeqCst) { return Err("Téléchargement annulé".to_string()); }
            received += chunk.len() as u64;
            if received > size { return Err("Fichier plus gros que prévu : téléchargement refusé".to_string()); }
            hasher.update(&chunk);
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            if last_emit.elapsed() >= Duration::from_millis(250) {
                last_emit = Instant::now();
                let _ = app.emit(PROGRESS_EVENT, Progress { kind, id, received, total: size });
            }
        }
        file.flush().map_err(|e| e.to_string())?;
        drop(file);
        if received != size { return Err("Téléchargement incomplet".to_string()); }
        if hex(&hasher.finalize()) != sha256 {
            return Err("Empreinte du fichier incorrecte : téléchargement refusé".to_string());
        }
        let _ = app.emit(PROGRESS_EVENT, Progress { kind, id, received, total: size });
        std::fs::rename(&part, dest).map_err(|e| e.to_string())
    }
    .await;
    if result.is_err() { let _ = std::fs::remove_file(&part); }
    result
}

/// Un seul téléchargement à la fois.
struct DownloadGuard<'a>(&'a LlmState);

impl<'a> DownloadGuard<'a> {
    fn take(state: &'a LlmState) -> Result<Self, String> {
        if state.downloading.swap(true, Ordering::SeqCst) {
            return Err("Un téléchargement est déjà en cours".to_string());
        }
        state.cancel.store(false, Ordering::SeqCst);
        Ok(Self(state))
    }
}

impl Drop for DownloadGuard<'_> {
    fn drop(&mut self) { self.0.downloading.store(false, Ordering::SeqCst); }
}

/// Fichiers du zip llama.cpp utiles au serveur : `llama-server.exe`, les DLL et les licences.
pub(crate) fn is_engine_file(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    if n.contains('/') || n.contains('\\') { return false; }
    if n == SERVER_EXE || n.starts_with("license") { return true; }
    n.ends_with(".dll") && (!n.ends_with("-impl.dll") || n == "llama-server-impl.dll")
}

fn extract_engine(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let tmp = dest.with_extension("tmp");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name().and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string())) else { continue };
        if !entry.is_file() || !is_engine_file(&name) { continue; }
        let mut out = std::fs::File::create(tmp.join(&name)).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    if !tmp.join(SERVER_EXE).is_file() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err("Archive du moteur incomplète".to_string());
    }
    let _ = std::fs::remove_dir_all(dest);
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_install_engine(app: AppHandle, state: State<'_, LlmState>) -> Result<(), String> {
    if engine_installed(&app) { return Ok(()); }
    let _guard = DownloadGuard::take(&state)?;
    let zip_path = llm_dir(&app)?.join(format!("engine-{}.zip", ENGINE_VERSION));
    download_verified(&app, &state, ENGINE_URL, &zip_path, ENGINE_SHA256, ENGINE_SIZE, "engine", ENGINE_VERSION).await?;
    let dest = engine_dir(&app)?;
    let res = tokio::task::spawn_blocking({
        let zip_path = zip_path.clone();
        move || extract_engine(&zip_path, &dest)
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&zip_path);
    if let Ok(mut g) = state.gpus.lock() { *g = None; }
    res
}

#[tauri::command]
pub async fn llm_download_model(app: AppHandle, state: State<'_, LlmState>, id: String) -> Result<(), String> {
    let m = catalog_model(&id)?;
    let dest = model_path(&app, m)?;
    if dest.is_file() { return Ok(()); }
    let _guard = DownloadGuard::take(&state)?;
    download_verified(&app, &state, &m.url(), &dest, m.sha256, m.size, "model", m.id).await
}

#[tauri::command]
pub fn llm_cancel_download(state: State<'_, LlmState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn llm_delete_model(app: AppHandle, state: State<'_, LlmState>, id: String) -> Result<(), String> {
    let m = catalog_model(&id)?;
    {
        let mut server = state.server.lock().await;
        if server.as_ref().is_some_and(|s| s.model_id == m.id) {
            if let Some(mut s) = server.take() { let _ = s.child.kill(); let _ = s.child.wait(); }
        }
    }
    let path = model_path(&app, m)?;
    if path.is_file() { std::fs::remove_file(&path).map_err(|e| e.to_string())?; }
    Ok(())
}

// ─── Serveur ──────────────────────────────────────────────────────────────────

/// Rattache le serveur à NATIA : Windows le termine quand NATIA se ferme, même brutalement.
#[cfg(windows)]
fn attach_to_job(state: &LlmState, child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    let Ok(mut job) = state.job.lock() else { return };
    if job.is_none() {
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() { return; }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            *job = Some(handle as usize);
        }
    }
    if let Some(h) = *job {
        unsafe { AssignProcessToJobObject(h as _, child.as_raw_handle() as _); }
    }
}

fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}

fn local_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())
}

fn log_tail(path: &Path) -> String {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(4)..].join("\n")
}

/// Démarre le serveur pour `model_id` (ou réutilise celui qui tourne) et renvoie (port, clé).
async fn ensure_server(app: &AppHandle, state: &LlmState, model_id: &str) -> Result<(u16, String), String> {
    let m = catalog_model(model_id)?;
    let mut server = state.server.lock().await;
    if let Some(s) = server.as_mut() {
        if s.model_id == m.id && s.child.try_wait().map(|st| st.is_none()).unwrap_or(false) {
            return Ok((s.port, s.key.clone()));
        }
        let _ = s.child.kill();
        let _ = s.child.wait();
        *server = None;
    }

    if !engine_installed(app) { return Err("IA intégrée non installée : Paramètres → Intelligence artificielle".to_string()); }
    let model = model_path(app, m)?;
    if !model.is_file() { return Err(format!("Modèle {} non téléchargé : Paramètres → Intelligence artificielle", m.name)); }

    let dir = engine_dir(app)?;
    let port = free_port()?;
    let mut key_bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut key_bytes);
    let key = hex(&key_bytes);
    let log_path = llm_dir(app)?.join("server.log");
    let log = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let gpu = pick_gpu(&detect_gpus(app, state)).map(|g| g.device.clone());

    let mut cmd = Command::new(dir.join(SERVER_EXE));
    cmd.current_dir(&dir)
        .arg("-m").arg(&model)
        .args(["--host", "127.0.0.1", "--port", &port.to_string(), "--api-key", &key])
        .args(["--no-webui", "--offline", "-c", CONTEXT_SIZE, "-np", "1"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log));
    if let Some(dev) = &gpu { cmd.args(["--device", dev]); }
    let mut child = hidden(&mut cmd).spawn().map_err(|e| format!("Impossible de démarrer l'IA intégrée : {}", e))?;
    #[cfg(windows)]
    attach_to_job(state, &child);

    // Attente du chargement du modèle (quelques secondes à quelques minutes sans carte graphique).
    let client = local_client()?;
    let health = format!("http://127.0.0.1:{}/health", port);
    let started = Instant::now();
    loop {
        if let Ok(Some(_)) = child.try_wait() {
            return Err(format!("L'IA intégrée s'est arrêtée au démarrage.\n{}", log_tail(&log_path)));
        }
        if started.elapsed() > START_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("L'IA intégrée met trop de temps à démarrer : essayez un modèle plus petit.".to_string());
        }
        if let Ok(r) = client.get(&health).bearer_auth(&key).send().await {
            if r.status().is_success() { break; }
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }

    *server = Some(Server { child, port, key: key.clone(), model_id: m.id.to_string() });
    Ok((port, key))
}

pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<LlmState>() {
        if let Ok(mut server) = state.server.try_lock() {
            if let Some(mut s) = server.take() { let _ = s.child.kill(); let _ = s.child.wait(); }
        }
    }
}

#[tauri::command]
pub async fn llm_stop(state: State<'_, LlmState>) -> Result<(), String> {
    if let Some(mut s) = state.server.lock().await.take() { let _ = s.child.kill(); let _ = s.child.wait(); }
    Ok(())
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

fn chat_payload(system: &str, message: &str, temperature: f64, history: Option<Vec<serde_json::Value>>, stream: bool) -> serde_json::Value {
    let mut messages = vec![serde_json::json!({"role": "system", "content": system})];
    if let Some(h) = history { messages.extend(h); }
    messages.push(serde_json::json!({"role": "user", "content": message}));
    serde_json::json!({ "messages": messages, "temperature": temperature, "stream": stream })
}

#[tauri::command]
pub async fn llm_chat(
    app: AppHandle, state: State<'_, LlmState>,
    model_id: String, system: String, message: String, temperature: f64,
) -> Result<String, String> {
    let (port, key) = ensure_server(&app, &state, &model_id).await?;
    let resp = local_client()?
        .post(format!("http://127.0.0.1:{}/v1/chat/completions", port))
        .bearer_auth(&key)
        .json(&chat_payload(&system, &message, temperature, None, false))
        .send()
        .await
        .map_err(|e| format!("IA intégrée : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("IA intégrée {} : {}", status, resp.text().await.unwrap_or_default()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string())
}

/// Découpe un flux SSE en lignes complètes, sans couper un caractère UTF-8 entre deux morceaux.
pub(crate) fn take_lines(buf: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
        let line: Vec<u8> = buf.drain(..=pos).collect();
        lines.push(String::from_utf8_lossy(&line).trim().to_string());
    }
    lines
}

#[tauri::command]
pub async fn llm_stream(
    app: AppHandle, state: State<'_, LlmState>,
    model_id: String, system: String, message: String, temperature: f64,
    history: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let (port, key) = ensure_server(&app, &state, &model_id).await?;
    let mut resp = local_client()?
        .post(format!("http://127.0.0.1:{}/v1/chat/completions", port))
        .bearer_auth(&key)
        .json(&chat_payload(&system, &message, temperature, history, true))
        .send()
        .await
        .map_err(|e| format!("IA intégrée : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("IA intégrée {} : {}", status, resp.text().await.unwrap_or_default()));
    }
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.extend_from_slice(&chunk);
        for line in take_lines(&mut buf) {
            let Some(data) = line.strip_prefix("data:").map(str::trim) else { continue };
            if data == "[DONE]" { let _ = app.emit("ollama-done", ""); return Ok(()); }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                    if !content.is_empty() { let _ = app.emit("ollama-token", content.to_string()); }
                }
            }
        }
    }
    let _ = app.emit("ollama-done", "");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_consistent() {
        let mut ids: Vec<&str> = CATALOG.iter().map(|m| m.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), CATALOG.len(), "identifiants uniques");
        for m in CATALOG {
            assert_eq!(m.sha256.len(), 64, "{}", m.id);
            assert!(m.sha256.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()), "{}", m.id);
            assert!(m.url().starts_with("https://huggingface.co/"), "{}", m.id);
            assert!(m.file.ends_with(".gguf") && m.size > 100_000_000, "{}", m.id);
        }
        assert_eq!(ENGINE_SHA256.len(), 64);
        assert!(ENGINE_URL.starts_with("https://github.com/ggml-org/llama.cpp/releases/download/"));
        for id in ["gemma3-1b", "gemma3-4b", "mistral-7b", "gemma3-12b"] { assert!(catalog_model(id).is_ok()); }
    }

    #[test]
    fn recommendation_follows_hardware() {
        assert_eq!(recommend(7.8, 0.0), "gemma3-1b");
        assert_eq!(recommend(15.8, 0.0), "gemma3-4b");
        assert_eq!(recommend(7.8, 3.87), "gemma3-4b");
        assert_eq!(recommend(32.0, 8.0), "mistral-7b");
        assert_eq!(recommend(32.0, 12.0), "gemma3-12b");
    }

    #[test]
    fn devices_are_parsed_and_dedicated_gpu_preferred() {
        let out = "load_backend: loaded Vulkan backend\nAvailable devices:\n  Vulkan0: Intel(R) UHD Graphics (8052 MiB, 7394 MiB free)\n  Vulkan1: NVIDIA GeForce RTX 3050 Laptop GPU (3962 MiB, 3367 MiB free)\n";
        let gpus = parse_devices(out);
        assert_eq!(gpus.len(), 2);
        assert!(gpus[0].integrated && !gpus[1].integrated);
        let g = pick_gpu(&gpus).unwrap();
        assert_eq!((g.device.as_str(), g.vram_mib), ("Vulkan1", 3962));
        assert!(pick_gpu(&parse_devices("  Vulkan0: Intel(R) Iris(R) Xe Graphics (8000 MiB, 7000 MiB free)")).is_none());
        assert!(parse_devices("Available devices:\n").is_empty());
    }

    #[test]
    fn only_server_files_are_extracted() {
        for ok in ["llama-server.exe", "llama-server-impl.dll", "llama.dll", "ggml-vulkan.dll", "libomp.dll", "LICENSE-LLVM-OpenMP"] {
            assert!(is_engine_file(ok), "{}", ok);
        }
        for no in ["llama-cli.exe", "llama-cli-impl.dll", "llama-quantize.exe", "../evil.dll", "sub/llama.dll"] {
            assert!(!is_engine_file(no), "{}", no);
        }
    }

    #[test]
    fn sse_lines_keep_multibyte_characters_whole() {
        let text = "data: {\"t\":\"réunion\"}\n".as_bytes();
        let cut = text.iter().position(|&b| b == 0xC3).unwrap() + 1; // au milieu du « é »
        let mut buf = text[..cut].to_vec();
        assert!(take_lines(&mut buf).is_empty());
        buf.extend_from_slice(&text[cut..]);
        assert_eq!(take_lines(&mut buf), ["data: {\"t\":\"réunion\"}"]);
        assert!(buf.is_empty());
    }
}
