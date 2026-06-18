import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

// ---------------------------------------------------------------------------
// 기본 설정값
// ---------------------------------------------------------------------------
const MODEL_URL = './meshes/GenesisMagma.opt.glb'; // Draco 지오메트리 + WebP 텍스처 압축본
const RACEWAY_URL = './meshes/Raceway.opt.glb';     // 트랙 둘레 배치용 압축본(Draco + WebP)
const RACEWAY_COUNT = 24;            // 트랙 둘레에 늘어놓을 레이스웨이 메쉬 개수
const RACEWAY_FILL = 0.9;            // 인접 메쉬 간격 대비 한 개가 차지하는 길이 비(겹침/틈 조절)
const RACEWAY_SCALE = 2.0;           // 기본 크기 배율(둘레 간격 기준) — 두 배로 키움
const RACEWAY_SCALE_JITTER = 0.35;   // 개체별 크기 무작위 변동(±비율) — 불규칙하게
const RACEWAY_MARGIN = 1.2;          // 도로 가장자리에서 바깥으로 띄우는 기본량(roadHalfWidth 배수, 간섭 방지)
const RACEWAY_RADIAL_JITTER = 1.0;   // 바깥 거리 개체별 무작위 추가량(roadHalfWidth 배수)
const RACEWAY_POS_JITTER = 0.8;      // 둘레 위치 무작위 변동(슬롯 간격 대비 비율) — 불규칙한 간격
const RACEWAY_YAW_OFFSET = 0;        // 메쉬 진행축이 트랙과 안 맞으면 Math.PI/2 등으로 보정
const RACEWAY_YAW_JITTER = Math.PI;  // 개체별 무작위 회전 범위(±rad) — 똑같은 모습 방지
const TOYOTA_URL = './meshes/Toyota.opt.glb';       // 트랙 전체를 도는 교통(traffic) 차량(압축본)
const TOYOTA_COUNT = 20;                            // 트랙에 흩뿌릴 Toyota 대수
const TREE_URL = './meshes/tree.opt.glb';           // 트랙 안팎 조경용 나무(압축본)
const TREE_COUNT = 140;                             // 트랙 안팎에 흩뿌릴 나무 그루 수
const TREE_SIZE_FACTOR = 1.4;                       // 나무 높이 기준 크기(roadHalfWidth 배수, 스케일 1 기준)
const TREE_SCALE_MIN = 1.0;                         // 나무 개체별 최소 스케일 배율
const TREE_SCALE_MAX = 2.0;                         // 나무 개체별 최대 스케일 배율(크고 작게 무작위)
const TREE_CLEARANCE = 1.2;                         // 도로 가장자리에서 비워둘 거리(roadHalfWidth 배수)
const TREE_FIELD_FACTOR = 1.25;                     // 나무를 흩뿌릴 영역 반경(trackRadius 배수, 안팎 포함)
const CLOUD_COUNT = 18;                             // 하늘에 띄울 뭉게구름 수
const TOYOTA_SPEED_RATIO = 0.9;                     // 주인공 대비 속도. 높일수록 상대속도↓ → 천천히 지나감
const GROUND_SIZE = 1600;   // 그림자받이 바닥 평면 한 변 길이 (월드 단위)
const MAX_DIAMONDS = 5;     // 시작 다이아몬드(생명) 수
// 모바일 판별 — 모바일은 카메라를 조금 더 멀리(뒤에서 관찰)
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const SCENE_EXPOSURE = 0.5;       // 기본 노출(대폭 낮춤 — 하늘이 청명한 진파랑이 되도록)
const PAUSE_DARK_EXPOSURE = 0.3; // 정지/게임오버 시 배경 어둡게(밝기 절반)
const SPEED_MAX_KMH = 345;      // 측정 기준: drive.maxSpeed ↔ 345 km/h
const SPEED_DISPLAY_MULT = 1.0; // 표시값 = 측정 속도 그대로(뻥튀기 없음)

// ---------------------------------------------------------------------------
// 렌더러
// ---------------------------------------------------------------------------
const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = SCENE_EXPOSURE; // 전체적으로 조금 더 밝게
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---------------------------------------------------------------------------
// 씬 / 카메라
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x294a73); // Sky 메쉬가 덮음(로드 전 폴백) — 푸른 톤
scene.fog = new THREE.Fog(0x5b90cf, 1400, 5200); // 맑은 하늘색(azure) — 먼 곳을 청명한 하늘에 블렌드

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.4,
  8000 // 먼 곳에 고정한 구름/하늘 틴트까지 보이도록 충분히 멀게
);
camera.position.set(8, 6, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495; // 지면 아래로 못 내려가게
controls.minPolarAngle = Math.PI / 4;     // 고도각 45° 제한(너무 위에서 내려다보지 않게)
controls.target.set(0, 1, 0);

// ---------------------------------------------------------------------------
// 조명
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b7a52, 1.3); // 밝은 하늘색 / 풀빛 지면 반사(한낮, 살짝 낮춤)
scene.add(hemi);

// 큰 트랙에서도 그림자가 선명하도록, 태양광은 차를 따라다니게 한다.
// (그림자 카메라 영역을 차 주변으로 좁게 유지 → 높은 해상도)
// 저녁 무렵: 태양을 지평선 쪽으로 낮춰 긴 그림자 + 노을빛
const SUN_OFFSET = new THREE.Vector3(110, 75, 70); // 차 기준 태양 위치(중저고도 ≈ 30°)
const sun = new THREE.DirectionalLight(0xffe2b8, 2.8); // 따뜻한 저녁 햇살(골든)
sun.position.copy(SUN_OFFSET);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0002;
scene.add(sun);
scene.add(sun.target); // 차를 향하도록 매 프레임 갱신

// ---------------------------------------------------------------------------
// Sky-box (절차적 하늘 — 텍스처 불필요)
// ---------------------------------------------------------------------------
const sky = new Sky();
sky.scale.setScalar(450000); // 충분히 크게 (배경 돔)
scene.add(sky);

const skyU = sky.material.uniforms;
// 청명한 푸른 하늘: 탁도↓(맑게) + 레일리(파랑) 적정 + 미 산란↓(태양 주변 흰 헤일로 억제).
// 레일리를 과하게 높이면 하늘 전체가 밝아져 노출에서 하얗게 날아가므로 적정값으로.
skyU['turbidity'].value = 0;
skyU['rayleigh'].value = 3;
skyU['mieCoefficient'].value = 0.002;
skyU['mieDirectionalG'].value = 0.8;
// 하늘의 태양 위치를 조명 방향(SUN_OFFSET, 중저고도)과 일치시켜 그림자와 정합
skyU['sunPosition'].value.copy(SUN_OFFSET).normalize();

// ---------------------------------------------------------------------------
// 뭉게구름 — 절차적(캔버스) 텍스처를 입힌 스프라이트를 하늘에 흩뿌린다.
// ---------------------------------------------------------------------------
// 구름은 카메라를 따라가지 않고 월드에 고정한다. 큰 돔(반구) 표면에 구름 판(plane)을
// 매달고, 각 판이 돔 중심(원점)을 바라보도록 회전시켜 안쪽을 향하게 한다. 카메라가 코스
// 중심 부근을 도므로 어느 위치에서도 구름이 대체로 정면을 향한다.
// 매 호출마다 불규칙한 뭉게구름 실루엣을 생성한다(개수·위치·크기 무작위). 아래는
// 평평하고 위로는 봉긋·울퉁불퉁하게: x 는 넓게 흩고, y 는 바닥선 위쪽에 몰리게 한다.
function makeCloudTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const cx = N * 0.5;
  const baseY = N * 0.62;                                  // 구름 바닥선(아래는 평평)
  // Pass 1 — 밀도 누적: 작은 소프트 덩어리들을 가산 합성(lighter)으로 겹쳐 그린다. 겹칠수록
  // 알파(밀도)가 누적돼 가운데는 두껍고 가장자리는 얇은, 원형 윤곽이 녹은 유기적 형태가 된다.
  g.globalCompositeOperation = 'lighter';
  const puffCount = 44 + Math.floor(Math.random() * 28);  // 아주 많이 → 더 많은 볼륨이 모임
  for (let i = 0; i < puffCount; i++) {
    const x = cx + (Math.random() * 2 - 1) * N * 0.44;     // 가로로 더 넓게
    const y = baseY - Math.abs(Math.random() + Math.random() - 1) * N * 0.4; // 위로 더 봉긋
    const r = N * (0.08 + Math.random() * 0.16);           // 더 큰 덩어리
    const a = 0.12 + Math.random() * 0.16;                 // 낮은 알파 → 겹쳐서 누적
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Pass 2 — 볼륨 음영: 구름이 있는 픽셀에만(source-atop) 위→아래 회색 그라데이션을 덧입혀
  // 상단은 밝게, 하단은 음영지게 한다(중립 회색이라 푸른 기 없음). 알파는 그대로 유지.
  g.globalCompositeOperation = 'source-atop';
  const vg = g.createLinearGradient(0, N * 0.18, 0, N * 0.92);
  vg.addColorStop(0, 'rgba(255,255,255,0)');              // 상단: 그대로 밝게
  vg.addColorStop(1, 'rgba(120,123,128,0.55)');           // 하단: 회색 음영
  g.fillStyle = vg;
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// 서로 다른 모양의 텍스처를 여러 장 만들어 구름마다 무작위로 골라 쓴다(규칙성 제거).
const CLOUD_VARIANTS = 8;
const cloudTexes = [];
for (let i = 0; i < CLOUD_VARIANTS; i++) cloudTexes.push(makeCloudTexture());

const clouds = new THREE.Group(); // 월드 고정(카메라를 따라가지 않음)
scene.add(clouds);
const cloudPlaneGeo = new THREE.PlaneGeometry(1, 1); // 모든 구름 판이 공유
const CLOUD_DOME_RADIUS = 2200;                       // 구름이 매달리는 돔 반경
const cloudCenter = new THREE.Vector3(0, 0, 0);       // 돔 중심(코스 원점)
for (let i = 0; i < CLOUD_COUNT; i++) {
  const mat = new THREE.MeshBasicMaterial({
    map: cloudTexes[Math.floor(Math.random() * CLOUD_VARIANTS)], // 변형 텍스처 무작위
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    color: 0xffffff,                                      // 순백 틴트
    toneMapped: false,                                    // 톤매핑/노출 영향 제거 → 회색 눌림 방지(순백 유지)
    opacity: 1.0,                                         // 본체 불투명 → 파란 하늘이 비쳐 흐려지지 않게(외곽만 텍스처 알파로 부드럽게)
  });
  const m = new THREE.Mesh(cloudPlaneGeo, mat);
  // 돔 표면 좌표: 방위각은 둘레에 고루, 고도각은 지평선 위~돔 상단 부근(8°~72°).
  const az = (i / CLOUD_COUNT) * Math.PI * 2 + Math.random() * 0.6;
  const el = THREE.MathUtils.degToRad(8 + Math.random() * 64);
  const horiz = Math.cos(el) * CLOUD_DOME_RADIUS;
  m.position.set(Math.cos(az) * horiz, Math.sin(el) * CLOUD_DOME_RADIUS, Math.sin(az) * horiz);
  m.lookAt(cloudCenter);                          // 판의 정면(+Z)이 돔 중심을 향함
  m.rotateZ((Math.random() * 2 - 1) * 0.18);      // 정면축 기준 약간의 롤로 변주
  const w = 820 + Math.random() * 900;            // 구름 폭(더 크게)
  m.scale.set(w, w * (0.46 + Math.random() * 0.24), 1); // 가로세로 비율 변주
  clouds.add(m);
}

// 하늘에 cyan 틴트를 깔아 더 푸르게: 카메라를 감싸는 큰 구(BackSide)를 반투명 cyan 으로
// 그려 '먼 배경(하늘)'에만 옅게 덧입힌다. 구름·사물은 구보다 앞에 있어 물들지 않는다.
const skyTint = new THREE.Mesh(
  new THREE.SphereGeometry(4500, 24, 16),
  new THREE.MeshBasicMaterial({
    color: 0x0f8cff, side: THREE.BackSide, transparent: true, opacity: 0.3, // 더 진한 파랑 틴트
    depthWrite: false, fog: false,
  })
);
scene.add(skyTint);

// ---------------------------------------------------------------------------
// 지면 / 그리드 / 축 헬퍼
// ---------------------------------------------------------------------------
// 잔디 노이즈 텍스처(절차적): 픽셀 단위 초록 명암 변주 + 가끔 흙/마른 풀 얼룩으로
// 단조로운 평면을 자연스럽게. 픽셀 노이즈라 타일 반복해도 이음매가 거의 없다.
function makeGroundTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const d = img.data;
  for (let i = 0; i < N * N; i++) {
    const n = Math.random();
    let r = 50 + n * 26;   // 기본 잔디 초록(어둡게~밝게 변주)
    let gr = 104 + n * 44;
    let b = 46 + n * 24;
    const blotch = Math.random();
    if (blotch < 0.05) { r *= 0.65; gr *= 0.6; b *= 0.6; }        // 흙/그늘(어두운 얼룩)
    else if (blotch < 0.09) { r += 34; gr += 20; b -= 4; }        // 마른 풀(누런 기)
    const o = i * 4;
    d[o] = r; d[o + 1] = gr; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(50, 50); // 넓은 바닥에 잘게 반복 → 미세한 잔디 질감
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
// 초록색 바닥(잔디) — 노이즈 텍스처로 자연스럽게, 그림자도 받음
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE * 2, GROUND_SIZE * 2),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1.0, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01; // 트랙 리본(y=0.02) 살짝 아래
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// 차량 리그 + 주행 상태
// ---------------------------------------------------------------------------
// 차량을 부모 그룹(리그)으로 감싼다. 모델 내부에는 중심 정렬·바닥 안착·+X
// 정면 회전이 들어있고, 이 리그를 곡선 위로 옮기고 회전시켜 주행을 구현한다.
const car = new THREE.Group();
scene.add(car);

// 트랙을 도는 Toyota 교통 차량들. 각 항목은 곡선 위 자기 진행값(u)과 차선(lateral)
// 오프셋을 갖고 곡선을 따라 독립적으로 주행한다(주인공 속도의 80%).
const traffic = []; // { rig: THREE.Group, u: number, lateral: number }

const drive = {
  curve: null,    // THREE.CatmullRomCurve3 (닫힌 곡선)
  length: 1,      // 곡선 전체 길이(월드 단위)
  u: 0,           // 곡선 위 기준(목표) 진행 파라미터 [0,1)
  speed: 0,       // 현재 주행 속도(월드 단위/초)
  maxSpeed: 0,    // 직선 최고 속도 — 모델 로드 후 설정
  minSpeed: 0,    // 급코너 최저 속도
  heading: 0,     // 차의 실제 진행 방향(rad) — 관성으로 곡선과 어긋날 수 있음
  grip: 0,        // 최대 횡가속도(접지력). 낮을수록 코너에서 더 밀림
  aimAhead: 0,    // 추격 목표를 곡선상 얼마나 앞에 둘지(u 단위)
  prevSpeed: 0,   // 직전 프레임 속도(감속 감지용)
  boost: 1,       // 부스터 배율(1=평상, 최대 1.2 — 1로 서서히 감쇠)
  active: false,
  // 충돌 → 스핀 → 정지 → 곡선 복귀 상태머신
  state: 'drive',                 // 'drive' | 'spin' | 'recover'
  omega: 0,                       // 스핀 각속도(rad/s, +반시계 / -시계)
  slideSpeed: 0,                  // 스핀 중 미끄러지는 속도(월드 단위/초)
  slideDir: new THREE.Vector3(),  // 미끄러지는 방향(충돌 순간 고정)
  recoverU: 0,                    // 복귀 목표 곡선 파라미터
  recoverFrac: 0,                 // 복귀 순항 속도 비율 — 모델 로드 후 설정
  cooldown: 0,                    // 복귀 후 재충돌 방지 잔여 시간(s)
  // 주행선 횡오프셋(좌/우 화살표로 조정)
  lateral: 0,                     // 현재 횡오프셋(우=+, 좌=−)
  lateralMax: 0,                  // 한계 ±3w — 모델 로드 후 설정
  lateralRate: 0,                 // 화살표 입력 시 횡이동 속도(월드 단위/초) — 로드 후 설정
  basePos: new THREE.Vector3(),   // 횡오프셋과 분리된 '기준'(주행선 추격) 위치
};

// 좌/우 화살표 키 입력(주행선 횡오프셋 조정)
const keyInput = { left: false, right: false };
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { keyInput.left = true; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { keyInput.right = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keyInput.left = false;
  else if (e.key === 'ArrowRight') keyInput.right = false;
});

// 부스터: 스페이스바 / 화면 더블탭(더블클릭) → 속도가 순식간에 1.2배, 이후 서서히 복귀
const BOOST_FACTOR = 1.2;  // 부스트 직후 유효 속도 배율
const BOOST_DECAY = 1.3;   // 1로 되돌아가는 속도(클수록 빨리 원상 복귀)
function triggerBoost() {
  if (!game.started || game.over || game.paused) return; // 주행 중에만
  if (drive.state !== 'drive') return;                   // 스핀/복귀 중엔 불가
  drive.boost = BOOST_FACTOR;                             // 순식간에 1.2배(누적 없이 고정)
  addScore(100);                                         // 부스터 키를 누를 때마다 +100
  popText('+100', window.innerWidth / 2, window.innerHeight * 0.4, '#59c6ff', 32);
}
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) triggerBoost(); // 자동 반복(꾹 누름)은 무시 — 누를 때마다 1회
  }
});
// 더블탭/더블클릭 감지(포인터 통합) — 버튼 위 탭은 제외, 이벤트 타임스탬프로 간격 측정
let _lastTapMs = -1e9;
window.addEventListener('pointerup', (e) => {
  // 버튼·조종석 창(더블클릭=화면 전환) 위 탭은 부스터에서 제외
  if (e.target.closest && e.target.closest('button, #minimap')) return;
  if (e.timeStamp - _lastTapMs < 300) { triggerBoost(); _lastTapMs = -1e9; }
  else _lastTapMs = e.timeStamp;
});

