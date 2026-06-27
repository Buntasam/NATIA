use tauri::{Emitter, State};
use uuid::Uuid;

use crate::AppState;
use crate::crypto::maybe_dec;

// ─── Ollama commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ollama_test_simple(base_url: String, model: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Réponds juste le mot: OK"}],
        "stream": false
    });
    let resp = client
        .post(format!("{}/api/chat", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Connexion impossible : {}", e))?;
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama erreur: {}", body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["message"]["content"].as_str().unwrap_or("(vide)").to_string())
}

#[tauri::command]
pub async fn ollama_chat(
    base_url: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": message}],
        "stream": false,
        "options": { "temperature": temperature }
    });
    let resp = client
        .post(format!("{}/api/chat", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Connexion impossible : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama {}: {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["message"]["content"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
pub async fn ollama_models(base_url: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/tags", base_url))
        .send()
        .await
        .map_err(|e| format!("Impossible de contacter Ollama : {}", e))?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = json["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["name"].as_str().map(String::from))
        .collect();
    Ok(models)
}

#[tauri::command]
pub async fn ollama_stream(
    app: tauri::AppHandle,
    base_url: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
    history: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({"role": "system", "content": system}),
    ];
    if let Some(hist) = history { messages.extend(hist); }
    messages.push(serde_json::json!({"role": "user", "content": message}));
    let payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "options": { "temperature": temperature }
    });
    let mut resp = client
        .post(format!("{}/api/chat", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Ollama : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama a répondu {} : {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() { continue; }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(content) = json["message"]["content"].as_str() {
                    if !content.is_empty() { let _ = app.emit("ollama-token", content.to_string()); }
                }
                if json["done"].as_bool().unwrap_or(false) {
                    let _ = app.emit("ollama-done", "");
                    return Ok(());
                }
            }
        }
    }
    let _ = app.emit("ollama-done", "");
    Ok(())
}

#[tauri::command]
pub async fn ollama_pull(app: tauri::AppHandle, base_url: String, model: String) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "model": model, "stream": true });
    let mut resp = client
        .post(format!("{}/api/pull", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Connexion impossible : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama {}: {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() { continue; }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                let status = json["status"].as_str().unwrap_or("").to_string();
                let total = json["total"].as_u64().unwrap_or(0);
                let completed = json["completed"].as_u64().unwrap_or(0);
                let percent = if total > 0 { (completed * 100) / total } else { 0 };
                let _ = app.emit("ollama-pull-progress", serde_json::json!({
                    "status": status, "total": total, "completed": completed, "percent": percent,
                }));
                if status == "success" { return Ok(()); }
            }
        }
    }
    Ok(())
}

// ─── Claude API commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn claude_chat(
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "model": model, "max_tokens": 4096, "system": system,
        "temperature": temperature.clamp(0.0, 1.0),
        "messages": [{"role": "user", "content": message}],
    });
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Claude API : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Claude {} : {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["content"][0]["text"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
pub async fn claude_stream(
    app: tauri::AppHandle,
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
    history: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut messages: Vec<serde_json::Value> = vec![];
    if let Some(hist) = history { messages.extend(hist); }
    messages.push(serde_json::json!({"role": "user", "content": message}));
    let payload = serde_json::json!({
        "model": model, "max_tokens": 4096, "system": system,
        "temperature": temperature.clamp(0.0, 1.0),
        "messages": messages, "stream": true,
    });
    let mut resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Claude API : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Claude {} : {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") { continue; }
            let data = line["data:".len()..].trim();
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                match json["type"].as_str().unwrap_or("") {
                    "content_block_delta" => {
                        if let Some(text) = json["delta"]["text"].as_str() {
                            if !text.is_empty() { let _ = app.emit("ollama-token", text.to_string()); }
                        }
                    }
                    "message_stop" => { let _ = app.emit("ollama-done", ""); return Ok(()); }
                    _ => {}
                }
            }
        }
    }
    let _ = app.emit("ollama-done", "");
    Ok(())
}

