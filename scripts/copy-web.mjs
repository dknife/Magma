// Tauri 번들용 정적 프런트엔드 모으기.
// frontendDist 를 repo 루트로 두면 node_modules·.git·비압축 원본(.glb) 까지 통째로
// 들어가므로, 실제 앱이 쓰는 파일만 dist/ 로 추려 복사한다(빌드 전 자동 실행).
import { cp, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1) 단일 파일/폴더 그대로 복사(.DS_Store 등 잡파일 제외)
const noJunk = (src) => !src.endsWith('.DS_Store');
for (const name of ['index.html', 'src', 'illust']) {
  const from = join(root, name);
  if (existsSync(from)) await cp(from, join(dist, name), { recursive: true, filter: noJunk });
}

// 2) meshes: 앱이 실제로 로드하는 압축본(*.opt.glb)만 복사(원본 *.glb 제외 — 용량 큼)
await mkdir(join(dist, 'meshes'), { recursive: true });
for (const f of await readdir(join(root, 'meshes'))) {
  if (f.endsWith('.opt.glb')) await cp(join(root, 'meshes', f), join(dist, 'meshes', f));
}

// 3) 루트의 오디오 파일(*.mp3) 복사
for (const f of await readdir(root)) {
  if (extname(f) === '.mp3') await cp(join(root, f), join(dist, f));
}

console.log('[copy-web] dist/ 준비 완료');