// 모바일 가상 버튼(좌/우): 누르고 있는 동안 해당 화살표 키와 동일하게 동작.
function bindHoldButton(id, side) {
  const el = document.getElementById(id);
  if (!el) return;
  const press = (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId); // 손가락이 버튼 밖으로 나가도 up 을 받도록
    keyInput[side] = true;
  };
  const release = (e) => { e.preventDefault(); keyInput[side] = false; };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault()); // 길게 눌러도 메뉴 X
}
bindHoldButton('btn-left', 'left');
bindHoldButton('btn-right', 'right');

// ---------------------------------------------------------------------------
// 충돌 사운드(Web Audio API 로 합성 — 오디오 파일 불필요)
// ---------------------------------------------------------------------------
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
// 브라우저 자동재생 정책: 첫 사용자 입력에서 오디오 컨텍스트를 깨우고 엔진음 시작.
function resumeAudio() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (!game.started || game.paused || game.over) return; // 진행 중이 아니면 깨우지 않음
  // iOS 자동재생 정책: resume() 은 사용자 제스처 안에서만 동작 → 카운트다운 중에도 컨텍스트는
  // 켜 둔다(엔진음 자체는 syncAudio 가 게인으로 차단). 이래야 카운트다운 후 비제스처에서
  // resume 을 다시 부르지 않아 iOS 에서도 엔진음이 확실히 살아난다.
  if (ctx.state === 'suspended') ctx.resume();
  initEngine();
}
window.addEventListener('pointerdown', resumeAudio);
window.addEventListener('keydown', resumeAudio);

// 배경 음악(TUGameSong.mp3) — 게임 플레이 중에만 재생
const bgmEl = document.getElementById('bgm');
if (bgmEl) bgmEl.volume = 0.22; // 엔진음·충돌음(효과음)을 가리지 않게 낮게

// 사운드 상태 강제 일치(매 프레임 호출): 게임 진행 중에만 ON, 그 외(시작 전·정지·게임오버)엔 OFF.
function syncAudio() {
  // 배경 음악은 진행 중(카운트다운 포함) 재생. 엔진/효과음 컨텍스트는 진행 중엔 켜 두고,
  // 엔진음 자체는 카운트다운이 끝난 실제 주행 중에만(게인으로 차단 — iOS resume 제스처 문제 회피).
  const playing = game.started && !game.paused && !game.over;
  const engineOn = playing && game.countdown <= 0;
  // 배경 음악: 진행 중이면 재생, 그 외엔 일시정지
  if (bgmEl) {
    if (playing) { if (bgmEl.paused) bgmEl.play().catch(() => {}); }
    else if (!bgmEl.paused) bgmEl.pause();
  }
  if (!audioCtx) return; // 아직 컨텍스트 생성 전이면(엔진/효과음) 소리 없음(=OFF)
  if (playing) {
    // 컨텍스트는 진행 중 항상 running 유지(카운트다운 동안에도). resume 은 비제스처라 iOS 에선
    // 무시될 수 있으나, 제스처(START/일시정지 해제)에서 이미 깨워 두므로 그대로 유지된다.
    if (audioCtx.state === 'suspended') audioCtx.resume();
    initEngine();
    // 엔진음: 카운트다운 중엔 게인 0(무음), 끝나면 updateEngine 이 게인을 되살린다.
    if (engine && !engineOn) engine.gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.03);
  } else if (audioCtx.state === 'running') {
    audioCtx.suspend(); // 시작 전·정지·게임오버 → 반드시 OFF
  }
}

// ---------------------------------------------------------------------------
// 엔진음(속도 비례) — 톱니파 2개(살짝 디튠) + 한 옥타브 아래 사인(바디)을
// 저역통과 필터로 묶어 합성. 주파수·필터·음량을 매 프레임 속도에 맞춰 갱신.
// ---------------------------------------------------------------------------
let engine = null;
function initEngine() {
  const ctx = getAudioCtx();
  if (!ctx || engine) return;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 250;
  // 단일 톱니파(디튠된 둘은 맥놀이로 사이렌처럼 들려 제거) + 약한 서브 사인
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
  const sub = ctx.createOscillator(); sub.type = 'sine';
  const subGain = ctx.createGain(); subGain.gain.value = 0.45; // 서브 저음(바디) — 묵직하게
  o1.connect(filter);
  sub.connect(subGain); subGain.connect(filter);
  filter.connect(gain); gain.connect(ctx.destination);
  o1.start(); sub.start();
  engine = { gain, filter, o1, sub, subGain };
}

// frac: 0(정지)~1(최고속) — 속도 비율
function updateEngine(frac) {
  if (!engine || !audioCtx) return;
  const now = audioCtx.currentTime;
  const f = 32 + frac * 78;                  // 기본 주파수(더 낮게, 32→110Hz)
  engine.o1.frequency.setTargetAtTime(f, now, 0.05);
  engine.sub.frequency.setTargetAtTime(f * 0.5, now, 0.05); // 한 옥타브 아래
  engine.filter.frequency.setTargetAtTime(160 + frac * 700, now, 0.05);  // 더 어둡게(묵직)
  engine.gain.gain.setTargetAtTime(0.05 + frac * 0.09, now, 0.08);       // 묵직하게 약간 키움
}

// 충격 1회: 둔탁한 노이즈 파열음 + 저음 thud 를 start 시각에 재생(파라미터 가변).
function playImpact(ctx, start, level, thudFreq, dur) {
  const master = ctx.createGain();
  master.gain.value = 0.9 * level;
  master.connect(ctx.destination);

  // 노이즈 버스트(둔탁 — 고역 차단, 부드러운 어택)
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const nf = ctx.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.setValueAtTime(700, start);
  nf.frequency.exponentialRampToValueAtTime(140, start + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, start);
  ng.gain.exponentialRampToValueAtTime(0.55, start + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  noise.connect(nf); nf.connect(ng); ng.connect(master);
  noise.start(start); noise.stop(start + dur);

  // 저음 thud(충격 바디) — 피치 다운
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(thudFreq, start);
  osc.frequency.exponentialRampToValueAtTime(thudFreq * 0.33, start + dur * 0.7);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, start);
  og.gain.exponentialRampToValueAtTime(1.1, start + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.78);
  osc.connect(og); og.connect(master);
  osc.start(start); osc.stop(start + dur * 0.8);
}

// 충돌음: 한 번에 끝나지 않고 조금씩(음정·세기) 다른 충격을 세 번 연속 재생.
function playCrashSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = ctx.currentTime;
  playImpact(ctx, t0,        1.0, 110, 0.5);  // 1타: 가장 강하고 높음
  playImpact(ctx, t0 + 0.18, 0.72, 92, 0.45); // 2타
  playImpact(ctx, t0 + 0.34, 0.5,  80, 0.42); // 3타: 가장 약하고 낮음
}

// 브레이크등(감속 시 후면 적색 발광)
let brakeMaterial = null;   // 발광 머티리얼(emissiveIntensity 를 조절)
let brakeLight = null;      // 후면 적색 포인트라이트
const brake = { glow: 0 };  // 0~1 발광 정도(부드럽게 보간)

// 부스터 화염(차량 뒤로 길게 뻗는 발광)
let boostFlames = [];       // 좌/우 화염 메시
let boostLight = null;      // 후방 청록색 포인트라이트

// 전방 헤드라이트 섬광(앞차를 일정 거리로 따라잡으면 5회 번쩍)
let headlightLight = null;  // 전방 포인트라이트
let headlightFlashDist = 0; // 섬광 트리거 거리(월드) — 모델 로드 후 설정
const headlightFlash = { active: false, t: 0 };
const HEADLIGHT_FLASH_PERIOD = 0.1; // 켜짐/꺼짐 한 구간(s)
const HEADLIGHT_FLASH_COUNT = 5;    // 번쩍임 횟수
function setHeadlight(on) {
  if (headlightLight) headlightLight.intensity = on ? headlightLight.userData.peak : 0;
}
function startHeadlightFlash() { headlightFlash.active = true; headlightFlash.t = 0; }
function updateHeadlightFlash(dt) {
  if (!headlightFlash.active) return;
  headlightFlash.t += dt;
  const idx = Math.floor(headlightFlash.t / HEADLIGHT_FLASH_PERIOD);
  if (idx >= HEADLIGHT_FLASH_COUNT * 2) { headlightFlash.active = false; setHeadlight(false); return; }
  setHeadlight(idx % 2 === 0); // 짝수 구간 켜짐 → 총 5회 번쩍
}

// 코너 속도(slow-in / fast-out) 튜닝
const CORNER_EPS = 0.006;       // 곡률 측정용 접선 간격(u 단위)
const TURN_MAX = 0.22;          // 이 이상 꺾이면 최저 속도(rad)
const BRAKE_TIME = 1.4;         // 전방 브레이킹 예측 시간(초) — 클수록 더 일찍 감속(slow-in)
const BRAKE_SAMPLES = 6;        // 전방 곡률 스캔 표본 수
const SPEED_BRAKE = 3.2;        // 감속 강도(코너 진입, 강하게)
const SPEED_ACCEL = 1.1;        // 가속 강도(코너 탈출 fast-out, 부드럽게)
const LATERAL_RETURN_RATE = 2.0;// 좌우 키를 놓으면 횡오프셋이 0으로 복귀하는 속도(1/s)

