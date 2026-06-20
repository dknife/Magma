# Genesis Magma — macOS 네이티브 빌드 (Tauri v2)

이 앱(정적 WebGL/Three.js 페이지)을 시스템 WebView(WKWebView)로 감싸 macOS `.app` / `.dmg` 로 만든다.
무거운 Chromium 을 넣는 Electron 과 달리 결과물이 작다(보통 수~십수 MB).

## 사전 준비 (한 번만)

```bash
# 1) Xcode 커맨드라인 도구(없으면)
xcode-select --install

# 2) Rust 설치(Tauri 는 Rust 로 빌드됨)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"     # 새 셸을 열거나 이 명령으로 PATH 반영

# 3) JS 의존성(@tauri-apps/cli) 설치
npm install

# 4) 앱 아이콘 생성(정사각형 PNG 1024px 권장 → 여기선 타이틀 일러스트 사용)
npm run tauri icon illust/title_main.png
#   → src-tauri/icons/ 에 icns/ico/png 들이 생성됨(설정에서 참조)
```

## 개발 실행 (창에서 바로 확인)

```bash
npm run tauri:dev
```
- 내부적으로 `node server.js`(:5173)를 띄우고 그 화면을 네이티브 창에 로드한다.
  (개발 중에는 실제 http 오리진이라 GLB/CDN/오디오가 웹과 동일하게 동작)

## 배포 빌드 (.app / .dmg)

```bash
npm run tauri:build
```
- 빌드 전 `scripts/copy-web.mjs` 가 실제 사용하는 파일만 `dist/` 로 추려 번들한다
  (node_modules·.git·비압축 원본 `.glb` 제외 → 용량 최소화).
- 결과물: `src-tauri/target/release/bundle/macos/Genesis Magma.app`,
  `src-tauri/target/release/bundle/dmg/Genesis Magma_0.1.0_*.dmg`

## 알아둘 점

- **인터넷 필요(현재 구성)**: Three.js 와 Draco 디코더를 jsdelivr CDN 에서 로드한다
  (`index.html` 의 import map, `src/main.js` 의 `DRACOLoader.setDecoderPath`).
  완전 오프라인 앱으로 만들려면 이 둘을 로컬에 번들하고 경로를 로컬로 바꾸면 된다(원하면 작업 가능).
- **CSP**: 단순화를 위해 `tauri.conf.json` 에서 `app.security.csp` 를 `null`(비활성)로 두었다.
  CDN·인라인 스크립트·Draco 워커가 모두 허용된다. 더 엄격히 하려면 CSP 를 명시하고 CDN 을 로컬 번들로 대체.
- **코드 서명/공증**: 다른 Mac 에 배포하려면 Apple Developer 서명·notarization 이 필요할 수 있다
  (개인 사용/직접 실행은 우클릭→열기로 가능).
- **서버 불필요(배포본)**: 번들된 앱은 `tauri://` 프로토콜로 에셋을 제공하므로 `server.js` 없이 GLB 가 로드된다.
