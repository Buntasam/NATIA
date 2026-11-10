// Lecture du texte des images et des PDF scannés (OCR), pour la recherche.
//
// On utilise l'OCR intégré à Windows (Windows.Media.Ocr) et son moteur de rendu PDF
// (Windows.Data.Pdf) : rien à télécharger, tout reste sur le PC. Les langues reconnues
// sont celles installées dans Windows (Paramètres → Heure et langue).
//
// Ces composants de Windows peuvent planter sur un fichier abîmé (violation d'accès, que
// Rust ne peut pas rattraper). L'OCR tourne donc dans un processus à part : NATIA se
// relance elle-même avec `--ocr-worker`, lui passe le fichier et lit le texte. Si ce
// processus plante, le fichier n'a simplement pas de texte ; l'application continue.

use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Pages lues au plus dans un PDF scanné : au-delà, la lecture prendrait trop de temps.
pub const MAX_PDF_PAGES: u32 = 15;
/// Argument qui fait démarrer NATIA en lecteur OCR, sans fenêtre.
pub const WORKER_ARG: &str = "--ocr-worker";
const TIMEOUT: Duration = Duration::from_secs(90);

/// Texte d'une image (PNG, JPEG, BMP, GIF, TIFF). Vide si rien n'est lisible.
pub fn image_text(bytes: &[u8]) -> String {
    run_worker("image", bytes)
}

/// Texte des premières pages d'un PDF, lues comme des images (PDF scanné).
pub fn pdf_text(bytes: &[u8]) -> String {
    run_worker("pdf", bytes)
}

fn run_worker(kind: &str, bytes: &[u8]) -> String {
    (|| -> Option<String> {
        let exe = std::env::current_exe().ok()?;
        let mut cmd = Command::new(exe);
        cmd.args([WORKER_ARG, kind]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = cmd.spawn().ok()?;
        let mut stdin = child.stdin.take()?;
        let data = bytes.to_vec();
        let writer = std::thread::spawn(move || { let _ = stdin.write_all(&data); });
        let mut stdout = child.stdout.take()?;
        let reader = std::thread::spawn(move || { let mut s = String::new(); let _ = stdout.read_to_string(&mut s); s });
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let _ = writer.join();
                    let text = reader.join().unwrap_or_default();
                    return status.success().then_some(text);
                }
                Ok(None) if start.elapsed() < TIMEOUT => std::thread::sleep(Duration::from_millis(50)),
                _ => { let _ = child.kill(); return None; }
            }
        }
    })()
    .unwrap_or_default()
}

/// Point d'entrée du processus OCR (`natia --ocr-worker image|pdf`) : lit le fichier sur
/// l'entrée standard, écrit le texte sur la sortie standard. Appelé par main() avant Tauri.
pub fn worker_main(kind: &str) {
    let mut bytes = Vec::new();
    if std::io::stdin().read_to_end(&mut bytes).is_err() { return; }
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let text = match kind {
        "pdf" => imp::pdf_text(&bytes, MAX_PDF_PAGES),
        _ => imp::image_text(&bytes),
    };
    let _ = std::io::stdout().write_all(text.as_bytes());
}