// 충돌/스핀/복귀 튜닝
const SPIN_OMEGA0 = 8.0;        // 충돌 직후 회전 각속도(rad/s) — 스핀을 조금 더 크게
const SPIN_OMEGA_DECAY = 2.7;   // 회전 감쇠율(1/s) — 낮춰서 회전이 조금 더 오래(총 회전량↑)
const SPIN_OMEGA_STOP = 0.3;    // 이 각속도 미만이면 스핀 종료로 보고 복귀
const SPIN_SPEED_DECAY = 9.0;   // 진행 속도 감쇠율(1/s) — 18→9 로 절반 → 0 수렴 시간 2배
const RECOVER_SPEED_FRAC = 0.45;       // 주인공 복귀 주행 속도(maxSpeed 비율) — 더 빠르게 끌어올림
const TRAFFIC_RECOVER_SPEED_FRAC = 0.8; // 상대 차 복귀 속도 — 거의 멈춰 보이지 않게 빠르게 복귀
const RECOVER_TURN = 3.0;       // 복귀 시 선회 각속도(rad/s)
const RECOVER_ALIGN = 0.12;     // 주행선 방향 일치 판정 허용 오차(rad)
const RECOVER_ACCEL_RATE = 3.0; // 복귀 중 정지(≈0)→순항 속도 가속(1/s) — 더 빠르게 끌어올림
const COLLISION_COOLDOWN = 1.5; // 복귀 후 재충돌 방지 시간(s)
const START_GRACE = 5;          // 게임 시작/재개 후 충돌을 처리하지 않는 무적 시간(s)
const COUNTDOWN_TIME = 3;       // 게임 시작/일시정지 복귀 시 3-2-1 카운트다운 길이(s)
const RESUME_ACCEL = 1.5;       // 복귀 후 주행 속도 회복(1/s) — 느린 구간을 짧게(빠른 스쳐감 방지)
const AVOID_RATE = 2.5;         // 교통 차량 회피 차선 변경 부드러움(1/s)
let collisionDist = 0;          // 충돌 판정 거리 — 모델 로드 후 설정
let collisionLatMax = 0;        // 충돌 슬라이드 시 주행선 횡이탈 한계(±5W) — 모델 로드 후 설정
let recoverArrive = 0;          // 곡선 도달 판정 거리 — 모델 로드 후 설정
let avoidRadius = 0;            // 교통 차량이 레이싱 카를 회피하기 시작하는 거리
let avoidClearance = 0;         // 회피 시 확보할 횡방향 간격

// 카메라 추적 + 높이 진동 + 근접/원거리 반복
const CAM_BOB_OMEGA = 1.1;      // 상하 진동 각속도(rad/s)
const CAM_DOLLY_OMEGA = 0.45;   // 근접↔원거리 왕복 각속도(rad/s) — 더 느린 주기
const CAM_REAR_HALF_ANGLE = Math.PI / 4; // 카메라 허용 범위: 차 뒤쪽 ±45°(총 90°)
const CAM_SWEEP_OMEGA = 0.4;             // 좌우 스윕 각속도(rad/s) — 부드럽게 왕복
const CAM_SWEEP_AMP = CAM_REAR_HALF_ANGLE * 0.8; // 좌우 스윕 진폭(뒤쪽 90° 안, ±36°)
const SHOWCASE_SPIN = 0.6;      // 정지/게임오버 시 전시 모델 회전 각속도(rad/s)
const SHOWCASE_LAYER = 2;       // 전시 모델 전용 레이어(어두운 배경 위에 밝게 별도 렌더)
const SHOWCASE_TILT = 0.18;     // 전시 모델 기울임(rad, 약 10°) — 잘 관찰되게
const COCKPIT_FWD_RATIO = 0.10; // 차 중심 기준 조종석의 전방 위치(차 길이 비율)

// 미니맵(화면 중앙 상단): 조종석 전방 시점. 가로:세로 = 2.5:1.
// 픽셀 크기·여백은 index.html 의 #minimap 프레임과 일치시킨다.
const MINIMAP_W = 320;          // 미니맵 너비(px)
const MINIMAP_H = 154;          // 미니맵 높이(px) — 상하 1.2배(128→154)
const MINIMAP_MARGIN = 16;      // 화면 상단 여백(px)
const MINIMAP_LAYER = 1;        // 조종석 카메라 전용 마커 레이어(메인 화면은 무시)
let miniCam = null;             // 조종석 전방 시점 카메라(모델 로드 후 생성)
let cockpitMain = false;        // true=조종석 시점이 전체화면, 게임(체이스) 화면이 작은 창(더블클릭 토글)
let showcaseGroup = null;       // 정지/게임오버 시 눈앞 전시용 차량(기울임·위치)
let showcaseSpinner = null;     // 그 안에서 Y축으로 도는 회전 그룹
let showcaseAngle = 0;          // 전시 회전 각도
const camFollow = {
  prev: new THREE.Vector3(),
  ready: false,
  t: 0,                          // 높이 진동 위상 누적 시간
  bobPrev: 0,                    // 직전 프레임의 진동 오프셋
  bobAmp: 0,                     // 진동 진폭 — 모델 로드 후 설정
  sweepT: 0,                     // 좌우 스윕 위상 누적 시간
  chaseDist: 0,                  // 추격 거리(차 길이의 약 3배) — 모델 로드 후 설정
  cockpitFwd: 0,                 // 차 중심→조종석 전방 거리(월드 단위) — 모델 로드 후 설정
  eyeHeight: 0,                  // 조종석 눈높이(미니맵 카메라) — 모델 로드 후 설정
  camFwd: 0,                     // 미니맵 카메라 전방 오프셋(차 앞으로 빼 전방 시야 확보)
};

// 매 프레임 재사용하는 임시 벡터
const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _tanAhead = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _lat = new THREE.Vector3();          // 교통 차량 차선 오프셋(횡방향)
const _up = new THREE.Vector3(0, 1, 0);
const _near = new THREE.Vector3();         // 곡선 최근접점 탐색용
const _obstacles = [];                     // 회피 대상(복귀 중 차량) 위치 모음 — 매 프레임 갱신

// 곡선 위 u 지점의 국소 곡률 → 허용(목표) 속도. 급할수록 minSpeed에 가까움.
function cornerSpeedLimit(u) {
  const a = ((u % 1) + 1) % 1;
  drive.curve.getTangentAt(a, _tan);
  drive.curve.getTangentAt(((a + CORNER_EPS) % 1), _tanAhead);
  const sharp = Math.min(_tan.angleTo(_tanAhead) / TURN_MAX, 1); // 0=직선,1=급코너
  return drive.maxSpeed + (drive.minSpeed - drive.maxSpeed) * sharp;
}

// ---------------------------------------------------------------------------
// 충돌 → 스핀 → 정지 → 곡선 복귀 상태머신 (주인공/교통 차량 공용)
// ---------------------------------------------------------------------------
// rec 는 상태 필드(state/omega/slideSpeed/slideDir/heading/recoverU)를 가진 객체,
// obj 는 실제로 움직일 Object3D(주인공 car 또는 교통 rig).

// 곡선 위에서 점 p 에 가장 가까운 진행 파라미터 u 를 표본 탐색으로 찾는다.
function nearestU(p) {
  const N = 240;
  let bestU = 0, bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    drive.curve.getPointAt(u, _near);
    const dx = _near.x - p.x, dz = _near.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; bestU = u; }
  }
  return bestU;
}

// 스핀 시작: 현재 진행 속도를 유지한 채 회전만 부여(주행 제어 상실).
function startSpin(rec, omega, heading, speed) {
  rec.state = 'spin';
  rec.omega = omega;
  rec.heading = heading;
  rec.slideSpeed = speed;
  rec.slideDir.set(Math.cos(heading), 0, -Math.sin(heading)); // 충돌 순간 진행 방향 고정
}

// 위치를 주행선에서 횡방향으로 ±maxLat 안으로 끌어당긴다(가장 가까운 선 지점 기준).
function clampToLine(pos, maxLat) {
  const u = nearestU(pos);
  drive.curve.getPointAt(u, _pos);
  drive.curve.getTangentAt(u, _tan);
  _lat.crossVectors(_up, _tan).normalize();          // 주행선 횡방향 단위벡터
  const off = (pos.x - _pos.x) * _lat.x + (pos.z - _pos.z) * _lat.z;
  const clamped = Math.max(-maxLat, Math.min(maxLat, off));
  if (clamped !== off) {
    pos.x += _lat.x * (clamped - off);
    pos.z += _lat.z * (clamped - off);
  }
}

// 스핀 한 프레임: 진행 속도는 충돌 후 0에 수렴(이전보다 2배 천천히)하고,
// 차는 제자리에서 회전하며 회전 속도가 서서히 줄어든다. 회전이 충분히 잦아들면
// 스핀 종료로 보고 true 반환 → 복귀 단계로. 슬라이드가 길어진 만큼 주행선에서
// ±5W 를 넘지 않게 횡방향으로 묶어 트랙 밖으로 튕겨 나가지 않도록 한다.
function stepSpin(rec, obj, dt) {
  // 진행 속도 0 수렴(감쇠율을 절반으로 낮춰 더 오래 미끄러짐)
  rec.slideSpeed *= Math.max(0, 1 - SPIN_SPEED_DECAY * dt);
  obj.position.x += rec.slideDir.x * rec.slideSpeed * dt;
  obj.position.z += rec.slideDir.z * rec.slideSpeed * dt;
  if (collisionLatMax > 0) clampToLine(obj.position, collisionLatMax); // ±5W 한계
  // 제자리 회전 + 회전 감쇠
  rec.heading += rec.omega * dt;
  obj.rotation.y = rec.heading;
  rec.omega *= Math.max(0, 1 - SPIN_OMEGA_DECAY * dt);
  return Math.abs(rec.omega) < SPIN_OMEGA_STOP;
}

// 정지 후 가장 가까운 곡선 지점을 복귀 목표로 잡고 복귀 단계로 진입.
function enterRecover(rec, obj) {
  rec.recoverU = nearestU(obj.position);
  rec.state = 'recover';
}

// 복귀 한 프레임: 주행선 방향으로 차를 서서히 전진시키며 진행 방향(orientation)을
// 주행선 접선에 맞춘다. 병합 목표점(recoverU)도 같은 속도로 주행선을 따라 전진시켜,
// 차가 선 위로 모이면서 방향이 정렬되게 한다. 주행선에 충분히 가깝고(횡오프셋 작음)
// 방향이 일치하면 true(→ 가속하며 정상 주행 재개).
function stepRecover(rec, obj, dt) {
  // 진행 속도를 정지(≈0)에서 복귀 순항 속도까지 연속적으로 끌어올린다(전이 시 불연속 방지).
  // 순항 속도 비율은 차량별(주인공/상대)로 다르다 — 상대는 매우 느리게 복귀.
  const cruise = drive.maxSpeed * rec.recoverFrac;
  rec.slideSpeed += (cruise - rec.slideSpeed) * Math.min(1, dt * RECOVER_ACCEL_RATE);
  const rs = rec.slideSpeed;
  // 병합 목표를 주행선 방향으로 서서히 전진
  rec.recoverU = (rec.recoverU + (rs * dt) / drive.length) % 1;
  drive.curve.getPointAt(rec.recoverU, _pos);
  drive.curve.getTangentAt(rec.recoverU, _tan);
  const lineHeading = Math.atan2(-_tan.z, _tan.x);

  // 주행선상 약간 앞을 겨냥 → 차를 선 위로 끌어들이며 진행 방향을 맞춤
  drive.curve.getPointAt((rec.recoverU + drive.aimAhead) % 1, _aim);
  const desired = Math.atan2(-(_aim.z - obj.position.z), _aim.x - obj.position.x);
  let dAng = desired - rec.heading;
  dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
  const maxTurn = RECOVER_TURN * dt;
  rec.heading += Math.max(-maxTurn, Math.min(maxTurn, dAng));
  obj.rotation.y = rec.heading;

  // 차의 진행 방향으로 서서히 전진
  obj.position.x += Math.cos(rec.heading) * rs * dt;
  obj.position.z += -Math.sin(rec.heading) * rs * dt;

  // 완료 판정: 주행선에 충분히 가깝고 진행 방향이 접선과 일치.
  // 단, 복귀 순항(최대) 속도에 도달했으면 정렬 허용오차를 크게 넓혀 곧바로 주행 모드로
  // 전환한다(복귀 최대 속도 부근에서 전환이 지연되던 문제 해결 — 이후 주행 조향이 정렬).
  _lat.crossVectors(_up, _tan).normalize();
  const latOffset = (obj.position.x - _pos.x) * _lat.x + (obj.position.z - _pos.z) * _lat.z;
  let hAng = lineHeading - rec.heading;
  hAng = Math.atan2(Math.sin(hAng), Math.cos(hAng));
  const reachedCruise = rs >= cruise * 0.97;          // 복귀 최대 속도 도달
  const k = reachedCruise ? 4 : 1;                    // 도달 시 허용오차 4배
  return Math.abs(latOffset) < recoverArrive * k && Math.abs(hAng) < RECOVER_ALIGN * k;
}

// 주인공 복귀 완료 → 위치·방향·속도를 그대로 이어받아 정상 주행 재개(스냅 없음).
function resumeHero() {
  drive.u = nearestU(car.position);  // 현재 위치 기준 곡선 파라미터(위치 스냅 안 함)
  drive.basePos.copy(car.position);  // 기준 위치를 현재 위치로(횡오프셋 0에서 재개)
  drive.lateral = 0;                 // 복귀 직후 주행선 기준(키 유지 시 다시 서서히 적용)
  drive.speed = drive.slideSpeed;    // 복귀 순항 속도에서 연속적으로 이어받음
  drive.prevSpeed = drive.speed;
  drive.cooldown = COLLISION_COOLDOWN;
  drive.state = 'drive';
  // heading 은 stepRecover 에서 이미 접선에 정렬됨 → 그대로 유지.
  // 이후 slow-in/fast-out 이 서서히 최대속도까지 가속.
}

// 교통 차량 복귀 완료 → 현재 위치·속도를 그대로 이어받아 곡선 추종 재개(불연속 제거).
function resumeTraffic(t) {
  const u = nearestU(t.rig.position);
  drive.curve.getPointAt(u, _pos);
  drive.curve.getTangentAt(u, _tan);
  _lat.crossVectors(_up, _tan).normalize();
  t.u = u;
  // 현재 횡오프셋을 그대로 반영 → 위치 연속(이후 자기 차선으로 서서히 복귀)
  t.curLateral = (t.rig.position.x - _pos.x) * _lat.x + (t.rig.position.z - _pos.z) * _lat.z;
  // 곡선 추종 속도(= drive.speed·ratio·ramp)가 현재 속도와 이어지도록 ramp 산출
  const cruiseU = drive.speed * TOYOTA_SPEED_RATIO;
  t.ramp = Math.max(0.05, Math.min(1, t.slideSpeed / Math.max(cruiseU, 1e-3)));
  t.cooldown = COLLISION_COOLDOWN;
  t.state = 'drive';
}