// ─── Image generation ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_image(api_key: String, prompt: String, size: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "dall-e-3", "prompt": prompt, "n": 1,
        "size": size, "response_format": "b64_json"
    });
    let resp = client
        .post("https://api.openai.com/v1/images/generations")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(text);
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let b64 = json["data"][0]["b64_json"].as_str().unwrap_or("").to_string();
    Ok(format!("data:image/png;base64,{}", b64))
}

// ─── OpenAI API commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn openai_chat(
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "model": model, "temperature": temperature,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": message}],
    });
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur OpenAI : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI {} : {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
pub async fn openai_stream(
    app: tauri::AppHandle,
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
    history: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut messages: Vec<serde_json::Value> = vec![serde_json::json!({"role": "system", "content": system})];
    if let Some(hist) = history { messages.extend(hist); }
    messages.push(serde_json::json!({"role": "user", "content": message}));
    let payload = serde_json::json!({ "model": model, "temperature": temperature, "messages": messages, "stream": true });
    let mut resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur OpenAI : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI {} : {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") { continue; }
            let data = line["data:".len()..].trim();
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

// ─── Gemini API commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn gemini_chat(
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );
    let payload = serde_json::json!({
        "system_instruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [{ "text": message }] }],
        "generationConfig": { "temperature": temperature },
    });
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Gemini API : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini {} : {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
pub async fn gemini_stream(
    app: tauri::AppHandle,
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
    history: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
        model, api_key
    );
    let mut contents: Vec<serde_json::Value> = vec![];
    if let Some(hist) = history {
        for h in hist {
            let role = if h["role"].as_str().unwrap_or("") == "assistant" { "model" } else { "user" };
            contents.push(serde_json::json!({ "role": role, "parts": [{ "text": h["content"].as_str().unwrap_or("") }] }));
        }
    }
    contents.push(serde_json::json!({ "role": "user", "parts": [{ "text": message }] }));
    let payload = serde_json::json!({
        "system_instruction": { "parts": [{ "text": system }] },
        "contents": contents,
        "generationConfig": { "temperature": temperature },
    });
    let mut resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Gemini API : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini {} : {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") { continue; }
            let data = line["data:".len()..].trim();
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(text) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                    if !text.is_empty() { let _ = app.emit("ollama-token", text.to_string()); }
                }
            }
        }
    }
    let _ = app.emit("ollama-done", "");
    Ok(())
}

// ─── Mistral API commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn mistral_chat(
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "model": model, "temperature": temperature.min(1.0),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": message}],
    });
    let resp = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Mistral API : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Mistral {} : {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
pub async fn mistral_stream(
    app: tauri::AppHandle,
    api_key: String,
    model: String,
    system: String,
    message: String,
    temperature: f64,
    history: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut messages: Vec<serde_json::Value> = vec![serde_json::json!({"role": "system", "content": system})];
    if let Some(hist) = history { messages.extend(hist); }
    messages.push(serde_json::json!({"role": "user", "content": message}));
    let payload = serde_json::json!({
        "model": model, "temperature": temperature.min(1.0), "messages": messages, "stream": true,
    });
    let mut resp = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Mistral API : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Mistral {} : {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") { continue; }
            let data = line["data:".len()..].trim();
            if data == "[DONE]" { let _ = app.emit("ollama-done", ""); return Ok(()); }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(t) = json["choices"][0]["delta"]["content"].as_str() {
                    if !t.is_empty() { let _ = app.emit("ollama-token", t.to_string()); }
                }
            }
        }
    }
    let _ = app.emit("ollama-done", "");
    Ok(())
}

// ─── Connection-based API dispatch ────────────────────────────────────────────

fn default_model_for_provider(p: &str) -> &'static str {
    match p.to_lowercase().as_str() {
        "anthropic" | "claude" => "claude-haiku-4-5-20251001",
        "gemini" => "gemini-2.0-flash",
        "mistral" => "mistral-small-latest",
        "groq" => "llama-3.1-8b-instant",
        _ => "gpt-4o-mini",
    }
}