#[cfg(windows)]
mod imp {
    use windows::core::{Interface, Result};
    use windows::Data::Pdf::{PdfDocument, PdfPageRenderOptions};
    use windows::Graphics::Imaging::{
        BitmapAlphaMode, BitmapDecoder, BitmapInterpolationMode, BitmapPixelFormat, BitmapTransform,
        ColorManagementMode, ExifOrientationMode,
    };
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, IRandomAccessStream, InMemoryRandomAccessStream};

    fn stream_from(bytes: &[u8]) -> Result<IRandomAccessStream> {
        let stream = InMemoryRandomAccessStream::new()?;
        let writer = DataWriter::CreateDataWriter(&stream)?;
        writer.WriteBytes(bytes)?;
        writer.StoreAsync()?.get()?;
        writer.FlushAsync()?.get()?;
        writer.DetachStream()?;
        stream.Seek(0)?;
        stream.cast()
    }

    fn engine() -> Result<OcrEngine> {
        OcrEngine::TryCreateFromUserProfileLanguages()
    }

    /// Une image décodée, réduite si elle dépasse la taille que l'OCR accepte.
    fn recognize(engine: &OcrEngine, stream: &IRandomAccessStream) -> Result<String> {
        let decoder = BitmapDecoder::CreateAsync(stream)?.get()?;
        let (w, h) = (decoder.PixelWidth()?, decoder.PixelHeight()?);
        let max = OcrEngine::MaxImageDimension()?;
        let transform = BitmapTransform::new()?;
        if w > max || h > max {
            let scale = max as f64 / w.max(h) as f64;
            transform.SetScaledWidth(((w as f64 * scale) as u32).max(1))?;
            transform.SetScaledHeight(((h as f64 * scale) as u32).max(1))?;
            transform.SetInterpolationMode(BitmapInterpolationMode::Fant)?;
        }
        let bitmap = decoder
            .GetSoftwareBitmapTransformedAsync(
                BitmapPixelFormat::Bgra8,
                BitmapAlphaMode::Premultiplied,
                &transform,
                ExifOrientationMode::RespectExifOrientation,
                ColorManagementMode::DoNotColorManage,
            )?
            .get()?;
        Ok(engine.RecognizeAsync(&bitmap)?.get()?.Text()?.to_string())
    }

    pub fn image_text(bytes: &[u8]) -> String {
        (|| -> Result<String> {
            let engine = engine()?;
            recognize(&engine, &stream_from(bytes)?)
        })()
        .unwrap_or_default()
    }

    pub fn pdf_text(bytes: &[u8], max_pages: u32) -> String {
        (|| -> Result<String> {
            let engine = engine()?;
            let doc = PdfDocument::LoadFromStreamAsync(&stream_from(bytes)?)?.get()?;
            let mut text = String::new();
            for i in 0..doc.PageCount()?.min(max_pages) {
                let page = doc.GetPage(i)?;
                let out = InMemoryRandomAccessStream::new()?;
                // Assez grand pour lire un texte courant, sans dépasser la limite de l'OCR.
                let opts = PdfPageRenderOptions::new()?;
                opts.SetDestinationWidth(2000)?;
                page.RenderWithOptionsToStreamAsync(&out, &opts)?.get()?;
                out.Seek(0)?;
                if let Ok(t) = recognize(&engine, &out.cast()?) {
                    if !t.trim().is_empty() { text.push_str(&t); text.push('\n'); }
                }
            }
            Ok(text)
        })()
        .unwrap_or_default()
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn image_text(_: &[u8]) -> String { String::new() }
    pub fn pdf_text(_: &[u8], _: u32) -> String { String::new() }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Dans les tests, `current_exe()` est le programme de test, pas NATIA : le processus
    // OCR ne lit rien et le texte reste vide, sans planter.
    #[test]
    fn a_missing_worker_gives_no_text() {
        assert_eq!(image_text(b"pas une image"), "");
    }

    /// Vérification manuelle du moteur OCR de Windows (français installé), dans ce processus :
    /// NATIA_OCR_SAMPLE=chemin/sans/extension cargo test --lib ocr -- --ignored
    #[test]
    #[ignore]
    fn reads_a_real_image_and_scanned_pdf() {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let base = std::env::var("NATIA_OCR_SAMPLE").expect("NATIA_OCR_SAMPLE");
        let img = imp::image_text(&std::fs::read(format!("{base}.png")).unwrap());
        assert!(img.contains("4521"), "image : {img:?}");
        let pdf = imp::pdf_text(&std::fs::read(format!("{base}.pdf")).unwrap(), MAX_PDF_PAGES);
        assert!(pdf.contains("4521"), "pdf : {pdf:?}");
    }
}