// 주인공 ↔ 상대 충돌 검사. 둘 다 정상 주행(쿨다운 해제) 상태일 때만 발동.
// 상대가 주인공의 오른쪽이면 주인공 반시계(+)/상대 시계(-), 왼쪽이면 그 반대.
function checkCollisions() {
  if (game.grace > 0) return; // 시작/재개 후 무적 시간 동안엔 충돌 무시
  if (drive.state !== 'drive' || drive.cooldown > 0) return;
  for (const t of traffic) {
    if (t.state !== 'drive' || t.cooldown > 0) continue;
    const dx = t.rig.position.x - car.position.x;
    const dz = t.rig.position.z - car.position.z;
    if (dx * dx + dz * dz > collisionDist * collisionDist) continue;
    // 주인공 기준 오른쪽 벡터 = (sinθ, 0, cosθ); 양수면 상대가 오른쪽.
    const side = dx * Math.sin(drive.heading) + dz * Math.cos(drive.heading);
    const heroCCW = side > 0 ? 1 : -1; // 우측 충돌 → 반시계(+)
    startSpin(drive, heroCCW * SPIN_OMEGA0, drive.heading, drive.speed);
    startSpin(t, -heroCCW * SPIN_OMEGA0, t.heading, drive.speed * TOYOTA_SPEED_RATIO * t.ramp);
    playCrashSound(); // 충돌음
    // 충돌 지점(두 차 중간)에서 스파크 분출
    spawnSparks((car.position.x + t.rig.position.x) * 0.5, sparkY, (car.position.z + t.rig.position.z) * 0.5);
    // 충돌 페널티 500점 + -500 팝업(게임오버 점수에 반영되도록 loseDiamond 전에)
    addScore(-500);
    popText('-500', window.innerWidth / 2, window.innerHeight * 0.5, '#ff3b30', 40);
    loseDiamond(); // 충돌마다 다이아몬드 1개 소멸(다 사라지면 게임오버)
    return; // 프레임당 1건만 처리
  }
}

// ---------------------------------------------------------------------------
// 트랙(닫힌 곡선) 생성 + 시각화
// ---------------------------------------------------------------------------
function buildTrack(radius, roadHalfWidth) {
  // 정규화된 제어점([-1,1], XZ 평면)으로 복잡한 닫힌 곡선을 만든다.
  // CatmullRomCurve3(closed=true) 가 시작점으로 매끄럽게 되돌아온다.
  const pts2d = [
    [ 1.00,  0.05], [ 0.92,  0.45], [ 0.70,  0.55], [ 0.62,  0.85],
    [ 0.30,  0.98], [ 0.05,  0.72], [-0.18,  0.92], [-0.45,  0.80],
    [-0.50,  0.45], [-0.80,  0.55], [-0.98,  0.20], [-0.78, -0.08],
    [-0.92, -0.40], [-0.60, -0.52], [-0.62, -0.85], [-0.25, -0.78],
    [-0.05, -0.95], [ 0.28, -0.72], [ 0.52, -0.88], [ 0.82, -0.62],
    [ 0.95, -0.25], [ 0.78,  0.00],
  ];
  const points = pts2d.map(([x, z]) =>
    new THREE.Vector3(x * radius, 0, z * radius)
  );
  // 곡률 완화: 라플라시안 스무딩(닫힌 루프) — 각 점을 양 이웃의 중점 쪽으로 당겨
  // 굴곡을 줄인다. 패스/계수를 키울수록 더 완만해진다.
  const SMOOTH_K = 0.5, SMOOTH_PASSES = 2;
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const n = points.length;
    const src = points.map((p) => p.clone());
    for (let i = 0; i < n; i++) {
      const a = src[(i - 1 + n) % n], b = src[(i + 1) % n];
      points[i].x += ((a.x + b.x) * 0.5 - points[i].x) * SMOOTH_K;
      points[i].z += ((a.z + b.z) * 0.5 - points[i].z) * SMOOTH_K;
    }
  }
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
  drive.curve = curve;
  drive.length = curve.getLength();

  // 도로 리본(아스팔트): 곡선을 따라 좌/우로 폭을 줘서 삼각형 띠를 만든다.
  const up = new THREE.Vector3(0, 1, 0);
  const segs = 600;
  const positions = [];
  const indices = [];
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const lat = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tan);
    lat.crossVectors(up, tan).normalize().multiplyScalar(roadHalfWidth);
    positions.push(p.x + lat.x, 0.02, p.z + lat.z); // 좌
    positions.push(p.x - lat.x, 0.02, p.z - lat.z); // 우
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, d, a, d, c);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(
    roadGeo,
    new THREE.MeshStandardMaterial({
      color: 0x8b8f96, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide, // 밝은 회색 아스팔트(차량 식별 용이)
    })
  );
  road.receiveShadow = true;
  scene.add(road);

  // 트랙 가장자리 빗금(줄무늬) 문양 — 좌/우 가장자리에 적/백 교대 띠를 연속 배치.
  // 곡선을 따라 STRIPE_SEGS 구간으로 나눠 한 칸씩 색을 번갈아 칠한다(레이스 커브 느낌).
  const STRIPE_SEGS = 300;                  // 줄무늬 교대 분할 수
  const bandWidth = roadHalfWidth * 0.12;   // 가장자리 띠 폭(도로 안쪽으로)
  const sPos = [], sCol = [], sIdx = [];
  const sp = new THREE.Vector3(), stan = new THREE.Vector3(), slat = new THREE.Vector3();
  const colA = new THREE.Color(0xd83a2e), colB = new THREE.Color(0xefefef); // 적 / 백
  let vbase = 0;
  for (let side = 0; side < 2; side++) {
    const outer = side === 0 ? roadHalfWidth : -roadHalfWidth;
    const inner = side === 0 ? roadHalfWidth - bandWidth : -(roadHalfWidth - bandWidth);
    for (let i = 0; i < STRIPE_SEGS; i++) {
      const col = i % 2 === 0 ? colA : colB;
      const u0 = i / STRIPE_SEGS, u1 = (i + 1) / STRIPE_SEGS;
      for (const [u, off] of [[u0, inner], [u0, outer], [u1, inner], [u1, outer]]) {
        curve.getPointAt(u, sp);
        curve.getTangentAt(u, stan);
        slat.crossVectors(up, stan).normalize();
        sPos.push(sp.x + slat.x * off, 0.03, sp.z + slat.z * off); // 도로(0.02) 살짝 위
        sCol.push(col.r, col.g, col.b);
      }
      sIdx.push(vbase, vbase + 1, vbase + 3, vbase, vbase + 3, vbase + 2);
      vbase += 4;
    }
  }
  const stripeGeo = new THREE.BufferGeometry();
  stripeGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  stripeGeo.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3));
  stripeGeo.setIndex(sIdx);
  stripeGeo.computeVertexNormals();
  const stripe = new THREE.Mesh(
    stripeGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
    })
  );
  stripe.receiveShadow = true;
  scene.add(stripe);

  // 자잘한 이물질: 차가 지나는 길(트랙) 위에 도로 폭 안으로 흩뿌린다.
  const DEBRIS_COUNT = 600;
  const debrisGeo = new THREE.IcosahedronGeometry(1, 0); // 단위 크기, 인스턴스마다 스케일
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x6b6258, roughness: 1.0, metalness: 0.0, // 흙/돌조각 느낌
  });
  const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, DEBRIS_COUNT);
  debris.castShadow = true;
  debris.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const scl = new THREE.Vector3();
  const baseSize = roadHalfWidth * 0.015; // 도로 폭 대비 자잘한 크기(더 작게)
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const u = Math.random();
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tan);
    lat.crossVectors(up, tan).normalize();
    const off = (Math.random() * 2 - 1) * roadHalfWidth * 0.9; // 도로 폭 안에서 좌우
    const s = baseSize * (0.5 + Math.random());
    e.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    q.setFromEuler(e);
    scl.set(s, s * (0.4 + Math.random() * 0.6), s); // 납작하게 살짝 변형
    p.x += lat.x * off;
    p.z += lat.z * off;
    p.y = 0.02 + s * 0.4; // 트랙 표면 위에 놓이도록
    m.compose(p, q, scl);
    debris.setMatrixAt(i, m);
  }
  debris.instanceMatrix.needsUpdate = true;
  scene.add(debris);
}

// ---------------------------------------------------------------------------
// 레이스웨이(Raceway) — 주행 코스 둘레를 따라 빙 둘러 배치
// ---------------------------------------------------------------------------
// 압축본 Raceway.opt.glb 는 단위 스케일(약 1.9 유닛)로 정규화돼 있다.
// 한 덩어리를 인필드 한가운데 놓는 대신, 같은 메쉬를 RACEWAY_COUNT 개 복제해
// 트랙 곡선 전체에 균등 분포시키고(geometry/material 공유 → 가벼움), 각 개체를
// 도로 바깥쪽 가장자리에 놓은 뒤 트랙 진행 방향(접선)에 맞춰 회전시켜 둘레 구조물처럼 만든다.
function loadRaceway(roadHalfWidth) {
  gltfLoader.load(
    RACEWAY_URL,
    (gltf) => {
      const proto = gltf.scene;
      proto.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      // 한 개의 기본 크기: 곡선 둘레를 개수로 나눈 간격 × RACEWAY_FILL × RACEWAY_SCALE(두 배).
      const length = drive.length;
      const spacing = length / RACEWAY_COUNT;
      const copySpan = spacing * RACEWAY_FILL * RACEWAY_SCALE;

      // 수평 최대 치수를 copySpan 에 맞춰 스케일.
      let box = new THREE.Box3().setFromObject(proto);
      let size = box.getSize(new THREE.Vector3());
      const horiz = Math.max(size.x, size.z) || 1;
      proto.scale.setScalar(copySpan / horiz);
      proto.updateMatrixWorld(true);

      // 스케일 적용 후 재측정 → XZ 중심 정렬 + 바닥 안착(min.y=0).
      box = new THREE.Box3().setFromObject(proto);
      const center = box.getCenter(new THREE.Vector3());
      size = box.getSize(new THREE.Vector3());
      proto.position.x -= center.x;
      proto.position.z -= center.z;
      proto.position.y -= box.min.y;

      // 도로 중심선에서 바깥쪽으로 띄우는 기본 거리.
      // 메쉬가 임의 각도로 회전하므로, 어느 방향으로 돌든 도로를 넘지 않도록
      // 수평 footprint 의 "대각선 반경"(최대 뻗침)을 기준으로 삼는다. 개체별 크기
      // 무작위 확대(최대 1+RACEWAY_SCALE_JITTER)까지 반영해 최악의 경우도 막는다.
      const halfDiag = 0.5 * Math.hypot(size.x, size.z) * (1 + RACEWAY_SCALE_JITTER);
      const baseOffset = roadHalfWidth + halfDiag + roadHalfWidth * RACEWAY_MARGIN;
      const slot = 1 / RACEWAY_COUNT;

      const curve = drive.curve;
      const up = new THREE.Vector3(0, 1, 0);
      const p = new THREE.Vector3();
      const tan = new THREE.Vector3();
      const lat = new THREE.Vector3();
      for (let i = 0; i < RACEWAY_COUNT; i++) {
        // 둘레 위치를 슬롯 안에서 무작위로 흔들어 간격을 불규칙하게.
        let u = i * slot + (Math.random() - 0.5) * slot * RACEWAY_POS_JITTER;
        u = (u % 1 + 1) % 1;
        curve.getPointAt(u, p);
        curve.getTangentAt(u, tan);
        // 접선의 좌측 법선. 원점(코스 중심) 기준으로 바깥을 향하는 쪽을 고른다.
        lat.crossVectors(up, tan).normalize();
        const side = (lat.x * p.x + lat.z * p.z) >= 0 ? 1 : -1;
        // 바깥 거리도 개체별로 무작위로 더 띄워 한 줄로 늘어서지 않게(간섭 방지).
        const dist = baseOffset + Math.random() * roadHalfWidth * RACEWAY_RADIAL_JITTER;

        const rig = new THREE.Group();
        rig.add(proto.clone());
        rig.position.set(p.x + lat.x * side * dist, 0, p.z + lat.z * side * dist);
        // 접선 정렬을 기본으로 두되 개체별 무작위 회전을 더해 똑같은 모습을 피한다.
        rig.rotation.y = Math.atan2(-tan.z, tan.x) + RACEWAY_YAW_OFFSET +
          (Math.random() * 2 - 1) * RACEWAY_YAW_JITTER;
        // 크기도 개체별로 ±RACEWAY_SCALE_JITTER 범위에서 무작위 변동(바닥 안착 유지).
        rig.scale.setScalar(1 + (Math.random() * 2 - 1) * RACEWAY_SCALE_JITTER);
        scene.add(rig);
      }

      console.log(
        `[Raceway] 둘레 배치 완료 — ${RACEWAY_COUNT}개 ` +
        `(간격 ≈ ${spacing.toFixed(1)}, 개당 기본 span ≈ ${copySpan.toFixed(1)})`
      );
    },
    undefined,
    (err) => console.error('[Raceway] 로드 실패:', err)
  );
}

