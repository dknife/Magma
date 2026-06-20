// 릴리스 빌드에서 콘솔 창이 뜨지 않도록(주로 Windows). macOS 에는 영향 없음.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 순수 WebView 래퍼: 별도 Rust 커맨드 없이 프런트엔드(index.html)를 그대로 띄운다.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Genesis Magma");
}