#[tauri::command]
pub async fn connection_chat(
    connection_id: String,
    system: String,
    message: String,
    temperature: f64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let (provider, raw_key, stored_model) = {
        let enc = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let (p, k, m) = db.query_row(
            "SELECT provider, key_value, model FROM api_keys WHERE id=?1",
            [&connection_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
        ).map_err(|_| "Connexion introuvable".to_string())?;
        (maybe_dec(&enc, &p), maybe_dec(&enc, &k), m)
    };
    let model = if stored_model.is_empty() { default_model_for_provider(&provider).to_string() } else { stored_model };
    let temp = temperature.clamp(0.0, 1.0);
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|e| e.to_string())?;

    match provider.to_lowercase().as_str() {
        "anthropic" | "claude" => {
            let payload = serde_json::json!({
                "model": model, "max_tokens": 4096, "system": system, "temperature": temp,
                "messages": [{"role": "user", "content": message}],
            });
            let resp = client.post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &raw_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&payload).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() { return Err(resp.text().await.unwrap_or_default()); }
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json["content"][0]["text"].as_str().unwrap_or("").to_string())
        }
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                model, raw_key
            );
            let payload = serde_json::json!({
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": message}]}],
                "generationConfig": {"temperature": temp},
            });
            let resp = client.post(&url).json(&payload).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() { return Err(resp.text().await.unwrap_or_default()); }
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string())
        }
        p => {
            let api_url = match p {
                "mistral" => "https://api.mistral.ai/v1/chat/completions",
                "groq"    => "https://api.groq.com/openai/v1/chat/completions",
                _         => "https://api.openai.com/v1/chat/completions",
            };
            let payload = serde_json::json!({
                "model": model, "temperature": temp.min(1.0),
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": message}],
            });
            let resp = client.post(api_url)
                .header("Authorization", format!("Bearer {}", raw_key))
                .header("Content-Type", "application/json")
                .json(&payload).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() { return Err(resp.text().await.unwrap_or_default()); }
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string())
        }
    }
}