// ---------------------------------------------------------------------------
// 나무(tree) — 트랙 안팎에 자연스럽게 흩뿌리기
// ---------------------------------------------------------------------------
// 압축본 tree.opt.glb 를 한 번 로드해 높이를 도로 폭 기준으로 정규화한 뒤, 같은
// 메쉬를 TREE_COUNT 그루 복제(geometry/material 공유)한다. 코스 중심(원점)을 덮는
// 원반에서 위치를 무작위 표본하되, 도로 중심선과 너무 가까운 후보는 기각해 주행로를
// 침범하지 않게 한다. 이렇게 하면 트랙 안쪽(인필드)과 바깥쪽 모두에 자연스레 깔린다.
function loadTrees(roadHalfWidth, trackRadius) {
  gltfLoader.load(
    TREE_URL,
    (gltf) => {
      const proto = gltf.scene;
      proto.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      // 높이를 roadHalfWidth 기준으로 맞추고 바닥 안착(min.y=0)·XZ 중심 정렬.
      let box = new THREE.Box3().setFromObject(proto);
      let size = box.getSize(new THREE.Vector3());
      proto.scale.setScalar((roadHalfWidth * TREE_SIZE_FACTOR) / (size.y || 1));
      proto.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(proto);
      const center = box.getCenter(new THREE.Vector3());
      proto.position.x -= center.x;
      proto.position.z -= center.z;
      proto.position.y -= box.min.y;

      // 도로 중심선 표본점(후보가 도로를 침범하는지 거리로 판정).
      const curve = drive.curve;
      const SAMPLES = 256;
      const cx = new Float32Array(SAMPLES);
      const cz = new Float32Array(SAMPLES);
      const sp = new THREE.Vector3();
      for (let i = 0; i < SAMPLES; i++) {
        curve.getPointAt(i / SAMPLES, sp);
        cx[i] = sp.x;
        cz[i] = sp.z;
      }
      // 도로 중심선에서 이만큼 안쪽은 비워 둔다(도로 반폭 + 여유).
      const keepOut2 = (roadHalfWidth * (1 + TREE_CLEARANCE)) ** 2;
      const fieldR = trackRadius * TREE_FIELD_FACTOR;

      let placed = 0;
      let attempts = 0;
      const maxAttempts = TREE_COUNT * 30;
      while (placed < TREE_COUNT && attempts < maxAttempts) {
        attempts++;
        // 원반(반경 fieldR) 균등 표본 → 트랙 안(인필드)과 밖을 모두 덮는다.
        const r = Math.sqrt(Math.random()) * fieldR;
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // 도로와의 최소 거리(제곱) 검사 — 너무 가까우면 기각.
        let min2 = Infinity;
        for (let i = 0; i < SAMPLES; i++) {
          const dx = x - cx[i];
          const dz = z - cz[i];
          const d2 = dx * dx + dz * dz;
          if (d2 < min2) min2 = d2;
        }
        if (min2 < keepOut2) continue;

        const rig = new THREE.Group();
        rig.add(proto.clone());
        rig.position.set(x, 0, z); // 바닥(y=0)에 안착 — proto 가 min.y=0 으로 정렬돼 균일 스케일에도 바닥에 닿음
        rig.rotation.y = Math.random() * Math.PI * 2;                 // 방향 무작위
        // 크기는 1~2 배율로 무작위(크고 작게). 균일 스케일이라 바닥 접점(y=0)은 유지.
        rig.scale.setScalar(TREE_SCALE_MIN + Math.random() * (TREE_SCALE_MAX - TREE_SCALE_MIN));
        scene.add(rig);
        placed++;
      }

      console.log(
        `[Tree] 배치 완료 — ${placed}그루(시도 ${attempts}, 영역 반경 ${fieldR.toFixed(1)})`
      );
    },
    undefined,
    (err) => console.error('[Tree] 로드 실패:', err)
  );
}

// ---------------------------------------------------------------------------
// 조종석 시점 차량 강조 마커 (밝은 테두리 + 위쪽 역삼각형 ▼)
// ---------------------------------------------------------------------------
// 역삼각형(▼) 스프라이트 텍스처(한 번 만들어 모든 차량이 공유)
function makeTriangleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath();
  g.moveTo(5, 7); g.lineTo(59, 7); g.lineTo(32, 57); g.closePath(); // ▼
  g.fillStyle = '#ff2d2d';
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const _triTex = makeTriangleTexture();

// 차량(바운딩 크기 size)을 조종석 시점에서 강조: 위쪽 역삼각형 마커.
// MINIMAP_LAYER 에만 두어 조종석 카메라에서만 보인다.
function buildCockpitMarker(size) {
  const group = new THREE.Group();

  // 위치 표시용 수직선 + 그 끝의 역삼각형(▼). 둘 다 항상 보이게(depthTest off).
  const s = size.x * 1.2;           // 역삼각형 크기(키움)
  const topY = size.y + s * 0.9;    // 마커 높이
  const vline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, topY, 0), // 지면 → 마커
    ]),
    new THREE.LineBasicMaterial({ color: 0xff3030, toneMapped: false, depthTest: false })
  );
  vline.layers.set(MINIMAP_LAYER);
  group.add(vline);

  const tri = new THREE.Sprite(new THREE.SpriteMaterial({
    map: _triTex, toneMapped: false, depthTest: false, transparent: true,
  }));
  tri.scale.set(s, s, 1);
  tri.position.y = topY;            // 수직선 끝(위)에 역삼각형
  tri.layers.set(MINIMAP_LAYER);
  group.add(tri);
  return group;
}

// ---------------------------------------------------------------------------
// 충돌 스파크(파티클) — Points 풀에서 충돌 지점으로 분출, 중력·수명으로 소멸
// ---------------------------------------------------------------------------
let sparkSystem = null;
let sparkSpeed = 0, sparkGravity = 0, sparkY = 0;
function initSparks(maxDim, size) {
  const COUNT = 480; // 360 분출 + 여유
  const geo = new THREE.BufferGeometry();
  const posArr = new Float32Array(COUNT * 3);
  const colArr = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) posArr[i * 3 + 1] = -1e6; // 처음엔 화면 밖(숨김)
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const mat = new THREE.PointsMaterial({
    size: maxDim * 0.018, vertexColors: true, transparent: true, // 1/10 크기(미세 불꽃)
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const data = [];
  for (let i = 0; i < COUNT; i++) data.push({ vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
  sparkSystem = { posAttr: geo.attributes.position, colAttr: geo.attributes.color, data };
  sparkSpeed = maxDim * 9;
  sparkGravity = maxDim * 22;
  sparkY = size.y * 0.4;
}
// 충돌 지점(x,y,z)에서 스파크 분출(밝은 주황, 위·바깥으로)
function spawnSparks(x, y, z) {
  if (!sparkSystem) return;
  const { data, posAttr, colAttr } = sparkSystem;
  let spawned = 0;
  for (let i = 0; i < data.length && spawned < 360; i++) {
    const p = data[i];
    if (p.life > 0) continue;
    p.maxLife = 0.25 + Math.random() * 0.55;
    p.life = p.maxLife;
    const sp = sparkSpeed * (0.3 + Math.random() * 1.1); // 속도 편차 크게(사실적)
    const ang = Math.random() * Math.PI * 2;
    const elev = 0.3 + Math.random() * 0.9;              // 위로 튀는 정도
    const horiz = Math.sqrt(Math.max(0, 1 - elev * elev * 0.4));
    p.vx = Math.cos(ang) * sp * horiz;
    p.vz = Math.sin(ang) * sp * horiz;
    p.vy = sp * elev;
    posAttr.setXYZ(i, x, y, z);
    colAttr.setXYZ(i, 1.0, 0.85, 0.5); // 흰빛 도는 뜨거운 불꽃
    spawned++;
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}
// 매 프레임 스파크 갱신: 이동·중력·수명 감소·페이드(가산 블렌딩이라 어두워지며 사라짐)
function updateSparks(dt) {
  if (!sparkSystem) return;
  const { data, posAttr, colAttr } = sparkSystem;
  let any = false;
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    if (p.life <= 0) continue;
    any = true;
    p.life -= dt;
    if (p.life <= 0) {
      colAttr.setXYZ(i, 0, 0, 0);
      posAttr.setXYZ(i, 0, -1e6, 0);
      continue;
    }
    p.vy -= sparkGravity * dt;
    const drag = Math.max(0, 1 - 2.2 * dt); // 가벼운 공기저항
    p.vx *= drag; p.vz *= drag;
    const ix = i * 3;
    posAttr.array[ix] += p.vx * dt;
    posAttr.array[ix + 1] += p.vy * dt;
    posAttr.array[ix + 2] += p.vz * dt;
    const f = p.life / p.maxLife;
    // 식으며 흰빛 → 주황 → 적색으로(가산 블렌딩이라 밝기도 함께 감소)
    colAttr.setXYZ(i, f, f * f * 0.6, f * f * f * 0.18);
  }
  if (any) { posAttr.needsUpdate = true; colAttr.needsUpdate = true; }
}

// ---------------------------------------------------------------------------
// 교통(traffic) 차량(Toyota) — 트랙 전체에 N대를 흩뿌려 각자 주행
// ---------------------------------------------------------------------------
// Toyota 한 번만 로드해 메인 차량과 비슷한 크기로 정규화한 뒤, 같은 메쉬를 N개
// 복제(geometry/material 공유 → 가벼움)한다. 각 대는 곡선 위 진행값(u)을 균등하게
// 나눠 갖고, 주행선에서의 횡방향 오프셋은 차폭 w 기준 [-3w, 3w] 균등분포로 무작위
// 결정해 한 줄로 늘어서지 않게 한다. 주행은 animate 루프에서 곡선을 따라 진행하며
// 속도는 주인공 레이싱 카의 80%.
function loadToyota(refSize, count) {
  gltfLoader.load(
    TOYOTA_URL,
    (gltf) => {
      const toy = gltf.scene;
      toy.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      // 메인 차량과 동일하게 +X 정면 정렬(회전 후 박스 계산)
      toy.rotation.y = Math.PI;
      toy.updateMatrixWorld(true);

      // 크기 측정 → 메인 차량의 최대 치수에 맞춰 스케일(비슷한 덩치로)
      let box = new THREE.Box3().setFromObject(toy);
      const size = box.getSize(new THREE.Vector3());
      const refMax = Math.max(refSize.x, refSize.y, refSize.z);
      const toyMax = Math.max(size.x, size.y, size.z) || 1;
      toy.scale.setScalar(refMax / toyMax);
      toy.updateMatrixWorld(true);

      // 스케일 적용 후 재측정 → 바닥 안착(min.y=0)·XZ 중심 정렬 + 크기 산출
      box = new THREE.Box3().setFromObject(toy);
      const center = box.getCenter(new THREE.Vector3());
      const sizeScaled = box.getSize(new THREE.Vector3()); // 스케일 반영된 크기
      const w = sizeScaled.z;                              // 차폭(횡방향)
      toy.position.x -= center.x;
      toy.position.z -= center.z;
      toy.position.y -= box.min.y;

      // 조종석 시점 강조 마커(밝은 테두리 + 역삼각형) 템플릿 — 차마다 복제해 사용
      const cockpitMarker = buildCockpitMarker(sizeScaled);

      // N대 복제 → 각자 리그(Group)에 담아 곡선 위에 균등 배치.
      // 리그가 곡선 위치·진행 방향 회전을 담당하고, 안쪽 clone 은 정규화 상태 유지.
      for (let i = 0; i < count; i++) {
        const rig = new THREE.Group();
        rig.add(toy.clone());
        rig.add(cockpitMarker.clone()); // 조종석 시점 강조 마커(레이어로 메인 화면엔 숨김)
        scene.add(rig);
        // 주행선 횡방향 오프셋: [-3w, 3w] 균등분포로 무작위 결정.
        const lateral = (Math.random() * 2 - 1) * 3 * w;
        traffic.push({
          rig,
          u: i / count,                        // 곡선 위 균등 분포
          lateral,                             // 기본 차선 오프셋(횡방향)
          curLateral: lateral,                 // 현재 적용 오프셋(회피로 일시 변동)
          ramp: 1,                             // 주행 속도 배율(재출발 시 0.1→1)
          // 충돌 → 스핀 → 정지 → 복귀 상태머신
          state: 'drive',                      // 'drive' | 'spin' | 'recover'
          heading: 0,                          // 현재 진행 방향(rad)
          omega: 0,                            // 스핀 각속도(rad/s)
          slideSpeed: 0,                       // 스핀 중 미끄러짐 속도
          slideDir: new THREE.Vector3(),       // 미끄러짐 방향(충돌 순간 고정)
          recoverU: 0,                         // 복귀 목표 곡선 파라미터
          recoverFrac: TRAFFIC_RECOVER_SPEED_FRAC, // 상대 차는 매우 느리게 복귀
          cooldown: 0,                         // 재충돌 방지 잔여 시간(s)
        });
      }
      console.log(`[Toyota] 교통 차량 ${count}대 배치 완료(속도 ${Math.round(TOYOTA_SPEED_RATIO * 100)}%)`);
    },
    undefined,
    (err) => console.error('[Toyota] 로드 실패:', err)
  );
}

// ---------------------------------------------------------------------------
// 모델 로딩
// ---------------------------------------------------------------------------
const loaderEl = document.getElementById('loader');
const barEl = document.getElementById('loader-bar');
const pctEl = document.getElementById('loader-pct');

const gltfLoader = new GLTFLoader();
// Draco 압축 지오메트리 디코더 연결(디코더는 CDN에서 로드)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // 차량이 +X 방향을 바라보도록 Y축 기준 180도 회전
    // (회전을 먼저 적용한 뒤 바운딩 박스를 계산해야 바닥/중심 정렬이 맞음)
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);

    // 바운딩 박스로 크기 측정 → 바닥에 안착시키고 중심을 원점으로
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y; // 바퀴/바닥이 y=0 에 닿도록

    // 모델을 차량 리그에 넣는다(리그를 곡선 위로 옮겨 주행)
    car.add(model);

    // 모델 크기에 맞춰 트랙·속도를 설정
    const maxDim = Math.max(size.x, size.y, size.z);
    const trackRadius = maxDim * 90;         // 트랙 크기(지름 2배)
    const roadHalfWidth = size.x * 1.8;      // 도로 폭(차폭 기준)
    buildTrack(trackRadius, roadHalfWidth);

    // 레이스웨이 메쉬를 트랙 둘레 전체에 빙 둘러 배치
    loadRaceway(roadHalfWidth);

    // 나무를 트랙 안팎에 자연스럽게 흩뿌림(주행로는 비워 둠)
    loadTrees(roadHalfWidth, trackRadius);

    // 교통 차량(Toyota) N대를 트랙 전체에 흩뿌려 각자 주행시킴
    loadToyota(size, TOYOTA_COUNT);

    // 속도: 다시 2배(직선 maxDim*72). 코너는 크게 감속.
    drive.maxSpeed = maxDim * 70;            // 직선 최고 속도(0.8배: 88→70)
    drive.minSpeed = maxDim * 11;            // 코너 최저 속도(0.8배)
    drive.speed = drive.maxSpeed;
    drive.grip = maxDim * 420;               // 접지력(코너에서 라인 유지)
    drive.aimAhead = (maxDim * 9) / drive.length; // 추격 목표를 차 앞 ~9 차길이
    drive.u = 0;
    drive.prevSpeed = drive.speed;
    drive.recoverFrac = RECOVER_SPEED_FRAC; // 주인공 복귀 속도
    drive.lateralMax = size.z * 3;          // 주행선 횡오프셋 한계 ±3w(w=차폭)
    drive.lateralRate = size.z * 4;         // 좌우 화살표 횡이동 속도(≈1.5초에 전구간)
    drive.active = false;                    // 첫 화면(타이틀) 동안 정지 — START 누르면 시작

    // 충돌 판정/곡선 도달 거리(차 크기 비례)
    collisionDist = maxDim * 0.7; // 충돌 영역을 조금 작게(접촉보다 더 가까울 때만)
    collisionLatMax = size.z * 5; // 충돌 슬라이드 횡이탈 한계 ±5W(W=차폭=size.z)
    recoverArrive = maxDim * 0.3;
    // 교통 차량 회피: 이 거리 안에서 횡방향 간격을 확보하며 비켜간다
    avoidRadius = maxDim * 4.0;
    avoidClearance = maxDim * 1.2; // collisionDist 보다 크게 → 확실히 비켜감
    initSparks(maxDim, size);      // 충돌 스파크 파티클 준비

    // 후면 브레이크등(차 로컬 -X = 뒤). 좌/우 2개 + 적색 글로우 라이트.
    brakeMaterial = new THREE.MeshStandardMaterial({
      color: 0x440000, emissive: 0xff1500, emissiveIntensity: 0,
      roughness: 0.4, metalness: 0.0,
    });
    const blGeo = new THREE.BoxGeometry(size.x * 0.04, size.y * 0.09, size.z * 0.16);
    const rearX = -size.x * 0.46;       // 차체 뒤쪽
    const blY = size.y * 0.38;          // 후미등 높이
    for (const sz of [-1, 1]) {
      const bl = new THREE.Mesh(blGeo, brakeMaterial);
      bl.position.set(rearX, blY, sz * size.z * 0.32);
      car.add(bl);
    }
    brakeLight = new THREE.PointLight(0xff2000, 0, size.x * 3, 2);
    brakeLight.position.set(rearX - size.x * 0.05, blY, 0);
    brakeLight.userData.peak = maxDim * 12; // 최대 글로우 세기
    car.add(brakeLight);

    // 부스터 화염: 차 뒤로 길게 뻗는 발광 콘(애디티브). boost 비율에 따라 길이·세기 변화.
    // 콘은 +Y로 뻗으므로 밑면(넓은 쪽)을 원점에 맞춰 -Y로 길게 뽑고, Z축 회전으로 -X(차 뒤)로 눕힌다.
    const flameLen = size.x * 1.9;
    const flameGeo = new THREE.ConeGeometry(size.z * 0.26, flameLen, 18, 1, true);
    flameGeo.translate(0, -flameLen / 2, 0); // 밑면을 원점에, 꼭짓점을 -Y(뻗는 방향)로
    boostFlames = [];
    for (const sz of [-1, 1]) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x59c6ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      const fl = new THREE.Mesh(flameGeo, mat);
      fl.rotation.z = -Math.PI / 2;                 // 뻗는 방향(-Y) → 차 뒤(-X)
      fl.position.set(rearX - size.x * 0.02, blY * 0.7, sz * size.z * 0.3);
      fl.visible = false;
      car.add(fl);
      boostFlames.push(fl);
    }
    boostLight = new THREE.PointLight(0x59c6ff, 0, size.x * 5, 2);
    boostLight.position.set(rearX - size.x * 0.35, blY * 0.7, 0);
    boostLight.userData.peak = maxDim * 16; // 최대 발광 세기
    car.add(boostLight);

    // 전방 헤드라이트 섬광(차 로컬 +X = 앞). 전방 포인트라이트만 사용.
    // 앞차를 일정 거리로 따라잡으면 5회 번쩍이는 섬광 신호(평소엔 꺼짐).
    const frontX = size.x * 0.47;       // 차체 앞쪽
    const hlY = size.y * 0.40;          // 헤드라이트 높이
    headlightLight = new THREE.PointLight(0xfff2cc, 0, size.x * 6, 2);
    headlightLight.position.set(frontX + size.x * 0.1, hlY, 0);
    headlightLight.userData.peak = maxDim * 14; // 섬광 시 최대 세기
    car.add(headlightLight);
    headlightFlashDist = maxDim * 10; // 이 거리 안으로 앞차를 따라잡으면 섬광

    // 카메라 상하 진동 진폭(차 크기에 비례) — 높이 60% 수준에 맞춰 축소
    camFollow.bobAmp = maxDim * 0.78;
    // 추격 거리: 차 길이(size.x) 기준 고정. 모바일은 조금 더 멀리(4배)서 관찰.
    camFollow.chaseDist = size.x * (IS_MOBILE ? 4 : 3);
    // 조종석은 차 중심에서 진행 방향으로 size.x·비율 만큼 앞(카메라 전진 한계)
    camFollow.cockpitFwd = size.x * COCKPIT_FWD_RATIO;

    // 차를 트랙 시작점에 배치하고 접선 방향(+X 정면)으로 정렬
    drive.curve.getPointAt(0, _pos);
    drive.curve.getTangentAt(0, _tan);
    car.position.set(_pos.x, 0, _pos.z);
    drive.basePos.copy(car.position);            // 기준 위치 = 시작점(횡오프셋 0)
    drive.heading = Math.atan2(-_tan.z, _tan.x); // 초기 진행 방향
    car.rotation.y = drive.heading;
    camFollow.prev.copy(car.position);
    camFollow.ready = true;

    // 태양광 초기 위치도 차 기준으로 맞춤
    sun.position.copy(car.position).add(SUN_OFFSET);
    sun.target.position.copy(car.position);
    sun.target.updateMatrixWorld();

    // 카메라를 차 기준 후상방으로 배치(이후 차를 따라감)
    controls.target.set(car.position.x, size.y * 0.5, car.position.z);
    camera.position.set(
      car.position.x + maxDim * 2.5,
      maxDim * 1.2,            // 높이 60% 수준(기존 2.0 → 1.2)
      car.position.z + maxDim * 3.0
    );
    controls.update();

    // 미니맵 카메라: 조종석에서 앞을 바라보는 원근(perspective) 카메라.
    // aspect = MINIMAP_W/MINIMAP_H. 수직 시야각도 1.2배(72→86) 키워 상하로 더 넓게.
    miniCam = new THREE.PerspectiveCamera(86, MINIMAP_W / MINIMAP_H, maxDim * 0.05, 8000); // 먼 구름/하늘 틴트까지
    miniCam.layers.enable(MINIMAP_LAYER); // 강조 마커(테두리·역삼각형)는 조종석 시점에만
    camFollow.eyeHeight = size.y * 0.95;      // 조종석 눈높이(조금 더 높게)
    // 차체에 시야가 막히지 않도록 카메라를 차 앞코(앞 절반 끝 ≈ 0.5·size.x)
    // 너머로 빼 전방 상황이 보이게 한다.
    camFollow.camFwd = size.x * 0.6;

    // 정지/게임오버 시 눈앞에서 회전하는 전시용 모델(메인 카메라의 자식 → 항상 정면).
    // 바깥 그룹은 위치·기울임 고정, 안쪽 그룹이 Y축으로 회전(기울어진 턴테이블).
    scene.add(camera); // 카메라 자식(전시 모델)이 렌더되도록 카메라를 씬 그래프에 추가
    showcaseGroup = new THREE.Group();
    showcaseGroup.position.set(0, -size.y * 0.6, -maxDim * 1.7); // 카메라 앞(-Z), 더 가까이
    showcaseGroup.scale.setScalar(1.3);
    showcaseGroup.rotation.x = SHOWCASE_TILT;                     // 약간 기울임
    showcaseSpinner = new THREE.Group();
    showcaseGroup.add(showcaseSpinner);
    const showClone = model.clone();
    showClone.traverse((o) => {
      o.layers.set(SHOWCASE_LAYER); // 전용 레이어(정지/게임오버 때만 렌더)
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        // 머티리얼 복제(원본 차량과 공유 방지) + 톤매핑 제외 →
        // 어두운 노출(PAUSE_DARK_EXPOSURE)의 영향을 안 받아 모델만 밝게 보인다.
        if (Array.isArray(o.material)) {
          o.material = o.material.map((m) => { const c = m.clone(); c.toneMapped = false; return c; });
        } else {
          o.material = o.material.clone();
          o.material.toneMapped = false;
        }
      }
    });
    showcaseSpinner.add(showClone);
    camera.add(showcaseGroup);
    // 전시 모델도 조명을 받도록 주광·반구광에 전용 레이어 추가
    sun.layers.enable(SHOWCASE_LAYER);
    hemi.layers.enable(SHOWCASE_LAYER);

    console.log(
      `[GenesisMagma] 로드 완료 — 크기(W×H×L): ` +
      `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}, ` +
      `트랙 길이 ${drive.length.toFixed(1)}`
    );

    loaderEl.classList.add('hidden');
    setTimeout(() => loaderEl.remove(), 500);

    // 로딩 완료 → 첫 화면(타이틀) 노출. 이때 차량은 전시 모드로 중앙에서 회전한다.
    const titleEl = document.getElementById('title');
    if (titleEl) titleEl.classList.remove('hidden');
  },
  (xhr) => {
    if (xhr.lengthComputable) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      barEl.style.width = pct + '%';
      pctEl.textContent = pct + '%';
    } else {
      const mb = (xhr.loaded / 1048576).toFixed(1);
      pctEl.textContent = `${mb} MB`;
    }
  },
  (err) => {
    console.error('[GenesisMagma] 로드 실패:', err);
    loaderEl.innerHTML =
      '<div style="color:#ff6a3d;">GLB 로드 실패 — 콘솔을 확인하세요.<br>' +
      '로컬 서버(http://)로 열었는지 확인해 주세요.</div>';
  }
);

