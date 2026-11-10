#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // NATIA relancée en lecteur OCR (voir ocr.rs) : lit un fichier, écrit son texte, s'arrête.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some(natia_lib::ocr::WORKER_ARG) {
        natia_lib::ocr::worker_main(args.get(2).map(String::as_str).unwrap_or("image"));
        return;
    }
    natia_lib::run();
}