#[tauri::command]
pub async fn connection_stream(
    app: tauri::AppHandle,
    connection_id: String,
    system: String,
    message: String,
    history: Vec<serde_json::Value>,
    temperature: f64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (provider, raw_key, stored_model) = {
        let enc = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let (p, k, m) = db.query_row(
            "SELECT provider, key_value, model FROM api_keys WHERE id=?1",
            [&connection_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
        ).map_err(|_| "Connexion introuvable".to_string())?;
        (maybe_dec(&enc, &p), maybe_dec(&enc, &k), m)
    };
    let model = if stored_model.is_empty() { default_model_for_provider(&provider).to_string() } else { stored_model };
    let temp = temperature.clamp(0.0, 1.0);
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().map_err(|e| e.to_string())?;

    match provider.to_lowercase().as_str() {
        "anthropic" | "claude" => {
            let mut msgs: Vec<serde_json::Value> = history.iter().filter_map(|m| {
                let role = m.get("role")?.as_str()?;
                let content = m.get("content")?.as_str()?;
                let r = if role == "ai" { "assistant" } else { "user" };
                Some(serde_json::json!({"role": r, "content": content}))
            }).collect();
            msgs.push(serde_json::json!({"role": "user", "content": message}));
            let payload = serde_json::json!({
                "model": model, "max_tokens": 4096, "stream": true,
                "system": system, "temperature": temp, "messages": msgs,
            });
            let mut resp = client.post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &raw_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&payload).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() { let _ = app.emit("ollama-done", ""); return Err(resp.text().await.unwrap_or_default()); }
            let mut buf = String::new();
            while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
                buf.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(pos) = buf.find('\n') {
                    let line = buf[..pos].trim().to_string();
                    buf = buf[pos + 1..].to_string();
                    if !line.starts_with("data:") { continue; }
                    let data = line["data:".len()..].trim();
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(t) = json["delta"]["text"].as_str() {
                            if !t.is_empty() { let _ = app.emit("ollama-token", t.to_string()); }
                        }
                        if json["type"].as_str() == Some("message_stop") {
                            let _ = app.emit("ollama-done", ""); return Ok(());
                        }
                    }
                }
            }
        }
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
                model, raw_key
            );
            let payload = serde_json::json!({
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": message}]}],
                "generationConfig": {"temperature": temp},
            });
            let mut resp = client.post(&url).json(&payload).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() { let _ = app.emit("ollama-done", ""); return Err(resp.text().await.unwrap_or_default()); }
            let mut buf = String::new();
            while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
                buf.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(pos) = buf.find('\n') {
                    let line = buf[..pos].trim().to_string();
                    buf = buf[pos + 1..].to_string();
                    if !line.starts_with("data:") { continue; }
                    let data = line["data:".len()..].trim();
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(t) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                            if !t.is_empty() { let _ = app.emit("ollama-token", t.to_string()); }
                        }
                    }
                }
            }
        }
        p => {
            let api_url = match p {
                "mistral" => "https://api.mistral.ai/v1/chat/completions",
                "groq"    => "https://api.groq.com/openai/v1/chat/completions",
                _         => "https://api.openai.com/v1/chat/completions",
            };
            let mut msgs: Vec<serde_json::Value> = vec![serde_json::json!({"role": "system", "content": system})];
            for m in &history {
                let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("user");
                let content = m.get("content").and_then(|c| c.as_str()).unwrap_or("");
                let r = if role == "ai" { "assistant" } else { "user" };
                msgs.push(serde_json::json!({"role": r, "content": content}));
            }
            msgs.push(serde_json::json!({"role": "user", "content": message}));
            let payload = serde_json::json!({
                "model": model, "temperature": temp.min(1.0), "stream": true, "messages": msgs,
            });
            let mut resp = client.post(api_url)
                .header("Authorization", format!("Bearer {}", raw_key))
                .header("Content-Type", "application/json")
                .json(&payload).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() { let _ = app.emit("ollama-done", ""); return Err(resp.text().await.unwrap_or_default()); }
            let mut buf = String::new();
            while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
                buf.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(pos) = buf.find('\n') {
                    let line = buf[..pos].trim().to_string();
                    buf = buf[pos + 1..].to_string();
                    if line.is_empty() || !line.starts_with("data:") { continue; }
                    let data = line["data:".len()..].trim();
                    if data == "[DONE]" { let _ = app.emit("ollama-done", ""); return Ok(()); }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(t) = json["choices"][0]["delta"]["content"].as_str() {
                            if !t.is_empty() { let _ = app.emit("ollama-token", t.to_string()); }
                        }
                    }
                }
            }
        }
    }
    let _ = app.emit("ollama-done", "");
    Ok(())
}

// ─── Claude CLI ───────────────────────────────────────────────────────────────

fn build_claude_cli_prompt(system: &str, history: &[serde_json::Value], message: &str) -> String {
    let mut p = String::new();
    if !system.trim().is_empty() {
        p.push_str("[Instructions]\n");
        p.push_str(system.trim());
        p.push_str("\n\n");
    }
    let hist: Vec<_> = history.iter().filter_map(|m| {
        let role = m.get("role")?.as_str()?;
        let content = m.get("content")?.as_str()?;
        Some((role.to_string(), content.to_string()))
    }).collect();
    if !hist.is_empty() {
        p.push_str("[Conversation]\n");
        for (role, content) in &hist {
            let label = if role == "user" { "Utilisateur" } else { "Assistant" };
            p.push_str(&format!("{} : {}\n\n", label, content));
        }
    }
    p.push_str(message.trim());
    p
}

#[tauri::command]
pub async fn check_claude_cli() -> Result<String, String> {
    use tokio::process::Command;
    #[cfg(windows)]
    let output = Command::new("cmd")
        .args(["/C", "claude", "--version"])
        .output().await
        .map_err(|_| "claude CLI introuvable".to_string())?;
    #[cfg(not(windows))]
    let output = Command::new("claude")
        .arg("--version")
        .output().await
        .map_err(|_| "claude CLI introuvable".to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("claude CLI non trouvé ou non authentifié".to_string())
    }
}