// ---------------------------------------------------------------------------
// 리사이즈 / 렌더 루프
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 속도계: 바늘·디지털 표시 + 눈금(상단 반원, 0=왼쪽 / MAX_KMH=오른쪽)
const speedValEl = document.getElementById('speed-val');
const needleEl = document.getElementById('speedo-needle');
(function buildSpeedoTicks() {
  const ticksEl = document.getElementById('speedo-ticks');
  if (!ticksEl) return;
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i <= 6; i++) {
    const a = ((180 - (i / 6) * 180) * Math.PI) / 180; // 0=왼쪽(180°) ~ MAX=오른쪽(0°)
    const c = Math.cos(a), s = Math.sin(a);
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', (100 + 80 * c).toFixed(1));
    ln.setAttribute('y1', (110 - 80 * s).toFixed(1));
    ln.setAttribute('x2', (100 + 67 * c).toFixed(1));
    ln.setAttribute('y2', (110 - 67 * s).toFixed(1));
    ln.setAttribute('class', 'tick');
    ticksEl.appendChild(ln);
  }
})();

// ---------------------------------------------------------------------------
// 점수 / 게임오버
// ---------------------------------------------------------------------------
const game = { score: 0, sec: 0, diamonds: MAX_DIAMONDS, best: 0, over: false, paused: false, started: false, grace: 0, countdown: 0, cdShown: 0, pendingOver: false };
const scoreValEl = document.getElementById('score-val');
const bestValEl = document.getElementById('best-val');
const diamondsEl = document.getElementById('diamonds');
const gameoverEl = document.getElementById('gameover');
const gameoverScoreEl = document.querySelector('#gameover .go-score span');
const restartBtn = document.getElementById('restart-btn');
const pauseBtn = document.getElementById('pause-btn');
if (restartBtn) restartBtn.addEventListener('click', () => location.reload()); // 처음부터 다시
if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
updateDiamonds();

// 게임 시작/재개 시 화면 중앙에 3-2-1 카운트다운을 띄운다.
const countdownEl = document.getElementById('countdown');
const countdownNumEl = document.getElementById('countdown-num');
function showCountdownNum(text) {
  if (!countdownNumEl) return;
  countdownNumEl.textContent = text;
  countdownNumEl.style.animation = 'none'; // 펄스 애니메이션 재시작
  void countdownNumEl.offsetWidth;          // 강제 리플로우
  countdownNumEl.style.animation = '';
}
function beginCountdown() {
  game.countdown = COUNTDOWN_TIME;
  game.cdShown = COUNTDOWN_TIME;
  if (countdownEl) countdownEl.classList.remove('hidden');
  showCountdownNum(String(COUNTDOWN_TIME));
}

// 첫 화면(타이틀) / 사용법(HOW TO) — START 누르기 전까지 게임은 멈춰 있고 차량만 회전
const titleScreenEl = document.getElementById('title');
const howtoScreenEl = document.getElementById('howto');
const startBtn = document.getElementById('start-btn');
const howtoBtn = document.getElementById('howto-btn');
const howtoBackBtn = document.getElementById('howto-back');
if (startBtn) startBtn.addEventListener('click', startGame);
if (howtoBtn) howtoBtn.addEventListener('click', () => howtoScreenEl && howtoScreenEl.classList.remove('hidden'));
if (howtoBackBtn) howtoBackBtn.addEventListener('click', () => howtoScreenEl && howtoScreenEl.classList.add('hidden')); // 첫 화면으로
// START: 타이틀을 닫고 HUD 를 켜며 시뮬레이션을 시작
function startGame() {
  if (game.started) return;
  game.started = true;
  document.body.classList.remove('titlescreen'); // 게임 HUD 노출
  if (titleScreenEl) titleScreenEl.classList.add('hidden');
  if (howtoScreenEl) howtoScreenEl.classList.add('hidden');
  drive.active = true;                            // 주행 시뮬레이션 활성(카운트다운 동안엔 정지)
  beginCountdown();                                // 즉시 출발이 아니라 3-2-1 카운트다운 후 시작(grace 는 0 도달 시 부여)
  resumeAudio();                                  // 사용자 제스처 → 오디오/엔진음 시작
  if (bgmEl) bgmEl.play().catch(() => {});         // 사용자 제스처 안에서 배경음악 재생 시작(자동재생 정책)
}

// 조종석 창(미니맵)을 더블클릭/더블탭 → 조종석 시점을 전체화면으로(작은 창엔 게임 화면).
// 다시 작은 창을 더블클릭하면 원래대로(게임 전체 / 조종석 작은 창).
const minimapEl = document.getElementById('minimap');
const minimapLabelEl = document.querySelector('#minimap .label');
function toggleCockpitMain() {
  if (!game.started) return;
  cockpitMain = !cockpitMain;
  // 작은 창에 무엇이 보이는지에 맞춰 라벨 갱신
  if (minimapLabelEl) minimapLabelEl.textContent = cockpitMain ? 'CHASE' : 'COCKPIT';
}
if (minimapEl) {
  // 더블클릭/더블탭(마우스·터치 공통, 이벤트 타임스탬프로 간격 측정). 일시정지 버튼 위는 제외.
  let _miniLastTap = -1e9;
  minimapEl.addEventListener('pointerup', (e) => {
    if (e.target.closest('#pause-btn')) return;
    if (e.timeStamp - _miniLastTap < 300) { toggleCockpitMain(); _miniLastTap = -1e9; }
    else _miniLastTap = e.timeStamp;
  });

  // 모바일: Score/Best/다이아몬드를 조종석 작은 창 안(안내문 아래)으로 옮겨 표시
  if (IS_MOBILE) {
    document.body.classList.add('mobile');
    const scoreEl = document.getElementById('score');
    if (scoreEl) minimapEl.appendChild(scoreEl);
    if (diamondsEl) minimapEl.appendChild(diamondsEl);
  }
}

// 최고 기록(localStorage 에 저장 — Restart=리로드 후에도 유지)
try { game.best = parseInt(localStorage.getItem('magma_best') || '0', 10) || 0; } catch (e) { game.best = 0; }
if (bestValEl) bestValEl.textContent = game.best;