#[tauri::command]
pub async fn claude_cli_chat(system: String, message: String) -> Result<String, String> {
    use tokio::process::Command;
    use std::process::Stdio;
    let prompt = build_claude_cli_prompt(&system, &[], &message);
    #[cfg(windows)]
    let output = {
        let tmp = std::env::temp_dir().join(format!("natia_{}.txt", Uuid::new_v4()));
        std::fs::write(&tmp, prompt.as_bytes()).map_err(|e| e.to_string())?;
        let where_out = Command::new("cmd").args(["/C", "where claude"]).output().await
            .map_err(|e| format!("Impossible de trouver claude CLI : {e}"))?;
        let where_str = String::from_utf8_lossy(&where_out.stdout);
        let claude_bin = where_str.lines()
            .find(|l| l.trim().ends_with(".cmd"))
            .or_else(|| where_str.lines().find(|l| !l.trim().is_empty()))
            .unwrap_or("claude").trim().to_string();
        let file = std::fs::File::open(&tmp).map_err(|e| e.to_string())?;
        let result = Command::new("cmd")
            .args(["/C", &claude_bin, "--print"])
            .stdin(std::process::Stdio::from(file))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output().await
            .map_err(|e| format!("Impossible de lancer claude CLI : {e}"))?;
        let _ = std::fs::remove_file(&tmp);
        result
    };
    #[cfg(not(windows))]
    let output = {
        use tokio::io::AsyncWriteExt;
        let mut child = Command::new("claude")
            .arg("--print")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Impossible de lancer claude CLI : {e}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(prompt.as_bytes()).await.map_err(|e| e.to_string())?;
        }
        child.wait_with_output().await
            .map_err(|e| format!("Impossible de lancer claude CLI : {e}"))?
    };
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("claude CLI : {err}"));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn claude_cli_stream(
    app: tauri::AppHandle,
    system: String,
    message: String,
    history: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;
    use std::process::Stdio;
    let hist = history.unwrap_or_default();
    let prompt = build_claude_cli_prompt(&system, &hist, &message);
    #[cfg(windows)]
    let mut child = {
        let tmp = std::env::temp_dir().join(format!("natia_{}.txt", Uuid::new_v4()));
        std::fs::write(&tmp, prompt.as_bytes()).map_err(|e| e.to_string())?;
        let where_out = Command::new("cmd").args(["/C", "where claude"]).output().await
            .map_err(|e| format!("Impossible de trouver claude CLI : {e}"))?;
        let where_str = String::from_utf8_lossy(&where_out.stdout);
        let claude_bin = where_str.lines()
            .find(|l| l.trim().ends_with(".cmd"))
            .or_else(|| where_str.lines().find(|l| !l.trim().is_empty()))
            .unwrap_or("claude").trim().to_string();
        let file = std::fs::File::open(&tmp).map_err(|e| e.to_string())?;
        let c = Command::new("cmd")
            .args(["/C", &claude_bin, "--print"])
            .stdin(std::process::Stdio::from(file))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Impossible de lancer claude CLI : {e}"))?;
        let _ = std::fs::remove_file(&tmp);
        c
    };
    #[cfg(not(windows))]
    let mut child = {
        let mut c = Command::new("claude")
            .arg("--print")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Impossible de lancer claude CLI : {e}"))?;
        if let Some(mut stdin) = c.stdin.take() {
            stdin.write_all(prompt.as_bytes()).await.map_err(|e| e.to_string())?;
        }
        c
    };
    if let Some(mut stdout) = child.stdout.take() {
        let mut buf = vec![0u8; 512];
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => { let _ = app.emit("ollama-token", String::from_utf8_lossy(&buf[..n]).to_string()); }
                Err(_) => break,
            }
        }
    }
    child.wait().await.map_err(|e| e.to_string())?;
    let _ = app.emit("ollama-done", "");
    Ok(())
}