function addScore(delta) {
  game.score += delta;
  if (scoreValEl) scoreValEl.textContent = game.score;
  // 현재 점수가 최고 기록을 넘으면 최고 기록도 같이 올라간다
  if (game.score > game.best) {
    game.best = game.score;
    if (bestValEl) bestValEl.textContent = game.best;
    try { localStorage.setItem('magma_best', String(game.best)); } catch (e) {}
  }
}
// 점수 변동 텍스트를 띄운 뒤, SCORE 표시 위치까지 날아가 그 근처에서 사라진다.
// (CSS 고정 키프레임 대신 Web Animations API 로 매번 목표 좌표를 향해 이동)
function popText(text, x, y, color, size) {
  const el = document.createElement('div');
  el.className = 'float-pop';
  el.textContent = text;
  el.style.color = color;
  el.style.fontSize = (size || 22) + 'px';
  document.body.appendChild(el);
  // (x,y)가 중심이 되도록 측정 후 좌상단을 절반만큼 당긴다(이후 px 단위로만 이동).
  el.style.left = (x - el.offsetWidth / 2) + 'px';
  el.style.top = (y - el.offsetHeight / 2) + 'px';
  // 목표 = SCORE 숫자 중심(없으면 점수 영역, 그래도 없으면 좌상단 위쪽).
  let tx = x, ty = y - 80;
  const target = scoreValEl || document.getElementById('score');
  if (target) {
    const r = target.getBoundingClientRect();
    tx = r.left + r.width / 2;
    ty = r.top + r.height / 2;
  }
  const dx = tx - x, dy = ty - y;
  // 화면 중앙을 경유점으로 둔다(스폰 기준 상대 오프셋).
  const cx = window.innerWidth / 2 - x, cy = window.innerHeight / 2 - y;
  const anim = el.animate([
    // 스폰 → 화면 중앙(최대 3배까지 커짐) → 스코어보드(작아지며 사라짐)
    { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
    { transform: `translate(${cx * 0.5}px, ${cy * 0.5}px) scale(1.8)`, opacity: 1, offset: 0.22 },
    { transform: `translate(${cx}px, ${cy}px) scale(3.0)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(0.9)`, opacity: 1, offset: 0.85 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0 },
  ], { duration: 1500, easing: 'cubic-bezier(0.33, 0, 0.3, 1)' });
  anim.onfinish = () => el.remove();
}
// 해당 버튼(좌/우) 바로 위에서 점수 변동을 띄운다
function popAtButton(id, text, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const r = el.getBoundingClientRect();
  popText(text, r.left + r.width / 2, r.top - 10, color, 22);
}
function updateDiamonds() {
  if (!diamondsEl) return;
  // 남은 다이아몬드는 채워진 ◆, 잃은 자리는 테두리만 남은 ◇(흐리게)로 표시
  const on = '◆'.repeat(game.diamonds);
  const off = '◇'.repeat(MAX_DIAMONDS - game.diamonds);
  diamondsEl.innerHTML = on + '<span class="lost">' + off + '</span>';
}
// 충돌 시 다이아몬드 1개 소멸 → 다 사라지면 게임오버.
// 단, 마지막 다이아몬드를 잃어도 즉시 끝내지 않고, 충돌 스핀이 멈춘 뒤(animate 의
// 스핀 처리에서) 게임오버되도록 pendingOver 플래그만 세운다.
function loseDiamond() {
  if (game.over) return;
  game.diamonds = Math.max(0, game.diamonds - 1);
  updateDiamonds();
  if (game.diamonds <= 0) game.pendingOver = true;
}
// cockpit 중앙 버튼: 게임 일시정지/재개(오디오도 함께).
// 재개는 즉시가 아니라 3-2-1 카운트다운 후에 주행이 다시 시작된다.
function togglePause() {
  if (game.over) return;
  if (game.countdown > 0) return; // 카운트다운 진행 중엔 토글 무시
  game.paused = !game.paused;
  if (pauseBtn) pauseBtn.textContent = game.paused ? '▶' : '⏸';
  headlightFlash.active = false; setHeadlight(false); // 진행 중이던 섬광 즉시 종료(정지 중 잔광 방지)
  if (game.paused) {
    const ctx = getAudioCtx();
    if (ctx) ctx.suspend(); // 즉시 무음(엔진/효과음·배경음악은 syncAudio 가 함께 정지)
  } else {
    beginCountdown();        // 재개도 3-2-1 후 출발
    // iOS: AudioContext.resume() 은 반드시 사용자 제스처(이 클릭) 안에서 호출해야 한다.
    // 카운트다운 동안 컨텍스트는 켜 두고 엔진음은 게인으로 차단 → 카운트다운 후 엔진음 복원.
    const ctx = getAudioCtx();
    if (ctx) ctx.resume();
  }
}
function gameOver() {
  game.over = true;
  drive.active = false; // 시뮬레이션 정지
  headlightFlash.active = false; setHeadlight(false); // 섬광 종료
  const ctx = getAudioCtx();
  if (ctx) ctx.suspend(); // 사운드 끄기
  if (gameoverScoreEl) gameoverScoreEl.textContent = game.score;
  if (gameoverEl) gameoverEl.classList.remove('hidden');
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  syncAudio(); // 게임 중에만 사운드 ON, 그 외엔 OFF 강제

  // 시작/재개 카운트다운(3-2-1). 0이 되면 비로소 주행을 시작한다(그 전엔 월드 정지).
  if (game.started && !game.over && !game.paused && game.countdown > 0) {
    game.countdown -= dt;
    const n = Math.ceil(game.countdown);
    if (n !== game.cdShown) { game.cdShown = n; if (n > 0) showCountdownNum(String(n)); }
    if (game.countdown <= 0) {
      game.countdown = 0;
      if (countdownEl) countdownEl.classList.add('hidden');
      game.grace = START_GRACE; // 출발 직후 충돌 면제 시작
    }
  }

  if (drive.active && !game.paused && game.countdown <= 0) {
    let decelNorm = 0; // 브레이크등 세기(스핀/복귀 중엔 0)
    if (game.grace > 0) game.grace -= dt; // 시작/재개 후 충돌 면제 시간 카운트다운

    if (drive.state === 'drive') {
      // --- slow-in / fast-out 속도 ---
      // 전방 브레이킹 구간(속도 비례)을 스캔해 가장 낮은 허용 속도를 목표로 삼는다.
      //  · 현재 위치 한계 포함 → apex 에서 느림 유지
      //  · 전방 표본 → 코너 '진입 전' 미리 감속(slow-in)
      //  · apex 통과 후 출구가 펴지면 목표가 올라가 가속(fast-out)
      const brakeU = (drive.speed * BRAKE_TIME) / drive.length;
      let targetSpeed = cornerSpeedLimit(drive.u);
      for (let i = 1; i <= BRAKE_SAMPLES; i++) {
        targetSpeed = Math.min(
          targetSpeed,
          cornerSpeedLimit(drive.u + brakeU * (i / BRAKE_SAMPLES))
        );
      }
      // 비대칭 반응: 감속은 강하게(slow-in), 가속은 부드럽게(fast-out)
      const rate = targetSpeed < drive.speed ? SPEED_BRAKE : SPEED_ACCEL;
      drive.speed += (targetSpeed - drive.speed) * Math.min(1, dt * rate);

      // 부스터: 유효 속도 = drive.speed × drive.boost. boost 는 1로 서서히 감쇠한다
      // (스페이스/더블탭에서 1.2로 튀고, 여기서 점점 1.0 으로 복귀 → 점진 감속 효과).
      drive.boost += (1 - drive.boost) * Math.min(1, dt * BOOST_DECAY);
      if (drive.boost < 1.001) drive.boost = 1;
      const v = drive.speed * drive.boost; // 실제 전진/조향에 쓰는 유효 속도

      // 감속도(속도 감소율) → 브레이크등 세기
      const accel = (drive.speed - drive.prevSpeed) / Math.max(dt, 1e-4);
      drive.prevSpeed = drive.speed;
      decelNorm = Math.min(Math.max(-accel, 0) / drive.maxSpeed, 1); // 0~1

      // --- 좌/우 화살표로 주행선 횡오프셋(-3w..3w) 조정 ---
      const latInput = (keyInput.right ? 1 : 0) - (keyInput.left ? 1 : 0);
      if (latInput !== 0) {
        drive.lateral += latInput * drive.lateralRate * dt;
        drive.lateral = Math.max(-drive.lateralMax, Math.min(drive.lateralMax, drive.lateral));
      } else if (drive.lateral !== 0) {
        // 키를 놓으면 서서히 0(주행선)으로 복귀
        drive.lateral += (0 - drive.lateral) * Math.min(1, dt * LATERAL_RETURN_RATE);
        if (Math.abs(drive.lateral) < 1e-3) drive.lateral = 0;
      }

      // --- 기준 목표를 곡선 위에서 전진(닫힌 곡선이라 u>1 이면 0으로 순환) ---
      drive.u = (drive.u + (v * dt) / drive.length) % 1;

      // --- 관성 주행(추격 모델): 곡선 위 앞 지점을 목표로 조향. 횡오프셋과 무관하게
      //     '기준 위치'(basePos)가 주행선을 추격하게 해 추격 루프의 진동을 막는다.
      //     조향 각속도는 접지력(grip)으로 제한 → 급코너에선 못 꺾고 밖으로 밀림 ---
      drive.curve.getPointAt((drive.u + drive.aimAhead) % 1, _aim);
      const desiredHeading = Math.atan2(
        -(_aim.z - drive.basePos.z),
        _aim.x - drive.basePos.x
      );
      // 목표와의 각도차를 [-π, π]로 래핑
      let dAng = desiredHeading - drive.heading;
      dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
      // 접지력 한계 → 최대 선회 각속도 ω = grip / v (속도가 빠를수록 덜 꺾임)
      const maxTurn = (drive.grip / Math.max(v, 1e-3)) * dt;
      drive.heading += Math.max(-maxTurn, Math.min(maxTurn, dAng));

      // 기준 위치를 진행 방향으로 전진
      const fx = Math.cos(drive.heading);
      const fz = -Math.sin(drive.heading);
      drive.basePos.x += fx * v * dt;
      drive.basePos.z += fz * v * dt;

      // 실제(충돌·표시) 위치 = 기준 위치 + 차의 오른쪽(sinθ,0,cosθ)으로 횡오프셋.
      // 추격 루프와 분리되어 있어 진동이 없고, 충돌 판정도 오프셋을 정확히 반영한다.
      car.position.set(
        drive.basePos.x + Math.sin(drive.heading) * drive.lateral,
        0,
        drive.basePos.z + Math.cos(drive.heading) * drive.lateral
      );
      car.rotation.y = drive.heading;
    } else if (drive.state === 'spin') {
      // 충돌 스핀: 진행 속도를 유지한 채 미끄러지며 회전 → 멈추면 복귀로.
      // 단, 마지막 다이아몬드를 잃은 상태(pendingOver)면 스핀이 멈추는 순간 게임오버.
      drive.boost = 1; // 충돌 시 부스터 해제
      if (stepSpin(drive, car, dt)) {
        if (game.pendingOver) gameOver();
        else enterRecover(drive, car);
      }
    } else { // 'recover'
      // 정지 후 원래 주행 곡선으로 복귀 → 도달하면 정상 주행 재개
      if (stepRecover(drive, car, dt)) resumeHero();
    }
    if (drive.cooldown > 0) drive.cooldown -= dt;

    // --- 브레이크등: 감속도에 비례해 후면을 적색 발광(스핀/복귀 중엔 서서히 소등) ---
    brake.glow += (decelNorm - brake.glow) * Math.min(1, dt * 10); // 부드럽게
    if (brakeMaterial) brakeMaterial.emissiveIntensity = brake.glow * 3.5;
    if (brakeLight) brakeLight.intensity = brake.glow * brakeLight.userData.peak;

    // --- 전방 헤드라이트 섬광(앞차 따라잡을 때 5회 번쩍) ---
    updateHeadlightFlash(dt);

    // --- 부스터 화염: boost(1→1.2) 비율에 비례해 길이·세기, 약간의 깜빡임 ---
    const boostInt = Math.max(0, (drive.boost - 1) / (BOOST_FACTOR - 1)); // 0~1
    if (boostLight) boostLight.intensity = boostInt * boostLight.userData.peak;
    for (const fl of boostFlames) {
      if (boostInt <= 0.01) { fl.visible = false; continue; }
      fl.visible = true;
      const flick = 0.82 + 0.18 * Math.sin(camFollow.t * 42 + fl.position.z); // 불꽃 깜빡임
      fl.material.opacity = boostInt * 0.85 * flick;
      fl.scale.x = 0.6 + boostInt * 0.8;             // 굵기
      fl.scale.z = 0.6 + boostInt * 0.8;
      fl.scale.y = (0.5 + boostInt * 1.2) * flick;   // 길이(로컬 Y = 차 뒤로 뻗는 방향)
    }

    // --- 속도계: 실제 진행 속도 → 측정 km/h → 표시(×1.5) + 바늘 각도 ---
    if (speedValEl && needleEl && drive.maxSpeed > 0) {
      const groundSpeed = drive.state === 'drive' ? drive.speed * drive.boost : drive.slideSpeed;
      const frac = Math.max(0, Math.min(1, groundSpeed / drive.maxSpeed)); // 0~1(게이지 비율)
      const measured = frac * SPEED_MAX_KMH;            // 측정 속도(km/h)
      speedValEl.textContent = Math.round(measured * SPEED_DISPLAY_MULT); // 표시 = 측정×배율
      // 바늘: 측정 비율 기준 0 → -90°(왼쪽), 최고 → +90°(오른쪽), 회전축 (100,110)
      const ang = frac * 180 - 90;
      needleEl.setAttribute('transform', `rotate(${ang.toFixed(1)} 100 110)`);
      updateEngine(frac); // 속도 비례 엔진음
    }

    // 점수: 매 1초마다 floor(현재 속도 km/h / 10) 누적
    game.sec += dt;
    if (game.sec >= 1) {
      game.sec -= 1;
      const gs = drive.state === 'drive' ? drive.speed * drive.boost : drive.slideSpeed;
      const kmh = (gs / drive.maxSpeed) * SPEED_MAX_KMH;
      addScore(Math.floor(kmh)); // 1점 단위(나누는 수 10→1)
      // 좌/우 버튼(또는 화살표)을 누르고 있으면 해당 버튼마다 10점 감점 + -10 팝업
      if (keyInput.left)  { addScore(-10); popAtButton('btn-left',  '-10', '#ff5a4a'); }
      if (keyInput.right) { addScore(-10); popAtButton('btn-right', '-10', '#ff5a4a'); }
    }

    // 카메라가 차를 따라가도록 이동량만큼 평행이동(궤도·줌은 사용자 제어 유지)
    _delta.subVectors(car.position, camFollow.prev);
    camera.position.add(_delta);
    controls.target.add(_delta);
    camFollow.prev.copy(car.position);

    // 카메라 높이를 지면 기준으로 높아졌다 낮아졌다(사인파). 진동의 '증분'만
    // 더해 OrbitControls 의 궤도/줌과 충돌 없이 위아래로 흔들리게 한다.
    camFollow.t += dt;
    const bob = camFollow.bobAmp * Math.sin(camFollow.t * CAM_BOB_OMEGA);
    camera.position.y += bob - camFollow.bobPrev;
    camFollow.bobPrev = bob;

    // 차량 뒤를 일정 거리(차 길이의 약 3배)로 따라간다 — 타깃까지 거리를 고정.
    // (현재 시선 방향은 유지하고 거리만 고정값으로 맞춤 → 뒤쪽 90° 제한과 함께 추격뷰)
    _dir.subVectors(camera.position, controls.target);
    const curDist = _dir.length();
    if (curDist > 1e-4) {
      _dir.multiplyScalar(camFollow.chaseDist / curDist);
      camera.position.copy(controls.target).add(_dir);
    }

    // 태양광(그림자)도 차를 따라다녀 큰 트랙에서도 그림자를 선명하게 유지
    sun.position.copy(car.position).add(SUN_OFFSET);
    sun.target.position.copy(car.position);
    sun.target.updateMatrixWorld();

    // 복귀 중인 차량(주행선으로 돌아오는 차)만 회피 대상으로 수집.
    // 주인공·교통 어느 쪽이든 'recover' 상태면 다른 차들이 비켜준다.
    _obstacles.length = 0;
    if (drive.state === 'recover') _obstacles.push(car.position);
    for (const o of traffic) if (o.state === 'recover') _obstacles.push(o.rig.position);

    // --- 교통 차량(Toyota): 상태머신(주행 / 충돌 스핀 / 곡선 복귀) ---
    // 주인공의 '실제' 속도에 비례시킨다. 주인공이 스핀/복귀로 느려지면 교통도 함께
    // 느려져, 멈춘 주인공 옆을 빠르게 스쳐가는 현상을 막는다.
    const heroSpeed = drive.state === 'drive' ? drive.speed : drive.slideSpeed;
    const trafficDu = (heroSpeed * TOYOTA_SPEED_RATIO * dt) / drive.length;
    for (const t of traffic) {
      if (t.state === 'drive') {
        // 재출발 후 서서히 가속(ramp 0.1→1)
        t.ramp += (1 - t.ramp) * Math.min(1, dt * RESUME_ACCEL);
        t.u = (t.u + trafficDu * t.ramp) % 1;
        drive.curve.getPointAt(t.u, _pos);
        drive.curve.getTangentAt(t.u, _tan);
        _lat.crossVectors(_up, _tan).normalize(); // 횡방향 단위벡터

        // 복귀 중인 차량이 가까우면 횡방향 오프셋을 조정해 비켜준다(복귀 중에만 발동).
        let targetLat = t.lateral;
        for (const op of _obstacles) {
          const odx = op.x - _pos.x, odz = op.z - _pos.z;
          if (odx * odx + odz * odz >= avoidRadius * avoidRadius) continue;
          const obsSide = odx * _lat.x + odz * _lat.z; // 회피 대상의 횡방향 위치
          if (Math.abs(targetLat - obsSide) < avoidClearance) {
            // 현재 위치(curLateral) 기준 대상의 반대쪽으로 비켜준다.
            // (기준을 고정 차선 t.lateral 로 두면 대상이 차선 근처를 지날 때 부호가
            //  매 프레임 뒤집혀 좌우로 진동했음 → 현재 위치 기준이면 멀어지는 쪽으로만
            //  밀려 안정적, 진동 없음.)
            const sideSign = t.curLateral >= obsSide ? 1 : -1;
            targetLat = obsSide + sideSign * avoidClearance;
          }
        }
        t.curLateral += (targetLat - t.curLateral) * Math.min(1, dt * AVOID_RATE);

        t.rig.position.set(_pos.x + _lat.x * t.curLateral, 0, _pos.z + _lat.z * t.curLateral);
        t.heading = Math.atan2(-_tan.z, _tan.x); // +X 앞코를 진행 방향에 정렬
        t.rig.rotation.y = t.heading;

        // 추월 감지: 곡선 파라미터(u) 기준 상대 위치가 '뒤→앞'으로 바뀌면 +50.
        // d 를 (-0.5,0.5] 로 감싸 부호가 곧 앞/뒤. 0 을 연속적으로 통과할 때만 인정
        // (반대편(±0.5) 불연속 점프는 d-relPrev 가 커서 걸러진다).
        if (drive.state === 'drive') {
          let d = drive.u - t.u;
          d -= Math.round(d);
          if (t.relPrev !== undefined && t.relPrev < 0 && d >= 0 && d - t.relPrev < 0.5) {
            addScore(50);
            popText('+50', window.innerWidth / 2, window.innerHeight * 0.42, '#7CFC6A', 30);
          }
          t.relPrev = d;
          // 앞차(d<0=상대가 앞)를 일정 거리 이내로 따라잡으면 헤드라이트 섬광 1세트(5회).
          // 차당 1회만 — 다시 멀어지거나 추월하면 리셋되어 다음 접근 때 또 신호한다.
          const gapAhead = -d * drive.length; // 양수면 상대가 앞쪽(월드 거리)
          if (gapAhead > 0 && gapAhead < headlightFlashDist) {
            if (!t.signaled) { t.signaled = true; startHeadlightFlash(); }
          } else if (gapAhead <= 0 || gapAhead > headlightFlashDist * 1.4) {
            t.signaled = false;
          }
        } else {
          t.relPrev = undefined; // 주인공 스핀/복귀 중엔 판정 보류
        }
      } else if (t.state === 'spin') {
        t.relPrev = undefined; // 충돌 후엔 상대위치 기준을 리셋(복귀 시 오탐 방지)
        t.signaled = false;
        if (stepSpin(t, t.rig, dt)) enterRecover(t, t.rig);
      } else { // 'recover'
        t.relPrev = undefined;
        t.signaled = false;
        if (stepRecover(t, t.rig, dt)) resumeTraffic(t);
      }
      if (t.cooldown > 0) t.cooldown -= dt;
    }

    // --- 충돌 검사(주인공 ↔ 상대) → 양쪽을 서로 반대로 스핀시킨다 ---
    checkCollisions();
  }

  if (!game.paused) updateSparks(dt); // 충돌 스파크 갱신

  controls.update();

  // 카메라가 조종석보다 앞(진행 방향)으로 나가지 않도록 제한한다.
  // 진행축 f=(cosθ,0,-sinθ) 위에서 카메라가 조종석 지점보다 앞서 있으면
  // 그 초과분만큼 뒤로 끌어당겨 조종석 평면에 머무르게 한다(높이는 유지).
  // (스핀 중에는 heading 이 빠르게 돌아 클램프가 흔들리므로 정상 주행일 때만.)
  if (drive.active && drive.state === 'drive' && !game.paused) {
    const fx = Math.cos(drive.heading);
    const fz = -Math.sin(drive.heading);
    const cx = car.position.x + fx * camFollow.cockpitFwd;
    const cz = car.position.z + fz * camFollow.cockpitFwd;
    const ahead = (camera.position.x - cx) * fx + (camera.position.z - cz) * fz;
    if (ahead > 0) {
      camera.position.x -= fx * ahead;
      camera.position.z -= fz * ahead;
    }
  }

  // 주행 중: 카메라를 차량 '뒤쪽'에 두고 좌우로 부드럽게 자동 스윕시킨다.
  // 뒤쪽 방향 = 진행(heading) 반대 → 차가 회전하면 함께 돌아 항상 뒤를 본다.
  // 거리(뒤로 물러난 chaseDist)·높이는 그대로 두고 방위각(좌우)만 사인파로 설정.
  // (스핀 중에는 heading 이 빠르게 돌아 휙휙 돌므로 정상 주행일 때만.)
  if (drive.active && drive.state === 'drive' && !game.paused) {
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    const horiz = Math.hypot(dx, dz); // 수평 거리(추격 거리) — 그대로 유지
    if (horiz > 1e-4) {
      camFollow.sweepT += dt;
      const sweep = Math.sin(camFollow.sweepT * CAM_SWEEP_OMEGA) * CAM_SWEEP_AMP;
      const behindAng = Math.atan2(Math.sin(drive.heading), -Math.cos(drive.heading));
      const az = behindAng + sweep; // 뒤쪽 ± 스윕
      camera.position.x = controls.target.x + Math.cos(az) * horiz;
      camera.position.z = controls.target.z + Math.sin(az) * horiz;
    }
  }

  // --- 조종석(1인칭) 카메라 포즈 갱신 — 전체화면/작은창 어느 쪽에 쓰이든 먼저 계산 ---
  // 차 중심에서 진행 방향 앞·눈높이에 두고, 진행 방향으로 약간(8도) 내려다본다.
  const cockpitReady = miniCam && camFollow.ready && game.started;
  if (cockpitReady) {
    const fx = Math.cos(drive.heading);
    const fz = -Math.sin(drive.heading);
    miniCam.position.set(
      car.position.x + fx * camFollow.camFwd,
      camFollow.eyeHeight,
      car.position.z + fz * camFollow.camFwd
    );
    miniCam.up.set(0, 1, 0);
    const cp = Math.cos(0.14), sp = Math.sin(0.14); // 약 8도 하향
    miniCam.lookAt(
      miniCam.position.x + fx * cp,
      miniCam.position.y - sp,
      miniCam.position.z + fz * cp
    );
  }

  // 구름은 월드 고정(따라가지 않음). 단, cyan 하늘 틴트 구만 카메라를 감싸도록 위치를 맞춘다.
  skyTint.position.copy(camera.position);

  // 스왑 여부: 조종석을 전체화면으로 띄울지(전시 화면 중에는 무시).
  const showcasing = (!game.started || game.paused || game.over) && showcaseGroup;
  const swapped = cockpitMain && cockpitReady && !showcasing;
  const w = window.innerWidth, h = window.innerHeight;
  const fullAspect = w / h, smallAspect = MINIMAP_W / MINIMAP_H;

  // --- 전체화면 패스 ---
  // 정지/게임오버: 게임 화면을 어둡게(노출↓) 하고, 그 위에 전시 모델을 함께 렌더.
  if (showcasing) {
    showcaseAngle += dt * SHOWCASE_SPIN;
    showcaseSpinner.rotation.y = showcaseAngle;
    camera.aspect = fullAspect; camera.updateProjectionMatrix();
    renderer.toneMappingExposure = PAUSE_DARK_EXPOSURE; // 어둡게
    camera.layers.enable(SHOWCASE_LAYER);               // 씬 + 전시 모델 함께
    renderer.render(scene, camera);
    camera.layers.disable(SHOWCASE_LAYER);              // 복구
    renderer.toneMappingExposure = SCENE_EXPOSURE;       // 복구(작은창 패스용)
  } else {
    const mainCam = swapped ? miniCam : camera; // 스왑 시 조종석이 전체화면
    mainCam.aspect = fullAspect; mainCam.updateProjectionMatrix();
    renderer.render(scene, mainCam);
  }

  // --- 작은 창 패스(화면 중앙 상단, 2.5:1) ---
  // 평상시엔 조종석 시점, 스왑 시엔 게임(체이스) 화면을 작은 창에 그린다.
  if (cockpitReady) {
    const smallCam = swapped ? camera : miniCam;
    smallCam.aspect = smallAspect; smallCam.updateProjectionMatrix();
    const mx = (w - MINIMAP_W) / 2;               // 화면 중앙(가로)
    const my = h - MINIMAP_H - MINIMAP_MARGIN;    // 뷰포트 원점은 좌하단 → 상단 배치
    renderer.setScissorTest(true);                // 작은 창 영역만 클리어/렌더
    renderer.setViewport(mx, my, MINIMAP_W, MINIMAP_H);
    renderer.setScissor(mx, my, MINIMAP_W, MINIMAP_H);
    renderer.render(scene, smallCam);
    renderer.setScissorTest(false);               // 원상 복구(다음 프레임 메인 렌더)
    renderer.setViewport(0, 0, w, h);
    // 체이스 카메라를 작은창에 쓴 경우 종횡비를 전체화면 기준으로 되돌려 둔다.
    if (swapped) { camera.aspect = fullAspect; camera.updateProjectionMatrix(); }
  }
}
animate();
