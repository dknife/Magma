import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'; // 스킨드 메시 복제(독립 스켈레톤)

// ---------------------------------------------------------------------------
// 기본 설정값
// ---------------------------------------------------------------------------
const MODEL_URL = './meshes/GenesisMagma.opt.glb'; // Draco 지오메트리 + WebP 텍스처 압축본
const RACEWAY_URL = './meshes/Raceway.opt.glb';     // 트랙 둘레 배치용 압축본(Draco + WebP)
const RACEWAY_COUNT = 24;            // 트랙 둘레에 늘어놓을 레이스웨이 메쉬 개수
const RACEWAY_FILL = 0.9;            // 인접 메쉬 간격 대비 한 개가 차지하는 길이 비(겹침/틈 조절)
const RACEWAY_SCALE = 2.0;           // 기본 크기 배율(둘레 간격 기준) — 두 배로 키움
const RACEWAY_SCALE_JITTER = 0.35;   // 개체별 크기 무작위 변동(±비율) — 불규칙하게
const RACEWAY_MARGIN = 3.5;          // 도로 가장자리에서 바깥으로 띄우는 기본량(roadHalfWidth 배수) — 주행로 침범 방지로 크게
const RACEWAY_RADIAL_JITTER = 1.0;   // 바깥 거리 개체별 무작위 추가량(roadHalfWidth 배수)
const RACEWAY_POS_JITTER = 0.8;      // 둘레 위치 무작위 변동(슬롯 간격 대비 비율) — 불규칙한 간격
const RACEWAY_YAW_OFFSET = 0;        // 메쉬 진행축이 트랙과 안 맞으면 Math.PI/2 등으로 보정
const RACEWAY_YAW_JITTER = Math.PI;  // 개체별 무작위 회전 범위(±rad) — 똑같은 모습 방지
const TOYOTA_URL = './meshes/Toyota.opt.glb';       // 교통(traffic) 차량 모델 ②(압축본)
const TURACER_URL = './meshes/TURacer.opt.glb';     // 교통/주인공 차량 모델 ③ — 기본 선택(압축본)
const TOYOTA_COUNT = 20;                            // 트랙에 흩뿌릴 교통 차량 대수(세 모델 무작위)
const TREE_URL = './meshes/tree.opt.glb';           // 트랙 안팎 조경용 나무(압축본)
const TREE_COUNT = 140;                             // 트랙 안팎에 흩뿌릴 나무 그루 수
const TREE_SIZE_FACTOR = 1.4;                       // 나무 높이 기준 크기(roadHalfWidth 배수, 스케일 1 기준)
const TREE_SCALE_MIN = 1.0;                         // 나무 개체별 최소 스케일 배율
const TREE_SCALE_MAX = 2.0;                         // 나무 개체별 최대 스케일 배율(크고 작게 무작위)
const TREE_CLEARANCE = 1.2;                         // 도로 가장자리에서 비워둘 거리(roadHalfWidth 배수)
const TREE_FIELD_FACTOR = 1.25;                     // 나무를 흩뿌릴 영역 반경(trackRadius 배수, 안팎 포함)
// 트랙 주변을 도는 사람(걷기/뛰기) — Draco+WebP 압축본. man/woman/racer 세 종류.
const PEOPLE_WALK_URLS = [
  './meshes/manWalk.opt.glb',
  './meshes/WomanWalk.opt.glb',
  './meshes/racerWalk.opt.glb',
];
const PEOPLE_RUN_URLS = [
  './meshes/manRun.opt.glb',
  './meshes/womanRun.opt.glb',
  './meshes/racerRun.opt.glb',
];
const PEOPLE_WALK_COUNT = 18;                       // 종류당 걷는 사람 수(3배)
const PEOPLE_RUN_COUNT = 15;                        // 종류당 뛰는 사람 수(3배)
const CLOUD_COUNT = 18;                             // 하늘에 띄울 뭉게구름 수
const TOYOTA_SPEED_MIN = 0.8;                       // 교통차 속도(주인공 대비) 하한
const TOYOTA_SPEED_MAX = 0.95;                      // 교통차 속도(주인공 대비) 상한 — 차마다 0.8~0.95 랜덤(주인공보다 느림)
const GROUND_SIZE = 1600;   // 그림자받이 바닥 평면 한 변 길이 (월드 단위)
const MAX_DIAMONDS = 5;     // 시작 다이아몬드(생명) 수
const TOTAL_LAPS = 20;      // 완주에 필요한 랩 수
// 모바일 판별 — 모바일은 카메라를 조금 더 멀리(뒤에서 관찰)
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const SCENE_EXPOSURE = 0.82;      // 기본 노출(현실적 낮 — 과한 밝기/만화톤 방지)
const PAUSE_DARK_EXPOSURE = 0.3; // 정지/게임오버 시 배경 어둡게(밝기 절반)
const SPEED_MAX_KMH = 345;      // 측정 기준: drive.maxSpeed ↔ 345 km/h
const MIN_CORNER_KMH = 155;     // 코너에서 이 속도 미만으로는 감속하지 않음(감속 제한)
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
scene.fog = new THREE.Fog(0x9ec6f0, 1500, 5400); // 밝은 하늘색 — 먼 곳을 환한 하늘에 블렌드

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
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b7a52, 1.15); // 하늘색 환경광 / 풀빛 지면 반사(현실적 채움)
scene.add(hemi);

// 큰 트랙에서도 그림자가 선명하도록, 태양광은 차를 따라다니게 한다.
// (그림자 카메라 영역을 차 주변으로 좁게 유지 → 높은 해상도)
// 한낮: 태양을 높이 올려 밝고 짧은 그림자 + 환한 햇빛
const SUN_OFFSET = new THREE.Vector3(95, 130, 72); // 차 기준 태양 위치(고도 ≈ 48°, 한낮)
const sun = new THREE.DirectionalLight(0xfff3e0, 2.6); // 한낮 햇살(따뜻한 흰빛, 현실적 세기)
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
// 하늘에는 ACES 톤매핑을 적용하지 않는다. 톤매핑이 밝은 청색을 옅게(데사츄레이트) 날려
// 하늘이 허옇게 보이므로, 비활성화해 짙고 선명한 청색을 유지한다.
sky.material.toneMapped = false;

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
  g.filter = `blur(${(N * 0.014).toFixed(1)}px)`;          // 원형 덩어리를 부드러운 블롭으로(가장자리 softening)
  const puffCount = 64 + Math.floor(Math.random() * 44);  // 볼륨 수 유지(64~107)
  const C = (b) => Math.max(0, Math.min(255, Math.round(b * 255)));
  const puffCol = (b, al) => `rgba(${C(b)},${C(b + 0.008)},${C(b + 0.03)},${Math.max(0, al).toFixed(3)})`; // 살짝 푸른 회백
  // 알파 범위 [low,high] → [low, (low+high)/2] 로 축소(상위 절반을 깎아 전체적으로 더 투명).
  // new = (alpha + low)/2. low = 알파 최솟값 = (최소 a)·(최소 밝기).
  const A_LOW = 0.07 * (0.5 * 0.62);
  const remapA = (al) => (al + A_LOW) / 2;
  for (let i = 0; i < puffCount; i++) {
    const x = cx + (Math.random() * 2 - 1) * N * 0.34;     // 안쪽으로 모아 가장자리 여백 확보
    const y = baseY - Math.abs(Math.random() + Math.random() - 1) * N * 0.34; // 위로 봉긋(여백 확보)
    const r = N * (0.05 + Math.random() * 0.11);           // 덩어리 크기
    const a = 0.07 + Math.random() * 0.10;                 // 퍼프 기본 알파
    const lum = 0.62 + Math.random() * 0.46;               // 퍼프별 밝기 무작위 → 울퉁불퉁한 음영
    const topB0 = Math.min(0.92, 0.8 * lum);               // 원래 위쪽 밝기(알파 계산용)
    const botB0 = 0.5 * lum;                               // 원래 아래쪽 밝기
    // 색 밝기 변환(알파는 그대로 유지):
    //  1) 상위 절반 이동 2회 누적 → (b0 + 3·high)/4 (밝게)
    //  2) 하위 절반으로 축소 [low,high] → [low,(low+high)/2] → (b + curLow)/2 (윗밝기만 낮춤)
    const HIGH = Math.min(0.92, 0.8 * 1.08);   // 밝기 최댓값
    const CUR_LOW = (0.5 * 0.62 + 3 * HIGH) / 4; // 상위이동 2회 후의 밝기 최솟값
    let topB = (topB0 + 3 * HIGH) / 4;
    let botB = (botB0 + 3 * HIGH) / 4;
    topB = (topB + CUR_LOW) / 2;
    botB = (botB + CUR_LOW) / 2;
    const grad = g.createLinearGradient(0, y - r, 0, y + r);
    grad.addColorStop(0, puffCol(topB, remapA(a * topB0)));   // 알파 범위를 하위 절반으로 축소
    grad.addColorStop(0.5, puffCol(topB, remapA(a * topB0)));
    grad.addColorStop(1, puffCol(botB, remapA(a * botB0)));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';
  // Pass 2 — 볼륨 음영: 구름이 있는 픽셀에만(source-atop) 위→아래 그라데이션을 덧입힌다.
  // 상단은 햇빛 받아 밝게, 하단은 '하늘빛(푸른)'으로 음영지게 → 단순 회색/투명보다 몽글몽글한 볼륨감.
  g.globalCompositeOperation = 'source-atop';
  const vg = g.createLinearGradient(0, N * 0.14, 0, N * 0.94);
  vg.addColorStop(0, 'rgba(255,255,255,0.22)');          // 상단: 햇빛 받은 밝은 윗면(둥글게)
  vg.addColorStop(0.4, 'rgba(255,255,255,0)');           // 중상단: 본래 밝기
  vg.addColorStop(1, 'rgba(138,172,220,0.5)');           // 하단: 부드러운 하늘빛 푸른 그림자(둥근 밑면)
  g.fillStyle = vg;
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'source-over';
  // Pass 3 — 사각 테두리 제거: 캔버스 4면 가장자리로 갈수록 알파를 0으로 부드럽게 줄인다.
  // 가장자리에 걸쳐 잘린 덩어리의 직선 테두리(사각 경계)를 없애 깔끔한 외곽을 보장한다.
  const img = g.getImageData(0, 0, N, N);
  const d = img.data;
  const feather = N * 0.26;                                 // 가장자리 페이드 폭(넓게 → 하늘과 자연스럽게)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const wx = Math.min(1, Math.min(x, N - 1 - x) / feather);
      const wy = Math.min(1, Math.min(y, N - 1 - y) / feather);
      let w = Math.min(wx, wy);                             // 경계 0 → 내부 1
      w = w * w * (3 - 2 * w);                              // smoothstep
      d[(y * N + x) * 4 + 3] *= w;                          // 알파에만 윈도우 적용
    }
  }
  g.putImageData(img, 0, 0);
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
const cloudCenter = new THREE.Vector3(0, 0, 0);       // 돔 중심(코스 원점)
for (let i = 0; i < CLOUD_COUNT; i++) {
  const mat = new THREE.MeshBasicMaterial({
    map: cloudTexes[Math.floor(Math.random() * CLOUD_VARIANTS)], // 변형 텍스처 무작위
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    color: 0xeef2f7,                                      // 살짝 낮춘 흰색 틴트(순백 포화 방지)
    toneMapped: false,                                    // 톤매핑/노출 영향 제거 → 회색 눌림 방지
    opacity: 1.0,                                         // 본체 불투명 → 파란 하늘이 비쳐 흐려지지 않게(외곽만 텍스처 알파로 부드럽게)
  });
  const m = new THREE.Mesh(cloudPlaneGeo, mat);
  // 절반은 산보다 앞(가까운 돔), 절반은 산보다 뒤(먼 돔)에 둔다. 먼 구름은 불투명한 산이
  // 깊이를 기록하므로 봉우리에 가려져 능선 뒤로 보인다. 뒤 구름은 능선 부근 낮은 고도로.
  const farCloud = (i % 9 !== 0);                  // 매우 일부(약 1/9)만 산 앞, 나머지는 모두 산 뒤
  const domeR = farCloud
    ? GROUND_SIZE * (2.65 + Math.random() * 0.2)  // 산 뒤(반경 > 산) → 봉우리에 가려짐
    : 1700 + Math.random() * 700;                 // 산 앞(가깝게)
  // 돔 표면 좌표: 방위각은 둘레에 고루, 고도각은 하늘 중상단(낮은 구름은 만들지 않음).
  const az = (i / CLOUD_COUNT) * Math.PI * 2 + Math.random() * 0.6;
  const el = THREE.MathUtils.degToRad(farCloud ? (22 + Math.random() * 30) : (30 + Math.random() * 36)); // 최소 고도 ↑ → 낮은 구름 제거
  const horiz = Math.cos(el) * domeR;
  m.position.set(Math.cos(az) * horiz, Math.sin(el) * domeR, Math.sin(az) * horiz);
  m.lookAt(cloudCenter);                          // 판의 정면(+Z)이 돔 중심을 향함
  m.rotateZ((Math.random() * 2 - 1) * 0.18);      // 정면축 기준 약간의 롤로 변주
  const w = (1300 + Math.random() * 1400) * (farCloud ? 1.6 : 1.0); // 먼 구름은 키워 원근 보정
  m.scale.set(w, w * (0.46 + Math.random() * 0.24), 1); // 가로세로 비율 변주
  clouds.add(m);
}

// 하늘에 cyan 틴트를 깔아 더 푸르게: 카메라를 감싸는 큰 구(BackSide)를 반투명 cyan 으로
// 그려 '먼 배경(하늘)'에만 옅게 덧입힌다. 구름·사물은 구보다 앞에 있어 물들지 않는다.
// 청명한 하늘 그라데이션: 천정은 진한 청색, 지평선은 옅은 하늘색(맑고 선명한 느낌).
const skyTintGeo = new THREE.SphereGeometry(4500, 24, 16);
{
  const topCol = new THREE.Color(0x0a1aee);      // 천정(순청색 #0000FF 에 가깝게 짙은 파랑)
  const horizonCol = new THREE.Color(0x46c6f2);  // 지평선(붉은 기 빼고 녹색·파랑 유지 → 맑은 하늘색)
  const pos = skyTintGeo.attributes.position;
  const colors = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let t = (pos.getY(i) / 4500) * 0.5 + 0.5;    // 0=바닥, 1=천정
    t = Math.max(0, Math.min(1, t));
    t = Math.pow(t, 0.9);                          // 위로 갈수록 점점 짙은 파랑
    tmp.copy(horizonCol).lerp(topCol, t);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  skyTintGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}
const skyTint = new THREE.Mesh(
  skyTintGeo,
  new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, transparent: true, opacity: 0.8, // 채도 살린 청명한 틴트(상단 짙게)
    depthWrite: false, fog: false,
    toneMapped: false,                                      // 톤매핑 제외 → 청색이 옅게 날아가지 않게
  })
);
// 틴트 구의 중심이 매 프레임 카메라로 옮겨져 정렬 거리가 0이 되면 구름보다 앞에 그려져 덮어버린다.
// renderOrder 를 낮춰 항상 배경(구름 뒤)으로 먼저 그리게 고정한다.
skyTint.renderOrder = -1;
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
// ---------------------------------------------------------------------------
// 절차적 지형 높이장 — 완만하게 일렁이는 곡면. 트랙·나무·사람·차·바닥이 모두 이 위에 놓인다.
// terrainAmp/terrainF 는 모델 로드 후 차 크기(maxDim)에 맞춰 설정(그 전엔 0=평면).
// 빌드 시점(트랙/나무 등)과 매 프레임(차/사람 등) 같은 함수를 써야 정확히 들어맞는다.
// ---------------------------------------------------------------------------
let terrainAmp = 0;   // 기복 진폭(월드 단위)
let terrainF = 0;     // 기본 공간 주파수(클수록 잦은 굴곡) — 트랙 크기 기준으로 설정
function terrainHeight(x, z) {
  if (terrainAmp <= 0) return 0;
  const f = terrainF;
  return terrainAmp * (
    0.72 * Math.sin(x * f + 0.7) * Math.cos(z * (f * 0.9) - 0.3)   // 큰 기복(대부분)
    + 0.20 * Math.sin((x - z) * (f * 2.3) + 1.1)                    // 중간 굴곡(약하게)
    + 0.08 * Math.cos((x + z) * (f * 4.5) - 0.5)                    // 작은 잔물결(아주 약하게)
  );
}

// 지형 표면 법선(유한차분). 차/카메라 자세를 노면 기울기에 맞출 때 사용.
let terrainNormalEps = 1;        // 차분 간격 — 모델 로드 후 차 크기 비례로 설정
const _tNorm = new THREE.Vector3();
const _tFwd = new THREE.Vector3();
const _tRgt = new THREE.Vector3();
const _tBasis = new THREE.Matrix4();
function terrainNormal(x, z, out) {
  const e = terrainNormalEps;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize(); // ∝ (-dh/dx, 1, -dh/dz)
}
// obj 를 진행 방향(heading)으로 향하되, 위쪽을 노면 법선에 맞춰 피치·롤을 잡는다(+X=정면 모델 기준).
function orientToTerrain(obj, x, z, heading) {
  terrainNormal(x, z, _tNorm);                          // up = 노면 법선
  _tFwd.set(Math.cos(heading), 0, -Math.sin(heading));  // 평면상 진행 방향
  _tRgt.crossVectors(_tFwd, _tNorm).normalize();        // 로컬 +Z 축
  _tFwd.crossVectors(_tNorm, _tRgt).normalize();         // up 에 수직인 forward 재정렬
  _tBasis.makeBasis(_tFwd, _tNorm, _tRgt);               // 열: X=forward, Y=up, Z=right
  obj.quaternion.setFromRotationMatrix(_tBasis);
}

// 초록색 바닥(잔디) — 노이즈 텍스처 + 절차적 기복(세그먼트 변위). 그림자도 받음
const GROUND_SEGS = 256;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE * 2, GROUND_SIZE * 2, GROUND_SEGS, GROUND_SEGS),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1.0, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2; // 로컬(x,y) → 월드(x, z), 로컬 z → 월드 높이(Y)
ground.position.y = -0.05;         // 트랙 리본 살짝 아래
ground.receiveShadow = true;
scene.add(ground);
// 지형 높이를 바닥 메시에 반영(모델 로드로 terrainAmp 가 정해진 뒤 호출)
function applyTerrainToGround() {
  const pos = ground.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), ly = pos.getY(i); // -90° X회전: 월드 x=lx, z=-ly, 높이 Y=로컬 z
    pos.setZ(i, terrainHeight(lx, -ly));       // 도로와 같은 좌표로 샘플 → 정확히 정렬
  }
  pos.needsUpdate = true;
  ground.geometry.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// 먼 산(절차적) — 지평선 너머에 산맥 실루엣을 빙 둘러 세운다. 안개(fog)로 흐릿하게
// 블렌드돼 공기 원근(멀수록 옅음)을 만든다. 카메라를 따라가지 않는 월드 고정.
// ---------------------------------------------------------------------------
// 능선 높이는 각도만의 주기 함수로 구해 링이 이음매 없이 닫힌다. 위 꼭짓점을 안쪽으로
// 당겨(slope) 경사면을 만들고, 봉우리일수록 밝은 색으로 정점 컬러를 보간한다.
function buildMountainRange(radius, hMin, hMax, segs, phase, slope, radialJitter, colBase, colPeak) {
  const positions = [];
  const colors = [];
  const cB = new THREE.Color(colBase);
  const cP = new THREE.Color(colPeak);
  const ridge = (a) =>
    Math.max(0, 0.5 + 0.5 * (
      Math.sin(a * 3 + phase) * 0.5 +
      Math.sin(a * 7 + phase * 1.7) * 0.25 +
      Math.sin(a * 13 + phase * 0.6) * 0.15 +
      Math.sin(a * 23 + phase * 2.3) * 0.08));
  const col = (i) => {
    const a = (i / segs) * Math.PI * 2;
    const peak = Math.pow(ridge(a), 1.3);            // 봉우리 강조(골은 낮게)
    const h = hMin + (hMax - hMin) * peak;
    const r = radius + Math.sin(a * 5 + phase) * radialJitter; // 둘레 거리 변주(비원형)
    const topR = r - h * slope;                      // 위로 갈수록 안쪽 → 경사면
    return { bx: Math.cos(a) * r, bz: Math.sin(a) * r,
             tx: Math.cos(a) * topR, tz: Math.sin(a) * topR, h, t: peak };
  };
  const pushV = (x, y, z, t) => {
    positions.push(x, y, z);
    const c = cB.clone().lerp(cP, y <= 0 ? 0 : t);   // 바닥=어둡게, 봉우리=밝게
    colors.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < segs; i++) {
    const a = col(i), b = col(i + 1);
    pushV(a.bx, 0, a.bz, 0); pushV(b.bx, 0, b.bz, 0); pushV(a.tx, a.h, a.tz, a.t);
    pushV(b.bx, 0, b.bz, 0); pushV(b.tx, b.h, b.tz, b.t); pushV(a.tx, a.h, a.tz, a.t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1.0, metalness: 0.0,
    flatShading: true, side: THREE.DoubleSide,        // 저폴리 각진 산 + 양면
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -1;                                  // 지면과 살짝 겹쳐 틈 방지
  return m;
}
// 두 겹의 산맥: 뒤(멀고 높고 더 흐릿) + 앞(가깝고 낮게)으로 깊이감.
scene.add(buildMountainRange(
  GROUND_SIZE * 2.35, GROUND_SIZE * 0.22, GROUND_SIZE * 0.62, 220, 0.0, 0.34,
  GROUND_SIZE * 0.12, 0x5b6b78, 0x9fb4bd)); // 먼 산(푸르스름한 회청)
scene.add(buildMountainRange(
  GROUND_SIZE * 1.95, GROUND_SIZE * 0.14, GROUND_SIZE * 0.42, 200, 2.1, 0.40,
  GROUND_SIZE * 0.10, 0x47584e, 0x7c9183)); // 가까운 산(녹회색)

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
  steerYaw: 0,                    // 좌/우 입력 시 시각적 yaw 틀기(이동 경로엔 영향 없음, 0으로 복귀)
};

// 좌/우 화살표 키 입력(주행선 횡오프셋 조정)
const keyInput = { left: false, right: false };
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (!game.started) { cycleCar(-1); return; } // 타이틀 화면에선 차량 선택
    keyInput.left = true;
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (!game.started) { cycleCar(1); return; }
    keyInput.right = true;
  }
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
  drainEnergy(5); // 부스터는 에너지 5% 소모(0 되면 다이아 1개 차감 후 재충전)
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

// 마우스 좌우 드래그로 좌/우 조작(좌/우 버튼을 누른 것과 동일).
// 드래그 시작점 기준 왼쪽으로 끌면 좌, 오른쪽으로 끌면 우. 주행 중에만 동작하며,
// 이때 OrbitControls 궤도 회전은 비활성화(animate)되어 드래그가 조향으로만 쓰인다.
let mouseSteer = false, steerStartX = 0;
const STEER_DEAD = 10; // 데드존(px) — 미세 떨림 무시
function steerActive() { return game.started && !game.over && !game.paused && game.countdown <= 0; }
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;          // 마우스 좌클릭 드래그만
  if (e.target.closest && e.target.closest('button, #minimap')) return;
  if (!steerActive()) return;
  mouseSteer = true; steerStartX = e.clientX;
});
window.addEventListener('pointermove', (e) => {
  if (!mouseSteer) return;
  const dx = e.clientX - steerStartX;
  keyInput.left = dx < -STEER_DEAD;   // 시작점보다 왼쪽 → 좌
  keyInput.right = dx > STEER_DEAD;    // 시작점보다 오른쪽 → 우
});
function endMouseSteer() {
  if (!mouseSteer) return;
  mouseSteer = false; keyInput.left = false; keyInput.right = false;
}
window.addEventListener('pointerup', endMouseSteer);
window.addEventListener('pointercancel', endMouseSteer);

// 탭 핸들러 등록(iOS 신뢰성). 터치에서는 click 이 손가락 미세 이동/제스처 판정으로 자주
// 누락되므로, 탭 대상은 pointer 이벤트로 직접 처리한다(이동 허용오차 12px 안이면 탭으로 간주).
// 핵심: 이 요소에서 'pointerdown 으로 시작된' 제스처만 처리한다(downHere). 그래야 버튼을
// 눌러 새 오버레이가 그 자리에 뜬 뒤 따라오는 '합성 click' 이 오버레이로 들어와도 무시된다.
function onTap(el, fn) {
  if (!el) return;
  let sx = 0, sy = 0, moved = false, downHere = false;
  el.addEventListener('pointerdown', (e) => {
    downHere = true; moved = false; sx = e.clientX; sy = e.clientY;
  });
  el.addEventListener('pointermove', (e) => {
    if (downHere && (Math.abs(e.clientX - sx) > 12 || Math.abs(e.clientY - sy) > 12)) moved = true;
  });
  el.addEventListener('pointerup', (e) => {
    if (!downHere) return;
    if (e.pointerType !== 'mouse') {     // 터치/펜: 여기서 즉시 처리하고 이어지는 click 은 무시
      downHere = false;
      if (!moved) { e.preventDefault(); fn(e); }
    }
    // 마우스는 downHere 를 유지 → 곧 이어질 click 에서 처리
  });
  el.addEventListener('pointercancel', () => { downHere = false; });
  el.addEventListener('click', (e) => {
    if (!downHere) return;               // 이 요소에서 시작된 클릭만(겹쳐 뜬 오버레이로 들어온 합성 click 무시)
    downHere = false;
    fn(e);
  });
}

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

// 배경 음악(TUGameSong.mp3) — START 이후엔 끊지 않고 계속 재생
const bgmEl = document.getElementById('bgm');
if (bgmEl) bgmEl.volume = 0.22; // 엔진음·충돌음(효과음)을 가리지 않게 낮게

// 선택 가능한 배경음악 목록. 여기에 { name, url } 을 추가하면 음표 메뉴에 자동으로 노출된다.
const SONGS = [
  { name: 'TU Game Never Stops', url: './TUGameNeverStop.mp3' }, // 기본곡(우선 선택)
  { name: '멈추지 않아', url: './TUNoStop.mp3' },
  { name: '질주하는 TU GAME', url: './TUGameSong.mp3' },
  // 예) { name: '새 곡 제목', url: './NewSong.mp3' },
];
let selectedSong = 0;                 // SONGS 인덱스(기본: TU Game Never Stops)
let bgmEnabled = true;                // false = '배경음악 사용 안 함'
let loadedSongUrl = SONGS[0].url;     // 현재 <audio> 에 로드된 곡 url(중복 교체 방지)

// 사운드 상태 강제 일치(매 프레임 호출). 엔진/효과음은 진행 중에만 ON, 배경 음악은 START 이후 항상 ON.
function syncAudio() {
  // 엔진/효과음 컨텍스트는 진행 중엔 켜 두고, 엔진음 자체는 카운트다운이 끝난 실제 주행 중에만
  // (게인으로 차단 — iOS resume 제스처 문제 회피). 배경 음악은 <audio> 요소라 컨텍스트와 무관.
  const playing = game.started && !game.paused && !game.over && !game.frozen;
  const engineOn = playing && game.countdown <= 0;
  // 배경 음악: 한 번 시작(START)되면 일시정지·정지(F)·게임오버에서도 멈추지 않고 계속 재생한다.
  // 단, 음표 메뉴에서 '사용 안 함'(bgmEnabled=false)을 고르면 재생하지 않는다.
  if (bgmEl && bgmEnabled && game.started && bgmEl.paused) bgmEl.play().catch(() => {});
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

// 아이템 획득 효과음: 상승하는 음들. 다이아는 짧고 맑은 3음, 에너지는 길게 상승하는 5음(~0.8초).
function playPickupSound(type) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  if (type === 'energy') {
    const base = 520;
    const notes = [base, base * 1.2, base * 1.5, base * 1.8, base * 2.2];
    const step = 0.13, dur = 0.28; // 길게(마지막 음 ~0.52s 시작 + 0.28s → 총 ~0.8s)
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = now + i * step;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    });
  } else { // diamond
    const base = 880;
    [base, base * 1.25, base * 1.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = now + i * 0.07;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.18);
    });
  }
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
let markerNearDist = 0;     // 이 거리 안의 상대 차 마커는 노란색으로 깜빡임 — 모델 로드 후 설정
let markerBlinkT = 0;       // 마커 깜빡임 위상 누적(s)
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
const FINISH_DECEL = 0.7;       // 완주 후 서서히 감속하는 강도
const FINISH_EDGE_RATE = 1.2;   // 완주 후 도로 가장자리(연석)로 붙는 속도
const CURB_ZONE_FRAC = 0.8;     // 횡오프셋이 한계의 이 비율을 넘으면 '연석' 구간으로 봄
const CURB_SPEED_FRAC = 0.8;    // 연석을 밟고 달릴 때 최고 속도의 이 비율로 감속
const LATERAL_RETURN_RATE = 4.0;// 좌우 키를 놓으면 횡오프셋이 0으로 복귀하는 속도(1/s) — 더 빠르게(민감)
const STEER_YAW_MAX = 0.16;     // 좌/우 입력 시 차량 yaw 틀기 최대각(rad, 약 9°)
const STEER_YAW_RATE = 6.0;     // yaw 틀기/복귀 보간 속도(1/s)

// 충돌/스핀/복귀 튜닝
const SPIN_OMEGA0 = 8.0;        // 충돌 직후 회전 각속도(rad/s) — 스핀을 조금 더 크게
const SPIN_OMEGA_DECAY = 2.7;   // 회전 감쇠율(1/s) — 낮춰서 회전이 조금 더 오래(총 회전량↑)
const SPIN_OMEGA_STOP = 0.3;    // 이 각속도 미만이면 스핀 종료로 보고 복귀
const SPIN_SPEED_DECAY = 9.0;   // 진행 속도 감쇠율(1/s) — 18→9 로 절반 → 0 수렴 시간 2배
const SPIN_PUSH_FRAC = 0.6;     // 충돌 시 서로 밀어내는 추진 속도(maxSpeed 비율)
const SPIN_PUSH_FWD = 0.4;      // 밀림 방향에 섞는 전방 모멘텀 비중(분리 방향이 주, 전방은 보조)
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
const COLLISION_DIST_FRAC = 0.5;  // 충돌(스핀/복귀) 중 추격 거리 축소 비율 — 차량에 근접 관찰
const COLLISION_CAM_RATE = 3.0;   // 추격 거리/위치 전환 속도(부드럽게)
const COLLISION_CAM_ELEV = 0.7;   // 충돌 관찰 카메라 고도각(rad, ≈40°) — 위쪽에서 내려다봄
const CAM_TILT_FACTOR = 2.0;      // 카메라 롤/피치 연동 강도(1=차량과 동일, 2=차량의 2배로 민감)
const CAM_TILT_RATE = 6;          // 카메라 up 보간 속도(부드럽게)
const _camUpTarget = new THREE.Vector3(0, 1, 0); // 카메라 목표 up(노면 기울기 반영)
const SHOWCASE_SPIN = 0.6;      // 차량 선택 전시 모델 회전 각속도(rad/s)
const SHOWCASE_EXPOSURE = 1.05; // 스튜디오 전시 노출(스포트라이트 기준)
const COCKPIT_FWD_RATIO = 0.10; // 차 중심 기준 조종석의 전방 위치(차 길이 비율)

// 미니맵(화면 중앙 상단): 조종석 전방 시점. 가로:세로 = 2.5:1.
// 픽셀 크기·여백은 index.html 의 #minimap 프레임과 일치시킨다.
// 작은 창: 모바일은 작게(60%)·좌측 정렬, 데스크탑은 원래 크기(320×154)·가운데.
const MINIMAP_W = IS_MOBILE ? 192 : 320;   // 너비(px)
const MINIMAP_H = IS_MOBILE ? 92 : 154;    // 높이(px)
const MINIMAP_MARGIN = 16;      // 화면 가장자리 여백(px)
const MINIMAP_LAYER = 1;        // 조종석 카메라 전용 마커 레이어(메인 화면은 무시)
const MINIMAP_OPACITY = 0.75;   // 작은 창 합성 불투명도(뒤 전체화면이 25% 비침)
// 작은 창을 75% 불투명도로 합성하기 위한 오프스크린 타깃 + 전체화면 위 오버레이 쿼드.
// (작은 시점을 타깃에 렌더 → 메인 화면을 지우지 않고 그 영역에 반투명 쿼드로 덧그림)
const _miniPR = renderer.getPixelRatio();
const miniRT = new THREE.WebGLRenderTarget(
  Math.ceil(MINIMAP_W * _miniPR), Math.ceil(MINIMAP_H * _miniPR)
);
const miniOverlayScene = new THREE.Scene();
const miniOverlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const miniOverlayMat = new THREE.MeshBasicMaterial({
  map: miniRT.texture, transparent: true, opacity: MINIMAP_OPACITY,
  depthTest: false, depthWrite: false, toneMapped: false, // 이미 톤매핑된 타깃 → 재적용 금지
});
miniOverlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), miniOverlayMat));
let miniCam = null;             // 조종석 전방 시점 카메라(모델 로드 후 생성)
let cockpitMain = true;         // true=조종석 시점이 전체화면, 게임(체이스) 화면이 작은 창(시작 기본값, 더블클릭 토글)
let _collisionHidden = false;   // 충돌 근접뷰 동안 작은 창(DOM) 숨김 상태 추적
let showcaseScene = null;       // 차량 선택용 스튜디오 씬(게임 씬과 분리)
let showcaseCam = null;         // 스튜디오 관찰 카메라(고정)
let showcaseSpinner = null;     // 차만 Y축으로 도는 턴테이블(조명은 고정)
let showcaseAngle = 0;          // 전시 회전 각도

// 차량 선택(타이틀 화면): 좌우 화살표로 주인공 메시를 고른다.
// 각 옵션의 model 은 +X 정면·바닥 안착·동일 덩치로 정규화된 Object3D(로드 시 채움).
let heroModel = null;           // 현재 차 리그 안의 주인공 메시
let showcaseModel = null;       // 현재 전시(회전) 클론
let selectedCar = 2;            // 0 = Genesis Magma, 1 = Toyota, 2 = TU Racer(기본 선택)
const carOptions = [
  { name: 'Genesis Magma', sub: 'Genesis Magma - 한국 최초 Le Mans 24시 완주', model: null, ready: false },
  { name: 'Toyota',        sub: 'Toyota - 2026 Le Mans 우승',                  model: null, ready: false },
  { name: 'TU GAME Racer', sub: 'TU GAME Racer - 미래로 달리는 동명의 게임',       model: null, ready: false },
];
const carSubEl = document.getElementById('car-sub');

// 전시(쇼케이스)용 클론 생성: 스튜디오 스포트라이트를 받고 바닥에 그림자를 드리운다.
function makeShowcaseClone(model) {
  const c = model.clone();
  c.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      // 머티리얼 복제(원본 공유 방지). 스튜디오 조명을 정상적으로 받도록 toneMapped 는 기본 유지.
      if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
      else o.material = o.material.clone();
    }
  });
  return c;
}

// 주인공 메시 교체(차 리그 안). 브레이크등/부스터 화염 등 다른 자식은 그대로 둔다.
function setHeroModel(model) {
  if (heroModel && heroModel.parent === car) car.remove(heroModel);
  heroModel = model;
  car.add(heroModel);
}

// 전시 클론 교체(쇼케이스 스피너 안).
function setShowcaseModel(model) {
  if (!showcaseSpinner) return;
  if (showcaseModel) showcaseSpinner.remove(showcaseModel);
  showcaseModel = makeShowcaseClone(model);
  showcaseSpinner.add(showcaseModel);
}

// 현재 선택을 화면(주행 차량·전시 차량·부제)에 반영.
function applyCarSelection() {
  const opt = carOptions[selectedCar];
  if (!opt || !opt.ready || !opt.model) return;
  setHeroModel(opt.model);
  setShowcaseModel(opt.model);
  if (carSubEl) carSubEl.textContent = opt.sub;
}

// 좌우 화살표/버튼으로 준비된 차량만 순환 선택(게임 시작 전에만).
function cycleCar(dir) {
  if (game.started) return;
  const n = carOptions.length;
  let i = selectedCar;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (carOptions[i].ready) { selectedCar = i; break; }
  }
  applyCarSelection();
  respawnTraffic();   // 선택 모델은 교통에서 제외(다른 차량이 못 쓰게)
}
const camFollow = {
  prev: new THREE.Vector3(),
  ready: false,
  t: 0,                          // 높이 진동 위상 누적 시간
  bobPrev: 0,                    // 직전 프레임의 진동 오프셋
  bobAmp: 0,                     // 진동 진폭 — 모델 로드 후 설정
  sweepT: 0,                     // 좌우 스윕 위상 누적 시간
  up: new THREE.Vector3(0, 1, 0),// 현재 카메라 up(노면 기울기로 롤/피치 연동, 부드럽게 보간)
  chaseDist: 0,                  // 기본 추격 거리(차 길이의 약 3배) — 모델 로드 후 설정
  dist: 0,                       // 현재 적용 추격 거리(충돌 시 근접으로 보간) — 로드 후 설정
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

// 스핀 시작: 회전을 부여하고, 미끄러질 방향(dirX,dirZ)으로 밀려나게 한다(주행 제어 상실).
function startSpin(rec, omega, heading, speed, dirX, dirZ) {
  rec.state = 'spin';
  rec.omega = omega;
  rec.heading = heading;
  rec.slideSpeed = speed;
  const l = Math.hypot(dirX, dirZ);
  if (l > 1e-4) rec.slideDir.set(dirX / l, 0, dirZ / l);     // 지정 방향으로 밀림(충돌 분리 등)
  else rec.slideDir.set(Math.cos(heading), 0, -Math.sin(heading)); // 폴백: 진행 방향
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
  // 제자리 회전 + 회전 감쇠. 자세는 노면에 맞추되 yaw 는 rec.heading(이전 틸트 잔재 제거).
  rec.heading += rec.omega * dt;
  orientToTerrain(obj, obj.position.x, obj.position.z, rec.heading);
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

  // 차의 진행 방향으로 서서히 전진
  obj.position.x += Math.cos(rec.heading) * rs * dt;
  obj.position.z += -Math.sin(rec.heading) * rs * dt;

  // 자세를 노면에 맞추고 yaw 를 '실제 이동 방향'(rec.heading)에 정렬(이전 틸트 잔재 제거 → 바라보는 방향=이동 방향)
  orientToTerrain(obj, obj.position.x, obj.position.z, rec.heading);

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
  const cruiseU = drive.speed * t.speedRatio;
  t.ramp = Math.max(0.05, Math.min(1, t.slideSpeed / Math.max(cruiseU, 1e-3)));
  t.cooldown = COLLISION_COOLDOWN;
  t.state = 'drive';
}

// 주인공 ↔ 상대 충돌 검사. 둘 다 정상 주행(쿨다운 해제) 상태일 때만 발동.
// 상대가 주인공의 오른쪽이면 주인공 반시계(+)/상대 시계(-), 왼쪽이면 그 반대.
function checkCollisions() {
  if (game.grace > 0 || game.finishing) return; // 시작 무적 / 완주 마무리 중엔 충돌 무시
  if (drive.state !== 'drive' || drive.cooldown > 0) return;
  for (const t of traffic) {
    if (t.state !== 'drive' || t.cooldown > 0) continue;
    const dx = t.rig.position.x - car.position.x;
    const dz = t.rig.position.z - car.position.z;
    if (dx * dx + dz * dz > collisionDist * collisionDist) continue;
    // 주인공 기준 오른쪽 벡터 = (sinθ, 0, cosθ); 양수면 상대가 오른쪽.
    const side = dx * Math.sin(drive.heading) + dz * Math.cos(drive.heading);
    const heroCCW = side > 0 ? 1 : -1; // 우측 충돌 → 반시계(+)
    // 분리(밀어내기) 방향: 두 차 중심을 잇는 선을 따라 서로 반대로 → 자연스럽게 간격이 벌어진다.
    let sx = -dx, sz = -dz; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl; // 주인공이 밀려날 방향
    const hfx = Math.cos(drive.heading), hfz = -Math.sin(drive.heading); // 주인공 전방
    const tfx = Math.cos(t.heading), tfz = -Math.sin(t.heading);         // 상대 전방
    const push = drive.maxSpeed * SPIN_PUSH_FRAC;                         // 분리 추진 속도(둘 동일)
    startSpin(drive, heroCCW * SPIN_OMEGA0, drive.heading, push, hfx * SPIN_PUSH_FWD + sx, hfz * SPIN_PUSH_FWD + sz);
    startSpin(t, -heroCCW * SPIN_OMEGA0, t.heading, push, tfx * SPIN_PUSH_FWD - sx, tfz * SPIN_PUSH_FWD - sz);
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
  // 반경을 여러 하모닉으로 크게 변주 → 안쪽으로 패인 만(灣)이 생겨 곡선이 비(非)볼록해진다.
  // 비볼록 닫힌곡선은 변곡점에서 곡률 부호가 바뀌므로 우회전뿐 아니라 좌회전도 섞인다.
  const NP = 26;
  const pts2d = [];
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * Math.PI * 2;
    const r = 0.70                     // 기본 반경(곡률 조금 더 주려고 살짝 줄임)
      + 0.20 * Math.sin(a * 2 + 0.5)   // 2-로브(땅콩형) — 양쪽 오목한 만 → 좌회전 구간
      + 0.12 * Math.sin(a * 3 - 0.8);  // 3-로브 — 코너 수(급한 sin5θ 미세굴곡은 제외)
    pts2d.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const points = pts2d.map(([x, z]) =>
    new THREE.Vector3(x * radius, 0, z * radius)
  );
  // 곡률 완화: 라플라시안 스무딩(닫힌 루프) — 각 점을 양 이웃의 중점 쪽으로 당겨
  // 굴곡을 줄인다. 좌/우 코너 특징은 남기되 뾰족함만 줄이도록 1패스만 적용.
  const SMOOTH_K = 0.5, SMOOTH_PASSES = 1;
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
    const lx = p.x + lat.x, lz = p.z + lat.z, rx = p.x - lat.x, rz = p.z - lat.z;
    positions.push(lx, terrainHeight(lx, lz) + 0.02, lz); // 좌(지형 위)
    positions.push(rx, terrainHeight(rx, rz) + 0.02, rz); // 우(지형 위)
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

  // 연석(가장자리 빗금) — 곡률에 따라 바깥쪽(코너 외측)을 더 두껍게 만들고,
  // 일정 곡률 이상(급코너)이면 노란색, 그 외(완만/직선)는 파란색 무늬를 흰색과 교대로 칠한다.
  const STRIPE_SEGS = 300;                  // 줄무늬 교대 분할 수
  const baseBand = roadHalfWidth * 0.12;    // 기본 연석 폭(= 파란색 연석 두께)
  const CURB_SHARP_THRESH = 0.25;           // 이 곡률(sharp) 이상이면 노란색(낮출수록 노랑 구간이 길어짐)
  const YELLOW_PEAK = 3;                     // 노란색 구간 바깥쪽 연석 최대 두께(파란색 대비 배율)
  // 세그먼트별 곡률(sharp)·회전부호(cross.y) 미리 계산 — 양쪽 연석이 같은 u 기준을 쓰도록.
  const segSharp = new Array(STRIPE_SEGS);
  const segTurn = new Array(STRIPE_SEGS);
  {
    const ta = new THREE.Vector3(), tb = new THREE.Vector3();
    for (let i = 0; i < STRIPE_SEGS; i++) {
      const u = i / STRIPE_SEGS;
      curve.getTangentAt(u, ta);
      curve.getTangentAt((u + CORNER_EPS) % 1, tb);
      segSharp[i] = Math.min(ta.angleTo(tb) / TURN_MAX, 1);   // 0=직선, 1=급코너
      segTurn[i] = ta.z * tb.x - ta.x * tb.z;                 // 접선 변화의 외적 y성분(회전 방향)
    }
  }
  // 바깥쪽 연석 두께 배율(humpOut): 노란색(급코너) 구간마다 파란색 두께(1배)에서 시작해
  // 가운데에서 YELLOW_PEAK(3배)까지 부풀었다가 다시 1배로 줄어드는 사인 험프를 만든다.
  // 닫힌 루프이므로 '노랑이 아닌' 지점에서부터 구간을 끊어 처리(구간이 0을 넘어 감기지 않게).
  const N = STRIPE_SEGS;
  const isYellow = segSharp.map((s) => s >= CURB_SHARP_THRESH);
  const humpOut = new Array(N).fill(1);
  const fillRun = (start, len) => {
    for (let j = 0; j < len; j++) {
      const t = (j + 0.5) / len;             // 구간 내 위치(0~1) — 가운데(0.5)에서 최대
      humpOut[(start + j) % N] = 1 + (YELLOW_PEAK - 1) * Math.sin(Math.PI * t);
    }
  };
  if (isYellow.every(Boolean)) {
    fillRun(0, N);                           // 전 구간이 노랑이면 루프 전체를 하나의 험프로
  } else if (isYellow.some(Boolean)) {
    let base = 0; while (isYellow[base]) base++; // 노랑이 아닌 시작점(여기서 끊으면 구간 안 감김)
    let i = 0;
    while (i < N) {
      if (!isYellow[(base + i) % N]) { i++; continue; }
      let len = 0;
      while (len < N && isYellow[(base + i + len) % N]) len++;
      fillRun((base + i) % N, len);
      i += len;
    }
  }
  const sPos = [], sCol = [], sIdx = [];
  const sp = new THREE.Vector3(), stan = new THREE.Vector3(), slat = new THREE.Vector3();
  const colWhite = new THREE.Color(0xefefef);
  const colYellow = new THREE.Color(0xf2c014); // 급코너 경고
  const colBlue = new THREE.Color(0x2f6cf0);   // 완만/직선
  let vbase = 0;
  for (let side = 0; side < 2; side++) {
    const latSign = side === 0 ? 1 : -1;       // +lat = up×tan 방향(코스 진행 기준 한쪽)
    for (let i = 0; i < STRIPE_SEGS; i++) {
      const sharp = segSharp[i];
      const isOuter = latSign * segTurn[i] < 0;            // 이 변이 코너 바깥쪽인가
      // 바깥쪽은 험프 배율(노랑 구간에서 1→3→1)로 두껍게, 안쪽은 항상 기본 두께.
      const band = baseBand * (isOuter ? humpOut[i] : 1);
      // 두꺼워질 때 항상 도로 '바깥'으로만 넓어지게: 도로쪽 경계는 고정, 바깥 경계만 밀어낸다.
      const innerEdge = latSign * (roadHalfWidth - baseBand);        // 도로쪽 경계(고정)
      const outerEdge = latSign * (roadHalfWidth - baseBand + band); // 바깥 경계(두께만큼 도로 밖으로)
      const accent = sharp >= CURB_SHARP_THRESH ? colYellow : colBlue;
      const col = i % 2 === 0 ? accent : colWhite;          // 무늬색 ↔ 흰색 교대
      const u0 = i / STRIPE_SEGS, u1 = (i + 1) / STRIPE_SEGS;
      for (const [u, off] of [[u0, innerEdge], [u0, outerEdge], [u1, innerEdge], [u1, outerEdge]]) {
        curve.getPointAt(u, sp);
        curve.getTangentAt(u, stan);
        slat.crossVectors(up, stan).normalize();
        const ex = sp.x + slat.x * off, ez = sp.z + slat.z * off;
        sPos.push(ex, terrainHeight(ex, ez) + 0.03, ez); // 지형 위(도로보다 살짝 위)
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

  // 차선(흰색 점선) — 4차선 도로: 중앙선 + 좌/우 중간선(중앙↔가장자리의 중간) = 분리선 3개.
  // 곡선을 LANE_CELLS 칸으로 나눠 각 칸의 앞부분(LANE_DASH_FRAC)만 칠해 점선을 만든다.
  // 대시 길이를 이전의 70%로 줄이되 빈칸(간격)은 유지: 이전 대시 0.45/120·간격 0.55/120 →
  // 새 대시 0.315/120, 주기 0.865/120 → 칸 수 ≈139, 한 칸 내 대시 비율 ≈0.365.
  const LANE_CELLS = 85;                        // 점선 칸 수(대시 길이 유지, 빈칸만 2배: 139→85)
  const LANE_DASH_FRAC = 0.223;                 // 한 칸에서 대시가 차지하는 비율(대시 길이는 139·0.365 와 동일)
  const laneHalfW = roadHalfWidth * 0.02;       // 차선 표시선 폭(이전 0.04의 절반)
  const LANE_OFFSETS = [-roadHalfWidth * 0.5, 0, roadHalfWidth * 0.5]; // 좌중간·중앙·우중간
  const lPos = [], lIdx = [];
  const lp = new THREE.Vector3(), ltan = new THREE.Vector3(), llat = new THREE.Vector3();
  let lbase = 0;
  for (const c of LANE_OFFSETS) {
    for (let i = 0; i < LANE_CELLS; i++) {
      const u0 = i / LANE_CELLS, u1 = (i + LANE_DASH_FRAC) / LANE_CELLS;
      for (const [u, off] of [[u0, c - laneHalfW], [u0, c + laneHalfW], [u1, c - laneHalfW], [u1, c + laneHalfW]]) {
        curve.getPointAt(u, lp);
        curve.getTangentAt(u, ltan);
        llat.crossVectors(up, ltan).normalize();
        const ex = lp.x + llat.x * off, ez = lp.z + llat.z * off;
        lPos.push(ex, terrainHeight(ex, ez) + 0.04, ez); // 지형 위(도로·가장자리보다 살짝 위)
      }
      lIdx.push(lbase, lbase + 1, lbase + 3, lbase, lbase + 3, lbase + 2);
      lbase += 4;
    }
  }
  const laneGeo = new THREE.BufferGeometry();
  laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(lPos, 3));
  laneGeo.setIndex(lIdx);
  laneGeo.computeVertexNormals();
  const lane = new THREE.Mesh(
    laneGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
    })
  );
  lane.receiveShadow = true;
  scene.add(lane);

  // 출발/결승선 격자(체커) 바닥 — u=0 부근에 도로 폭 전체로 길게 깐다(흑/백 교대).
  const startLenWorld = roadHalfWidth * 3.2;             // 길게
  const startUEnd = startLenWorld / drive.length;
  const CK_COLS = 8, CK_ROWS = 14;                       // 가로(도로폭)·세로(진행) 분할
  const ckPos = [], ckCol = [], ckIdx = [];
  const ckp = new THREE.Vector3(), cktan = new THREE.Vector3(), cklat = new THREE.Vector3();
  let ckBase = 0;
  for (let r = 0; r < CK_ROWS; r++) {
    const u0 = (r / CK_ROWS) * startUEnd, u1 = ((r + 1) / CK_ROWS) * startUEnd;
    for (let cc = 0; cc < CK_COLS; cc++) {
      const o0 = -roadHalfWidth + (cc / CK_COLS) * 2 * roadHalfWidth;
      const o1 = -roadHalfWidth + ((cc + 1) / CK_COLS) * 2 * roadHalfWidth;
      const v = (r + cc) % 2 === 0 ? 0.92 : 0.05;        // 흑/백 체커
      for (const [u, off] of [[u0, o0], [u0, o1], [u1, o0], [u1, o1]]) {
        curve.getPointAt(u % 1, ckp);
        curve.getTangentAt(u % 1, cktan);
        cklat.crossVectors(up, cktan).normalize();
        const ex = ckp.x + cklat.x * off, ez = ckp.z + cklat.z * off;
        ckPos.push(ex, terrainHeight(ex, ez) + 0.06, ez); // 도로·차선 위에 살짝
        ckCol.push(v, v, v);
      }
      ckIdx.push(ckBase, ckBase + 1, ckBase + 3, ckBase, ckBase + 3, ckBase + 2);
      ckBase += 4;
    }
  }
  const ckGeo = new THREE.BufferGeometry();
  ckGeo.setAttribute('position', new THREE.Float32BufferAttribute(ckPos, 3));
  ckGeo.setAttribute('color', new THREE.Float32BufferAttribute(ckCol, 3));
  ckGeo.setIndex(ckIdx);
  ckGeo.computeVertexNormals();
  const checker = new THREE.Mesh(ckGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveIntensity: 0, // 마지막 랩에 반짝이게(평소 0)
  }));
  checker.receiveShadow = true;
  scene.add(checker);
  finishChecker = checker; // 결승선 체커(마지막 랩 반짝임용)
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
        const rwx = p.x + lat.x * side * dist, rwz = p.z + lat.z * side * dist;
        rig.position.set(rwx, terrainHeight(rwx, rwz), rwz); // 지형 위에 안착
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
        rig.position.set(x, terrainHeight(x, z), z); // 지형 위에 안착(proto 가 min.y=0 정렬)
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
// 사람(걷기/뛰기) — 트랙에서 조금 떨어진 바깥 링을 돌며 걷거나 뛴다.
// ---------------------------------------------------------------------------
// 압축본을 한 번 로드해 키를 차 높이 기준으로 정규화한 뒤, SkeletonUtils.clone 으로
// (스킨드 메시라 독립 스켈레톤 필요) 여러 개 복제한다. 각 개체는 트랙 곡선을 따라(교통차와
// 같은 방식) 도로 가장자리 바로 바깥을 걷거나 뛰며, 진행(접선) 방향을 바라보도록 회전한다.
// → 주행 중 도로변에서 가까이 지나치므로 또렷이 보인다.
const people = []; // { mixer, rig, u, du, lat }
// 사람 모델의 정면 보정. 정면 = 진행 방향(0). 뒷걸음으로 보이면 Math.PI 로 바꾼다.
const PEOPLE_YAW_OFFSET = 0;
// 사람 애니메이션 컬링용: 카메라 절두체 밖이면서 차에서 먼 사람은 스켈레톤 갱신을 생략한다.
// (Three.js 는 '렌더링'만 절두체 컬링하고, 스켈레톤 mixer 갱신은 화면 밖이라도 계속 돈다.)
const _frustums = [new THREE.Frustum(), new THREE.Frustum()]; // 체이스 + 조종석 카메라용
const _peopleCams = [null, null]; // 매 프레임 [camera, miniCam] 으로 갱신(재할당 없이 재사용)
const _cullMat = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere(new THREE.Vector3(), 1);
let cullSphereR = 1;   // 사람 1인 바운딩 반경(절두체 판정 여유) — 모델 로드 후 설정
let cullNearR2 = 0;    // 이 거리(제곱) 안의 사람은 시야와 무관하게 항상 애니메이션 — 로드 후 설정

function loadPeople(refSize, roadHalfWidth) {
  const targetH = refSize.y * 3.6;         // 사람 키(2.4에서 1.5배로 키움)
  const maxDim = Math.max(refSize.x, refSize.y, refSize.z);
  for (const url of PEOPLE_WALK_URLS) spawnPeopleType(url, PEOPLE_WALK_COUNT, targetH, roadHalfWidth, maxDim * 1.3, 'walk');
  for (const url of PEOPLE_RUN_URLS) spawnPeopleType(url, PEOPLE_RUN_COUNT, targetH, roadHalfWidth, maxDim * 3, 'run');
}

function spawnPeopleType(url, count, targetH, roadHalfWidth, baseSpeed, kind) {
  gltfLoader.load(
    url,
    (gltf) => {
      const proto = gltf.scene;
      proto.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      // 키를 targetH 로 맞추는 스케일(원본 높이 기준).
      const size = new THREE.Box3().setFromObject(proto).getSize(new THREE.Vector3());
      const s = targetH / (size.y || 1);
      const clip = gltf.animations[0]; // 파일당 클립 1개(walking_man / running)
      const len = drive.length || 1;

      for (let i = 0; i < count; i++) {
        const root = cloneSkinned(proto); // 스킨드 메시는 SkeletonUtils 로 복제(스켈레톤 독립)
        root.scale.setScalar(s);
        const cbox = new THREE.Box3().setFromObject(root);
        root.position.y = -cbox.min.y;    // 발이 y=0 에 닿도록 안착

        const rig = new THREE.Group();    // 곡선 위 위치·진행 방향을 담당
        rig.add(root);
        scene.add(rig);

        const mixer = new THREE.AnimationMixer(root);
        const action = mixer.clipAction(clip);
        action.timeScale = 0.85 + Math.random() * 0.4; // 개체별 보폭 변주
        action.play();

        // 도로 가장자리 바로 바깥(좌/우 무작위)에 배치. 진행 방향(시계/반시계)·속도 변주.
        const side = Math.random() < 0.5 ? 1 : -1;
        const lat = side * roadHalfWidth * (1.6 + Math.random() * 2.0); // 도로 밖 여유
        const dir = Math.random() < 0.5 ? 1 : -1;
        const v = baseSpeed * (0.8 + Math.random() * 0.4);
        people.push({ mixer, rig, u: i / count + Math.random() * 0.02, du: (dir * v) / len, lat });
      }
      console.log(`[People] ${kind} ${count}명 배치(도로변 lat≈${roadHalfWidth.toFixed(1)}×)`);
    },
    undefined,
    (err) => console.error(`[People] 로드 실패(${url}):`, err)
  );
}

// 매 프레임: 애니메이션 갱신 + 트랙 곡선을 따라 이동 + 진행 방향으로 회전.
// cams: 이번 프레임에 실제로 그려지는 카메라들(체이스/조종석). 이들 시야 밖이면서
// 차에서도 먼 사람은 스켈레톤 갱신(고비용)을 생략해 성능을 아낀다.
function updatePeople(dt, cams) {
  if (!drive.curve) return;
  // 충돌 후 스핀·주행선 복귀 중에는 사람을 렌더링하지 않는다.
  // (제어를 잃고 주행선으로 되돌아오는 동안 도로변 사람과 부딪히는 장면 방지)
  const hidePeople = drive.state !== 'drive';
  // 렌더되는 카메라들의 절두체를 미리 계산(사람마다 재계산하지 않도록).
  let nf = 0;
  for (const cam of cams) {
    if (!cam || nf >= _frustums.length) continue;
    _cullMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustums[nf].setFromProjectionMatrix(_cullMat);
    nf++;
  }
  for (const p of people) {
    if (p.rig.visible === hidePeople) p.rig.visible = !hidePeople;
    if (hidePeople) continue;            // 숨김 중엔 애니메이션·이동도 멈춰 둔다
    // 위치·방향은 항상 갱신(저비용) → 컬링 판정이 정확하고, 재등장 시 위치가 튀지 않는다.
    p.u = (p.u + p.du * dt + 1) % 1;
    drive.curve.getPointAt(p.u, _pos);
    drive.curve.getTangentAt(p.u, _tan);
    _lat.crossVectors(_up, _tan).normalize();         // 도로 횡방향 단위벡터
    { const ex = _pos.x + _lat.x * p.lat, ez = _pos.z + _lat.z * p.lat;
      p.rig.position.set(ex, terrainHeight(ex, ez), ez); } // 지형 위
    // 진행(접선) 방향을 바라보게: 이동 방향 = sign(du)·접선
    const sgn = p.du >= 0 ? 1 : -1;
    p.rig.rotation.y = Math.atan2(sgn * _tan.x, sgn * _tan.z) + PEOPLE_YAW_OFFSET;
    // 스켈레톤 애니메이션(고비용)은 근거리이거나 카메라 시야 안일 때만 갱신.
    const dx = p.rig.position.x - car.position.x;
    const dz = p.rig.position.z - car.position.z;
    let animateThis = dx * dx + dz * dz < cullNearR2;
    if (!animateThis) {
      _cullSphere.center.copy(p.rig.position);
      _cullSphere.radius = cullSphereR;
      for (let k = 0; k < nf; k++) { if (_frustums[k].intersectsSphere(_cullSphere)) { animateThis = true; break; } }
    }
    if (animateThis) p.mixer.update(dt);
  }
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
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = '#1a1a1a';   // 어두운 외곽선(틴트와 무관하게 대비 유지)
  g.stroke();
  g.fillStyle = '#ffffff';     // 흰색 채움 → 머티리얼 color 로 틴트(빨강 ↔ 노랑)
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

  // 차량 위쪽의 역삼각형(▼) 마커. 항상 보이게(depthTest off). 수직선은 두지 않아 차를 가리지 않는다.
  const s = size.x * 1.2;           // 역삼각형 크기
  const topY = size.y + s * 0.9;    // 마커 높이
  const tri = new THREE.Sprite(new THREE.SpriteMaterial({
    map: _triTex, color: 0xff3030, toneMapped: false, depthTest: false, transparent: true,
  }));
  tri.scale.set(s, s, 1);
  tri.position.y = topY;            // 차량 위에 띄움
  tri.layers.set(MINIMAP_LAYER);
  group.add(tri);
  return { group, tri };           // tri 머티리얼을 매 프레임 근접 색/깜빡임에 사용
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
// 축포(불꽃놀이) — 완주 축하용. 하늘에서 구형으로 터지는 컬러 파티클.
// ---------------------------------------------------------------------------
let fwSystem = null, fwGravity = 0, fwBurstSpeed = 0, fwSpawnY = 0, fwSpread = 0;
let fwActive = false, fwTimer = 0;
function initFireworks(maxDim) {
  const COUNT = 900;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  const mat = new THREE.PointsMaterial({
    size: maxDim * 0.22, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const data = [];
  for (let i = 0; i < COUNT; i++) data.push({ vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, r: 1, g: 1, b: 1 });
  fwSystem = { posAttr: geo.attributes.position, colAttr: geo.attributes.color, data };
  fwGravity = maxDim * 9;
  fwBurstSpeed = maxDim * 7;
  fwSpawnY = maxDim * 8;       // 폭발 높이(차 위로)
  fwSpread = maxDim * 10;      // 폭발 위치 좌우 분산
}
// (x,y,z)에서 한 발 터뜨린다(무작위 밝은 색, 구형 분출).
function launchFirework(x, y, z) {
  if (!fwSystem) return;
  const { data, posAttr, colAttr } = fwSystem;
  const col = new THREE.Color().setHSL(Math.random(), 1.0, 0.6);
  let spawned = 0;
  for (let i = 0; i < data.length && spawned < 110; i++) {
    const p = data[i];
    if (p.life > 0) continue;
    p.maxLife = 1.0 + Math.random() * 0.8;
    p.life = p.maxLife;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const sp = fwBurstSpeed * (0.55 + Math.random() * 0.6);
    p.vx = Math.sin(ph) * Math.cos(th) * sp;
    p.vy = Math.cos(ph) * sp;
    p.vz = Math.sin(ph) * Math.sin(th) * sp;
    p.r = col.r; p.g = col.g; p.b = col.b;
    posAttr.setXYZ(i, x, y, z);
    colAttr.setXYZ(i, col.r, col.g, col.b);
    spawned++;
  }
  posAttr.needsUpdate = true; colAttr.needsUpdate = true;
}
function updateFireworks(dt) {
  if (!fwSystem) return;
  // 활성(완주 축하) 동안 주기적으로 차 주변 하늘에서 한 발씩.
  if (fwActive) {
    fwTimer -= dt;
    if (fwTimer <= 0) {
      fwTimer = 0.45 + Math.random() * 0.5;
      launchFirework(
        car.position.x + (Math.random() * 2 - 1) * fwSpread,
        car.position.y + fwSpawnY + (Math.random() * 2 - 1) * fwSpread * 0.3,
        car.position.z + (Math.random() * 2 - 1) * fwSpread
      );
    }
  }
  const { data, posAttr, colAttr } = fwSystem;
  let any = false;
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    if (p.life <= 0) continue;
    any = true;
    p.life -= dt;
    if (p.life <= 0) { colAttr.setXYZ(i, 0, 0, 0); posAttr.setXYZ(i, 0, -1e6, 0); continue; }
    p.vy -= fwGravity * dt;
    const drag = Math.max(0, 1 - 1.0 * dt);
    p.vx *= drag; p.vz *= drag;
    const ix = i * 3;
    posAttr.array[ix] += p.vx * dt;
    posAttr.array[ix + 1] += p.vy * dt;
    posAttr.array[ix + 2] += p.vz * dt;
    const f = p.life / p.maxLife;               // 점점 어두워지며 사라짐(가산 블렌딩)
    colAttr.setXYZ(i, p.r * f, p.g * f, p.b * f);
  }
  if (any) { posAttr.needsUpdate = true; colAttr.needsUpdate = true; }
}

// ---------------------------------------------------------------------------
// 교통(traffic) 차량 — 세 가지 모델(Genesis / Toyota / TU Racer)을 무작위로 채용
// ---------------------------------------------------------------------------
// 세 모델을 각각 한 번씩 로드해 메인 차량과 비슷한 크기로 정규화한 뒤(프로토타입),
// N대 각각이 세 프로토타입 중 하나를 무작위로 골라 복제(geometry/material 공유 →
// 가벼움)한다. 각 대는 곡선 위 진행값(u)을 무작위 간격으로 나눠 갖고, 주행선
// 횡오프셋도 무작위라 한 줄로 늘어서지 않는다. 주행은 animate 루프에서 곡선을
// 따라 진행하며 속도는 주인공 대비 0.8~0.95.

// 로드된 차량 씬을 +X 정면·바닥 안착·중심 정렬 + 메인 차량 덩치로 정규화.
function prepareCarProto(root, refSize, scaleMul = 1) {
  root.traverse((obj) => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
  root.rotation.y = Math.PI;               // +X 정면(메인 차량과 동일)
  root.updateMatrixWorld(true);
  // 크기 측정 → 메인 차량의 최대 치수에 맞춰 스케일(비슷한 덩치로). scaleMul 로 모델별 미세 보정.
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const refMax = Math.max(refSize.x, refSize.y, refSize.z);
  const myMax = Math.max(size.x, size.y, size.z) || 1;
  root.scale.setScalar((refMax / myMax) * scaleMul);
  root.updateMatrixWorld(true);
  // 스케일 적용 후 재측정 → 바닥 안착(min.y=0)·XZ 중심 정렬 + 크기 산출
  box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const sizeScaled = box.getSize(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  return { model: root, size: sizeScaled };
}

// trafficProtos: carOption 인덱스별 프로토타입 { model, size }. 교통 배치 때 '주인공이 선택한
// 모델'을 제외하기 위해 인덱스를 맞춰 보관한다. trafficReady 가 되면 respawnTraffic 으로 갱신 가능.
const trafficProtos = [];
let trafficCount = 0;
let trafficReady = false;
// genesisProto: { model, size } — 이미 주인공으로 로드·정규화된 Genesis(0번 옵션).
function loadTraffic(genesisProto, refSize, count) {
  trafficProtos[0] = genesisProto;
  trafficCount = count;
  let pending = 2;                          // 비동기 로드 대기 수(Toyota + TU Racer)

  const onReady = (optIdx, scaleMul = 1) => (gltf) => {
    const proto = prepareCarProto(gltf.scene, refSize, scaleMul);
    trafficProtos[optIdx] = proto;
    carOptions[optIdx].model = proto.model.clone(); // 선택지(주인공)용 별도 클론
    carOptions[optIdx].ready = true;
    if (!game.started && selectedCar === optIdx) applyCarSelection(); // 기본 선택 반영
    if (--pending === 0) spawnTraffic();
  };
  const onErr = (name) => (err) => {
    console.error(`[Traffic] ${name} 로드 실패:`, err);
    if (--pending === 0) spawnTraffic(); // 일부 실패해도 남은 모델로 배치
  };

  gltfLoader.load(TOYOTA_URL, onReady(1), undefined, onErr('Toyota'));
  gltfLoader.load(TURACER_URL, onReady(2, 0.9), undefined, onErr('TU Racer')); // 조금 큰 편 → 0.9 로 축소
}

// 준비된 프로토타입들에서 무작위로 골라 N대를 트랙에 흩뿌린다.
// '주인공이 선택한 모델(selectedCar)'은 제외 → 다른 차량은 그 모델을 쓰지 않는다.
function spawnTraffic() {
  const count = trafficCount;
  const usable = trafficProtos.filter((p, idx) => p && idx !== selectedCar);
  trafficReady = true;
  if (!usable.length) return;
  // 곡선 위 시작 위치(u): 등간격 대신 무작위 간격(0.5~1.5배)을 누적·정규화해 다양하게.
  const gaps = [];
  let gapTotal = 0;
  for (let i = 0; i < count; i++) { const g = 0.5 + Math.random(); gaps.push(g); gapTotal += g; }
  const us = [];
  let gapAcc = 0;
  for (let i = 0; i < count; i++) { us.push(gapAcc / gapTotal); gapAcc += gaps[i]; }
  // 리그가 곡선 위치·진행 방향 회전을 담당하고, 안쪽 clone 은 정규화 상태 유지.
  for (let i = 0; i < count; i++) {
    const proto = usable[Math.floor(Math.random() * usable.length)]; // 세 모델 무작위 채용
    const w = proto.size.z;                // 차폭(횡방향, 모델마다 다름)
    const rig = new THREE.Group();
    rig.add(proto.model.clone());
    // 조종석 시점 강조 마커(역삼각형) — 차마다 독립 머티리얼로 생성(근접 시 색/깜빡임 개별 제어)
    const marker = buildCockpitMarker(proto.size);
    rig.add(marker.group);                 // 레이어로 메인 화면엔 숨김
    scene.add(rig);
    // 주행선 횡방향 오프셋: [-3w, 3w] 균등분포로 무작위 결정.
    const lateral = (Math.random() * 2 - 1) * 3 * w;
    traffic.push({
      rig,
      markerTri: marker.tri,               // 근접 시 노란색 깜빡임에 사용
      u: us[i],                            // 곡선 위 무작위 간격 분포
      speedRatio: TOYOTA_SPEED_MIN + Math.random() * (TOYOTA_SPEED_MAX - TOYOTA_SPEED_MIN), // 차마다 주인공 대비 0.8~0.95
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
  console.log(`[Traffic] 교통 차량 ${count}대 배치(주인공 모델 제외, ${usable.length}종 무작위)`);
}
// 기존 교통을 모두 제거하고 다시 배치(주인공 모델 변경 반영). 최초 배치 전엔 무시.
function respawnTraffic() {
  if (!trafficReady) return;
  for (const t of traffic) scene.remove(t.rig);
  traffic.length = 0;
  spawnTraffic();
}

// ---------------------------------------------------------------------------
// 게임 아이템(에너지/다이아몬드) — 트랙 위에 생성되어 천천히 이동, 주행 차량이 지나가면 획득
// ---------------------------------------------------------------------------
// 에너지=게이지 100%, 다이아몬드=생명 +1. 정지하면 너무 빨리 지나치므로 주인공 최고
// 속도의 50%로 곡선을 따라 이동한다. 생성은 '바퀴'에 비례: 다이아 1바퀴당 1개, 에너지
// 1바퀴당 2개. 획득 시 크게 확대→HUD 로 날아가 적용.
const items = []; // { type, mesh, u, lateral, bobT, spin } — 트랙에 한 번에 하나만 존재
let itemSpeed = 0, itemCollectDist = 0, itemFloatY = 0;
let lapProgress = 0;                 // 차가 실제로 돈 바퀴 수(누적) — 아이템 생성용
let finishChecker = null;            // 결승선 체커 메시(마지막 랩 반짝임)
let prevLapU = 0;                    // 직전 프레임 drive.u — 시작선(u=0) 통과 감지
let checkerBlinkT = 0;               // 체커 반짝임 위상
let energyMark = 0, diamondMark = 0; // 다음 생성 기준(에너지·다이아 각각 1바퀴마다 1개)
const itemTemplates = {};            // type -> { geo, mat } (모든 인스턴스가 공유)
const _proj = new THREE.Vector3();

function initItems(maxDim) {
  itemSpeed = drive.maxSpeed * 0.5;            // 주인공 최고 속도의 50%
  itemCollectDist = maxDim * 1.15;             // 획득 판정 거리
  itemFloatY = maxDim * 0.32;                  // 떠 있는 높이(도로에 가깝게 낮춤)
  const r = maxDim * 0.35;
  // 에너지: 번개(⚡) 모양 — 2D 윤곽을 살짝 돌출(extrude)시켜 입체 번개로.
  const f = r * 0.9;
  const boltPts = [[0.125, 1.0], [-0.625, -0.167], [-0.042, -0.167], [-0.375, -1.0], [0.625, 0.25], [0.042, 0.25]];
  const boltShape = new THREE.Shape();
  boltShape.moveTo(boltPts[0][0] * f, boltPts[0][1] * f);
  for (let i = 1; i < boltPts.length; i++) boltShape.lineTo(boltPts[i][0] * f, boltPts[i][1] * f);
  boltShape.closePath();
  const boltGeo = new THREE.ExtrudeGeometry(boltShape, { depth: f * 0.3, bevelEnabled: false });
  boltGeo.center();
  itemTemplates.energy = { geo: boltGeo, mat: new THREE.MeshStandardMaterial({ color: 0x2bff7a, emissive: 0x2bff6a, emissiveIntensity: 0.95, metalness: 0.3, roughness: 0.4 }) };
  const diaGeo = new THREE.OctahedronGeometry(r, 0); diaGeo.scale(0.8, 1.3, 0.8);
  itemTemplates.diamond = { geo: diaGeo, mat: new THREE.MeshStandardMaterial({ color: 0x5fd0ff, emissive: 0x2aa8ff, emissiveIntensity: 0.85, metalness: 0.6, roughness: 0.2 }) };
}
function clearItemsOfType(type) {                                  // 같은 종류만 제거(에너지/다이아 독립 관리)
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === type) { scene.remove(items[i].mesh); items.splice(i, 1); }
  }
}
function spawnItem(type) {
  if (!drive.curve || !itemTemplates[type]) return;
  clearItemsOfType(type);                                         // 같은 종류의 이전 아이템만 사라짐(다른 종류는 유지)
  const t = itemTemplates[type];
  const mesh = new THREE.Mesh(t.geo, t.mat);                       // geometry/material 공유(가벼움)
  const u = (drive.u + 0.05 + Math.random() * 0.28) % 1;          // 차 앞쪽 어딘가
  const lateral = (Math.random() * 2 - 1) * drive.lateralMax * 0.8; // 조향으로 닿는 범위
  scene.add(mesh);
  items.push({ type, mesh, u, lateral, bobT: Math.random() * 6.28, spin: 0 });
}
function updateItems(dt) {
  if (!drive.curve) return;
  // 차가 실제로 전진한 만큼 바퀴 진행도를 누적 → 다이아 1바퀴/1개, 에너지 1바퀴/2개 생성
  const v = drive.state === 'drive' ? drive.speed * drive.boost : 0;
  lapProgress += (v * dt) / drive.length;
  // 다이아몬드는 최대치(5개) 미만일 때만 생성(가득 차 있으면 안 나옴)
  while (lapProgress >= diamondMark + 1) { diamondMark += 1; if (game.diamonds < MAX_DIAMONDS) spawnItem('diamond'); }
  while (lapProgress >= energyMark + 1) { energyMark += 1; spawnItem('energy'); } // 1바퀴당 1개(이전 2개의 1/2)

  const du = (itemSpeed * dt) / drive.length;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.u = (it.u + du) % 1;                     // 곡선 따라 전진(차와 같은 방향, 절반 속도)
    drive.curve.getPointAt(it.u, _pos);
    drive.curve.getTangentAt(it.u, _tan);
    _lat.crossVectors(_up, _tan).normalize();
    it.bobT += dt * 3; it.spin += dt * 2.4;
    const ix = _pos.x + _lat.x * it.lateral, iz = _pos.z + _lat.z * it.lateral;
    const y = terrainHeight(ix, iz) + itemFloatY + Math.sin(it.bobT) * (itemFloatY * 0.18);
    it.mesh.position.set(ix, y, iz);
    it.mesh.rotation.y = it.spin;
    const dx = it.mesh.position.x - car.position.x;
    const dz = it.mesh.position.z - car.position.z;
    if (dx * dx + dz * dz < itemCollectDist * itemCollectDist) { // 주인공이 지나감 → 획득
      collectItem(it);
      scene.remove(it.mesh);
      items.splice(i, 1);
    }
  }
}
// 메인 전체화면 카메라로 3D 위치를 화면 좌표로 투영(뒤쪽이면 화면 하단 중앙으로 대체).
function projectToScreen(pos) {
  const cam = (cockpitMain && miniCam) ? miniCam : camera;
  _proj.copy(pos).project(cam);
  if (_proj.z > 1) return { x: window.innerWidth / 2, y: window.innerHeight * 0.75 };
  return { x: (_proj.x * 0.5 + 0.5) * window.innerWidth, y: (-_proj.y * 0.5 + 0.5) * window.innerHeight };
}
function elCenter(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function collectItem(it) {
  playPickupSound(it.type);                    // 획득 효과음
  const s = projectToScreen(it.mesh.position);
  collectFly(it.type, s.x, s.y);
}
// 획득 연출: 제자리에서 크게 확대 → 해당 HUD 로 날아간 뒤 효과 적용.
function collectFly(type, sx, sy) {
  const el = document.createElement('div');
  el.className = 'item-fly';
  el.textContent = type === 'energy' ? '⚡' : '◆';
  el.style.color = type === 'energy' ? '#36ff86' : '#5fd0ff';
  el.style.left = sx + 'px';
  el.style.top = sy + 'px';
  document.body.appendChild(el);
  const grow = el.animate([
    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(2.8)', opacity: 1 },
  ], { duration: 280, easing: 'cubic-bezier(0.2,1.3,0.3,1)', fill: 'forwards' });
  grow.onfinish = () => {
    const targetEl = type === 'energy' ? energyEl : diamondsEl;
    const tgt = targetEl ? elCenter(targetEl) : { x: sx, y: sy - 100 };
    const dx = tgt.x - sx, dy = tgt.y - sy;
    const fly = el.animate([
      { transform: 'translate(-50%,-50%) scale(2.8)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0.85 },
    ], { duration: 600, easing: 'cubic-bezier(0.5,0,0.35,1)', fill: 'forwards' });
    fly.onfinish = () => { el.remove(); applyItemEffect(type); };
  };
}
function applyItemEffect(type) {
  if (type === 'energy') { game.energy = 100; updateEnergy(); }        // 에너지 → 게이지 100%
  else { game.diamonds = Math.min(MAX_DIAMONDS, game.diamonds + 1); updateDiamonds(); } // 다이아 → 생명 +1
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

    // 절차적 지형 설정(트랙/나무 등 빌드 전에! 같은 높이장을 공유해야 정확히 들어맞음).
    // 진폭은 차 크기 비례, 주파수는 트랙 크기 비례(파장 ≈ 트랙 지름 → 완만한 굴곡).
    terrainAmp = maxDim * 0.45;                // 기복 높이(차 크기 비례) — 조금 더 키움
    terrainF = (2 * Math.PI) / (trackRadius * 1.5); // 파장 ≈ 트랙 반경의 1.5배 → 굴곡 수를 크게 줄여 넓고 완만하게
    terrainNormalEps = maxDim * 0.5;           // 노면 법선 차분 간격(차 절반 길이 스케일)
    applyTerrainToGround();                    // 바닥 메시에 기복 반영

    buildTrack(trackRadius, roadHalfWidth);

    // 레이스웨이 메쉬를 트랙 둘레 전체에 빙 둘러 배치
    loadRaceway(roadHalfWidth);

    // 나무를 트랙 안팎에 자연스럽게 흩뿌림(주행로는 비워 둠)
    loadTrees(roadHalfWidth, trackRadius);

    // 교통 차량 N대를 트랙 전체에 흩뿌려 각자 주행시킴(Genesis/Toyota/TU Racer 무작위).
    // 이미 정규화된 Genesis(주인공)를 프로토타입으로 함께 넘긴다.
    loadTraffic({ model, size }, size, TOYOTA_COUNT);

    // 사람(걷기/뛰기)을 트랙 곡선을 따라 도로변에 배치해 트랙 주변을 돌게 함
    loadPeople(size, roadHalfWidth);

    // 속도: 다시 2배(직선 maxDim*72). 코너는 크게 감속.
    drive.maxSpeed = maxDim * 56;            // 직선 최고 속도(이전 70의 80%로 감속)
    drive.minSpeed = drive.maxSpeed * (MIN_CORNER_KMH / SPEED_MAX_KMH); // 코너 최저 속도 = 155 km/h
    drive.speed = drive.maxSpeed;
    drive.grip = maxDim * 420;               // 접지력(코너에서 라인 유지)
    drive.aimAhead = (maxDim * 9) / drive.length; // 추격 목표를 차 앞 ~9 차길이
    drive.u = 0;
    drive.prevSpeed = drive.speed;
    drive.recoverFrac = RECOVER_SPEED_FRAC; // 주인공 복귀 속도
    drive.lateralMax = size.z * 3;          // 주행선 횡오프셋 한계 ±3w(w=차폭)
    drive.lateralRate = size.z * 8;         // 좌우 화살표 횡이동 속도(민감하게 2배 ≈0.75초에 전구간)
    drive.active = false;                    // 첫 화면(타이틀) 동안 정지 — START 누르면 시작

    // 충돌 판정/곡선 도달 거리(차 크기 비례)
    collisionDist = maxDim * 0.7; // 충돌 영역을 조금 작게(접촉보다 더 가까울 때만)
    collisionLatMax = size.z * 5; // 충돌 슬라이드 횡이탈 한계 ±5W(W=차폭=size.z)
    recoverArrive = maxDim * 0.3;
    // 교통 차량 회피: 이 거리 안에서 횡방향 간격을 확보하며 비켜간다
    avoidRadius = maxDim * 4.0;
    avoidClearance = maxDim * 1.2; // collisionDist 보다 크게 → 확실히 비켜감
    initSparks(maxDim, size);      // 충돌 스파크 파티클 준비
    initItems(maxDim);             // 게임 아이템(코인/에너지/다이아몬드) 준비
    initFireworks(maxDim);         // 완주 축하 축포(불꽃놀이) 준비

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
    markerNearDist = maxDim * 8;      // 이 거리 안의 상대 차는 마커가 노랑으로 깜빡임

    // 사람 애니메이션 컬링 반경(차 크기 비례)
    cullSphereR = maxDim;             // 사람 1인 절두체 판정용 바운딩 반경(여유 포함)
    cullNearR2 = (maxDim * 10) ** 2;  // 차 주변 10 차길이 안은 항상 애니메이션

    // 카메라 상하 진동 진폭(차 크기에 비례) — 높이 60% 수준에 맞춰 축소
    camFollow.bobAmp = maxDim * 0.78;
    // 추격 거리: 차 길이(size.x) 기준 고정. 모바일은 조금 더 멀리(4배)서 관찰.
    camFollow.chaseDist = size.x * (IS_MOBILE ? 4 : 3);
    camFollow.dist = camFollow.chaseDist; // 현재 추격 거리 초기화
    // 조종석은 차 중심에서 진행 방향으로 size.x·비율 만큼 앞(카메라 전진 한계)
    camFollow.cockpitFwd = size.x * COCKPIT_FWD_RATIO;

    // 차를 트랙 시작점에 배치하고 접선 방향(+X 정면)으로 정렬
    drive.curve.getPointAt(0, _pos);
    drive.curve.getTangentAt(0, _tan);
    car.position.set(_pos.x, terrainHeight(_pos.x, _pos.z), _pos.z); // 지형 위에서 시작
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
    // 시작 추격뷰 오프셋을 저장 → START 시 차량 선택 중 사용자가 돌린 카메라를 무효화하고 복원.
    camFollow.homeOffset = new THREE.Vector3(maxDim * 2.5, maxDim * 1.2, maxDim * 3.0);
    camFollow.homeTargetY = size.y * 0.5;
    controls.target.set(car.position.x, car.position.y + camFollow.homeTargetY, car.position.z);
    camera.position.copy(car.position).add(camFollow.homeOffset);
    controls.update();

    // 미니맵 카메라: 조종석에서 앞을 바라보는 원근(perspective) 카메라.
    // aspect = MINIMAP_W/MINIMAP_H. 수직 시야각도 1.2배(72→86) 키워 상하로 더 넓게.
    miniCam = new THREE.PerspectiveCamera(86, MINIMAP_W / MINIMAP_H, maxDim * 0.05, 8000); // 먼 구름/하늘 틴트까지
    miniCam.layers.enable(MINIMAP_LAYER); // 강조 마커(테두리·역삼각형)는 조종석 시점에만
    camFollow.eyeHeight = size.y * 0.95;      // 조종석 눈높이(조금 더 높게)
    // 차체에 시야가 막히지 않도록 카메라를 차 앞코(앞 절반 끝 ≈ 0.5·size.x)
    // 너머로 빼 전방 상황이 보이게 한다.
    camFollow.camFwd = size.x * 0.6;

    // 차량 선택 화면: 게임 씬과 분리된 '스튜디오' 씬. 바닥 + 고정 스포트라이트 2개 + 회전 턴테이블.
    // (게임 화면은 렌더하지 않고, 조명 받은 차량만 회전하며 바닥에 그림자가 진다.)
    showcaseScene = new THREE.Scene();
    showcaseScene.background = new THREE.Color(0x0e131c); // 어두운 스튜디오 배경
    const showCenterY = size.y * 0.45;                    // 차 중심 높이(주시점)
    // 바닥(그림자 받음)
    const showFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(maxDim * 14, maxDim * 14),
      new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.92, metalness: 0.0 })
    );
    showFloor.rotation.x = -Math.PI / 2;
    showFloor.receiveShadow = true;
    showcaseScene.add(showFloor);
    // 은은한 채움광(그림자가 완전 검정이 되지 않게)
    showcaseScene.add(new THREE.HemisphereLight(0x9fb4d0, 0x202833, 0.55));
    // 고정 스포트라이트 2개(좌·우 위에서 차를 비춤, 둘 다 그림자). decay=0 → 스케일과 무관하게 일정 밝기.
    const showTarget = new THREE.Object3D();
    showTarget.position.set(0, showCenterY, 0);
    showcaseScene.add(showTarget);
    const mkSpot = (x, y, z, intensity) => {
      const s = new THREE.SpotLight(0xffffff, intensity, maxDim * 40, Math.PI / 4.5, 0.5, 0);
      s.position.set(x, y, z);
      s.target = showTarget;
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.camera.near = maxDim * 0.5;
      s.shadow.camera.far = maxDim * 40;
      s.shadow.bias = -0.0004;
      showcaseScene.add(s);
    };
    mkSpot(maxDim * 3.0, maxDim * 4.6, maxDim * 2.4, 5.0);    // 주 스포트
    mkSpot(-maxDim * 3.2, maxDim * 3.6, -maxDim * 1.8, 3.2);  // 보조 스포트(반대편)
    // 차만 회전하는 턴테이블(조명은 고정)
    showcaseSpinner = new THREE.Group();
    showcaseScene.add(showcaseSpinner);
    // 고정 관찰 카메라(더 가깝게, 약간 위에서 아래로 내려다봄)
    showcaseCam = new THREE.PerspectiveCamera(42, 1, maxDim * 0.1, maxDim * 80);
    showcaseCam.position.set(maxDim * 1.35, maxDim * 0.9, maxDim * 1.8); // 근접 + 약간 높은 시점(조금 낮춤)
    showcaseCam.lookAt(0, showCenterY, 0);                               // 차 중심을 겨냥

    // Genesis Magma 를 0번 선택지로 등록(이미 car 리그에 추가됨) + 전시 클론 생성.
    heroModel = model;
    carOptions[0].model = model;
    carOptions[0].ready = true;
    setShowcaseModel(model);    // 전시 스피너에 회전 클론 추가

    console.log(
      `[GenesisMagma] 로드 완료 — 크기(W×H×L): ` +
      `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}, ` +
      `트랙 길이 ${drive.length.toFixed(1)}`
    );

    loaderEl.classList.add('hidden');
    setTimeout(() => loaderEl.remove(), 500);

    // 로딩 완료 → 인트로 일러스트 스플래시 노출. 그 뒤로 타이틀 화면을 준비해 둔다.
    if (carSubEl) carSubEl.textContent = carOptions[selectedCar].sub; // 선택 차량 부제 초기화
    const titleEl = document.getElementById('title');
    if (titleEl) titleEl.classList.remove('hidden');
    const introEl = document.getElementById('intro');
    if (introEl) introEl.classList.remove('hidden');
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
// 트랙 미니맵(오른쪽) — 코스를 선으로만 그리고 차량 위치를 점으로 표시.
// 주인공=노란 점, 다른 차(교통)=빨간 점. 좌표는 월드 XZ → 캔버스(top-down)로 사상.
// ---------------------------------------------------------------------------
const trackmapEl = document.getElementById('trackmap');
const trackmapCtx = trackmapEl ? trackmapEl.getContext('2d') : null;
let trackmapPath = null;          // 캔버스 좌표로 사상한 코스 폴리라인(닫힘) — 한 번만 계산
let trackmapMap = null;           // (x,z) → (px,py) 사상 함수
function buildTrackmap() {
  if (!trackmapCtx || !drive.curve) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = trackmapEl.clientWidth || 170, cssH = trackmapEl.clientHeight || 170;
  trackmapEl.width = Math.round(cssW * dpr);
  trackmapEl.height = Math.round(cssH * dpr);
  trackmapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 좌표는 CSS px 단위로
  // 코스 표본 → XZ 바운딩 박스
  const N = 200;
  const pts = [];
  const tmp = new THREE.Vector3();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    drive.curve.getPointAt(i / N, tmp);
    pts.push(tmp.x, tmp.z);
    if (tmp.x < minX) minX = tmp.x; if (tmp.x > maxX) maxX = tmp.x;
    if (tmp.z < minZ) minZ = tmp.z; if (tmp.z > maxZ) maxZ = tmp.z;
  }
  const pad = 16;
  const spanX = (maxX - minX) || 1, spanZ = (maxZ - minZ) || 1;
  const scale = Math.min((cssW - pad * 2) / spanX, (cssH - pad * 2) / spanZ);
  const offX = (cssW - spanX * scale) / 2, offZ = (cssH - spanZ * scale) / 2;
  // 화면 좌표계는 y가 아래로 증가 → z를 그대로 매핑하면 상하 반전. 코스 형태만 보이면 되므로 그대로 둔다.
  trackmapMap = (x, z) => [offX + (x - minX) * scale, offZ + (z - minZ) * scale];
  trackmapPath = new Path2D();
  for (let i = 0; i < pts.length; i += 2) {
    const [px, py] = trackmapMap(pts[i], pts[i + 1]);
    if (i === 0) trackmapPath.moveTo(px, py); else trackmapPath.lineTo(px, py);
  }
  trackmapPath.closePath();
}
function drawTrackmap() {
  if (!trackmapCtx || !drive.curve) return;
  if (!trackmapPath) buildTrackmap();
  if (!trackmapPath) return;
  const cssW = trackmapEl.clientWidth || 170, cssH = trackmapEl.clientHeight || 170;
  trackmapCtx.clearRect(0, 0, cssW, cssH);
  // 코스: 선으로만
  trackmapCtx.lineWidth = 2;
  trackmapCtx.strokeStyle = 'rgba(255,255,255,0.85)';
  trackmapCtx.stroke(trackmapPath);
  const dot = (x, z, color, r) => {
    const [px, py] = trackmapMap(x, z);
    trackmapCtx.beginPath();
    trackmapCtx.arc(px, py, r, 0, Math.PI * 2);
    trackmapCtx.fillStyle = color;
    trackmapCtx.fill();
  };
  // 다른 차(교통)=빨간 점
  for (const t of traffic) dot(t.rig.position.x, t.rig.position.z, '#ff3b30', 3);
  // 게임 아이템: 다른 점(차 3~4px)보다 크게 표시 — 다이아=청록 마름모, 에너지=초록 번개
  for (const it of items) {
    const [px, py] = trackmapMap(it.mesh.position.x, it.mesh.position.z);
    if (it.type === 'diamond') {
      trackmapCtx.save();
      trackmapCtx.translate(px, py);
      trackmapCtx.rotate(Math.PI / 4);          // 정사각형을 45° 돌려 마름모(◆)
      trackmapCtx.fillStyle = '#5fd0ff';
      trackmapCtx.fillRect(-5, -5, 10, 10);
      trackmapCtx.restore();
    } else { // energy = 번개 모양(깜빡임)
      trackmapCtx.save();
      trackmapCtx.globalAlpha = Math.sin(markerBlinkT * 16) > 0 ? 1 : 0.18; // ≈2.5Hz 점멸
      trackmapCtx.translate(px, py);
      trackmapCtx.fillStyle = '#36ff86';
      trackmapCtx.beginPath();
      const s = 8; // 번개 크기(다른 점보다 크게)
      for (let i = 0; i < 6; i++) {
        const x = [0.125, -0.625, -0.042, -0.375, 0.625, 0.042][i] * s;
        const y = -[1.0, -0.167, -0.167, -1.0, 0.25, 0.25][i] * s; // 캔버스 y는 아래로 +
        if (i === 0) trackmapCtx.moveTo(x, y); else trackmapCtx.lineTo(x, y);
      }
      trackmapCtx.closePath();
      trackmapCtx.fill();
      trackmapCtx.restore();
    }
  }
  // 주인공=노란 점(맨 위에)
  dot(car.position.x, car.position.z, '#ffd400', 4);
}

// ---------------------------------------------------------------------------
// 점수 / 게임오버
// ---------------------------------------------------------------------------
const game = { score: 0, sec: 0, diamonds: MAX_DIAMONDS, energy: 100, best: 0, over: false, paused: false, autoPaused: false, frozen: false, started: false, grace: 0, countdown: 0, cdShown: 0, pendingOver: false, raceTime: 0, lapClock: 0, lap: 0, finished: false, finishing: false, bestLap: 0, bestLapNum: 0, worstLap: 0, worstLapNum: 0 };
const lapTimes = [];            // 완료한 각 랩 기록(초) — 데스크탑 전체 목록용

// --- 순위표(스코어 / 랩타임 Top 10) + 플레이어 이름: localStorage 영구 저장 ---
const BOARDS_KEY = 'magma.boards.v1';
const NAME_KEY = 'magma.playerName';
let boards = (() => {
  try { const b = JSON.parse(localStorage.getItem(BOARDS_KEY)); if (b && Array.isArray(b.score) && Array.isArray(b.lap)) return b; } catch {}
  return { score: [], lap: [] };
})();
function saveBoards() { try { localStorage.setItem(BOARDS_KEY, JSON.stringify(boards)); } catch {} }
game.playerName = (() => { try { return localStorage.getItem(NAME_KEY) || 'Player'; } catch { return 'Player'; } })();
// 경기 결과 등록: 스코어(내림차순)·랩타임(오름차순) 보드에 Top 10 이내면 기록. 각 분야 등수 반환.
function submitResult(name, score, lap, time) {
  const entry = { name: (name || 'Player').slice(0, 12), score, lap, time };
  const sRank = boards.score.filter((e) => e.score > score).length + 1;
  const lRank = lap > 0 ? boards.lap.filter((e) => e.lap > 0 && e.lap < lap).length + 1 : Infinity;
  let sIn = false, lIn = false;
  if (sRank <= 10) { boards.score.push({ ...entry }); boards.score.sort((a, b) => b.score - a.score); boards.score = boards.score.slice(0, 10); sIn = true; }
  if (lap > 0 && lRank <= 10) { boards.lap.push({ ...entry }); boards.lap.sort((a, b) => a.lap - b.lap); boards.lap = boards.lap.slice(0, 10); lIn = true; }
  if (sIn || lIn) saveBoards();
  return { sRank, lRank, sIn, lIn };
}
const scoreValEl = document.getElementById('score-val');
const bestValEl = document.getElementById('best-val');
const diamondsEl = document.getElementById('diamonds');
const gameoverEl = document.getElementById('gameover');
const gameoverScoreEl = document.querySelector('#gameover-score span');
const pauseBtn = document.getElementById('pause-btn');
const pauseScreenEl = document.getElementById('pausescreen');
// 게임오버 일러스트를 클릭/터치하거나 스페이스를 누르면 처음부터 다시 시작
function restartGame() { location.reload(); }
onTap(gameoverEl, (e) => { if (isMusicTap(e)) return; if (game.over) restartGame(); });
onTap(document.getElementById('fin-restart'), restartGame); // 완주 결과 → 다시 시작
window.addEventListener('keydown', (e) => {
  if (game.over && (e.key === ' ' || e.code === 'Space')) { e.preventDefault(); restartGame(); }
});
onTap(pauseBtn, togglePause);
// 일시정지 화면의 두 버튼: Back to Game = 복귀(카운트다운 후), Main = 확인 후 모델 선택으로.
const pauseBackBtn = document.getElementById('pause-back');
const pauseMainBtn = document.getElementById('pause-main');
const confirmEl = document.getElementById('confirm');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');
onTap(pauseBackBtn, () => { if (game.paused && !game.autoPaused) togglePause(); });
onTap(pauseMainBtn, () => { if (confirmEl) confirmEl.classList.remove('hidden'); }); // "게임을 중단하시겠습니까?"
onTap(confirmCancelBtn, () => { if (confirmEl) confirmEl.classList.add('hidden'); }); // 취소 → 다시 중지 모드
onTap(confirmOkBtn, () => { if (confirmEl) confirmEl.classList.add('hidden'); returnToTitle(); }); // 확인 → 모델 선택으로
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
// 인트로 스플래시: 아무 곳이나 클릭/탭하면 일러스트를 닫고 타이틀 화면이 드러난다.
const introScreenEl = document.getElementById('intro');
onTap(introScreenEl, (e) => {
  if (isMusicTap(e)) return; // 음표 버튼/메뉴 탭은 인트로를 닫지 않음
  introScreenEl.classList.add('hidden');
  setTimeout(() => introScreenEl.remove(), 500); // 페이드 아웃 후 DOM 정리
  showLeaderboard(true); // 타이틀(첫 화면)에 순위표 노출
});

const titleScreenEl = document.getElementById('title');
const howtoScreenEl = document.getElementById('howto');
const startBtn = document.getElementById('start-btn');
const howtoBtn = document.getElementById('howto-btn');
const howtoBackBtn = document.getElementById('howto-back');
const nameInput = document.getElementById('player-name');
if (nameInput) nameInput.value = game.playerName === 'Player' ? '' : game.playerName; // 지난 이름 채움
onTap(startBtn, startGame);
// 모바일 순위표 좌우 토글(랩타임 ↔ 스코어)
const lbPrevBtn = document.getElementById('lb-prev');
const lbNextBtn = document.getElementById('lb-next');
const toggleLbView = () => { lbMobileView = lbMobileView === 'lap' ? 'score' : 'lap'; applyMobileLbView(); };
onTap(lbPrevBtn, toggleLbView);
onTap(lbNextBtn, toggleLbView);
// 차량 선택 좌우 화살표(가운데 회전 차량 교체)
const carPrevBtn = document.getElementById('car-prev');
const carNextBtn = document.getElementById('car-next');
onTap(carPrevBtn, () => cycleCar(-1));
onTap(carNextBtn, () => cycleCar(1));
onTap(howtoBtn, () => howtoScreenEl && howtoScreenEl.classList.remove('hidden'));
onTap(howtoBackBtn, () => howtoScreenEl && howtoScreenEl.classList.add('hidden')); // 첫 화면으로
// START: 타이틀을 닫고 HUD 를 켜며 시뮬레이션을 시작
// 차량 선택 중 OrbitControls 로 사용자가 돌린/줌한 카메라를 무효화하고 시작 추격뷰로 복원.
function resetChaseCamera() {
  if (!camFollow.homeOffset) return;
  camera.up.set(0, 1, 0); camFollow.up.set(0, 1, 0);
  controls.target.set(car.position.x, car.position.y + camFollow.homeTargetY, car.position.z);
  camera.position.copy(car.position).add(camFollow.homeOffset);
  camFollow.dist = camFollow.chaseDist;
  camFollow.prev.copy(car.position);
  camFollow.bobPrev = 0;
  controls.update();
}
function startGame() {
  if (game.started) return;
  resetChaseCamera();                            // 선택 화면에서 만진 카메라 무효화 → 시작 시점으로
  // 플레이어 이름 확정(입력값 → 저장). 비어 있으면 'Player'.
  if (nameInput) {
    const n = nameInput.value.trim().slice(0, 12);
    game.playerName = n || 'Player';
    try { localStorage.setItem(NAME_KEY, game.playerName); } catch {}
  }
  showLeaderboard(false);                         // 게임 중에는 순위표 숨김
  game.started = true;
  // 레이스 상태 초기화(20랩)
  game.raceTime = 0; game.lapClock = 0; game.lap = 0; game.finished = false; game.finishing = false;
  game.bestLap = 0; game.bestLapNum = 0; game.worstLap = 0; game.worstLapNum = 0; fwActive = false;
  lapTimes.length = 0; lapProgress = 0; energyMark = 0; diamondMark = 0;
  prevLapU = drive.u; checkerBlinkT = 0;
  if (finishChecker) finishChecker.material.emissiveIntensity = 0;
  updateLapPanel(); updateRaceHud();
  document.body.classList.remove('titlescreen'); // 게임 HUD 노출
  if (titleScreenEl) titleScreenEl.classList.add('hidden');
  if (howtoScreenEl) howtoScreenEl.classList.add('hidden');
  drive.active = true;                            // 주행 시뮬레이션 활성(카운트다운 동안엔 정지)
  beginCountdown();                                // 즉시 출발이 아니라 3-2-1 카운트다운 후 시작(grace 는 0 도달 시 부여)
  resumeAudio();                                  // 사용자 제스처 → 오디오/엔진음 시작
  if (bgmEnabled && bgmEl) bgmEl.play().catch(() => {}); // 사용자 제스처 안에서 배경음악 재생 시작(자동재생 정책)
  announce(`${TOTAL_LAPS} Laps to GO`, true);     // 시작 안내(작게→크게→깜빡→사라짐)
}

// ---------------------------------------------------------------------------
// 배경음악 선택 메뉴(음표 버튼)
// ---------------------------------------------------------------------------
const musicBtn = document.getElementById('music-btn');
const musicMenu = document.getElementById('music-menu');
const musicListEl = document.getElementById('music-list');
// SONGS + '사용 안 함' 으로 목록을 그린다(현재 선택 항목은 active 강조).
function buildMusicMenu() {
  if (!musicListEl) return;
  musicListEl.innerHTML = '';
  SONGS.forEach((s, i) => {
    const it = document.createElement('button');
    it.className = 'mm-item' + (bgmEnabled && selectedSong === i ? ' active' : '');
    it.textContent = s.name;
    onTap(it, () => selectSong(i));
    musicListEl.appendChild(it);
  });
  const off = document.createElement('button');
  off.className = 'mm-item' + (!bgmEnabled ? ' active' : '');
  off.textContent = '배경음악 사용 안 함';
  onTap(off, () => selectSong(-1));
  musicListEl.appendChild(off);
}
function selectSong(i) {
  if (i < 0) {                          // 배경음악 사용 안 함
    bgmEnabled = false;
    if (bgmEl) bgmEl.pause();
  } else {
    bgmEnabled = true;
    selectedSong = i;
    if (bgmEl) {
      if (loadedSongUrl !== SONGS[i].url) { bgmEl.src = SONGS[i].url; loadedSongUrl = SONGS[i].url; }
      if (game.started) bgmEl.play().catch(() => {}); // 진행 중이면 즉시 재생(탭=사용자 제스처)
    }
  }
  buildMusicMenu();                     // active 표시 갱신
  updateNowPlaying();                    // 현재곡 표시줄 갱신
  if (musicMenu) musicMenu.classList.add('hidden');
}
// 현재 재생곡 표시줄(제목 + 음소거 아이콘) 갱신
const npTitleEl = document.getElementById('np-title');
const npMuteBtn = document.getElementById('np-mute');
const nowplayingEl = document.getElementById('nowplaying');
function updateNowPlaying() {
  if (npTitleEl) npTitleEl.textContent = SONGS[selectedSong] ? SONGS[selectedSong].name : '—';
  if (npMuteBtn) npMuteBtn.textContent = bgmEnabled ? '🔊' : '🔇';
  if (nowplayingEl) nowplayingEl.classList.toggle('muted', !bgmEnabled);
}
// 다음 곡(⏭): 재생목록을 순환 선택(음소거 상태였으면 다시 켜며 재생)
function nextSong() { selectSong((selectedSong + 1) % SONGS.length); }
// 음소거 토글(🔊↔🔇): 끄면 정지, 다시 누르면 현재곡 재생
function toggleMute() { selectSong(bgmEnabled ? -1 : selectedSong); }
// 메뉴를 트리거(음표 버튼/FAB) 바로 아래에 띄운다(화면 밖으로 넘치면 위쪽에).
function placeMusicMenuNear(trigger) {
  if (!musicMenu || !trigger) return;
  const r = trigger.getBoundingClientRect();
  const w = musicMenu.offsetWidth || 230, h = musicMenu.offsetHeight || 160;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  musicMenu.style.left = left + 'px';
  musicMenu.style.top = top + 'px';
}
function toggleMusicMenuFrom(trigger) {
  if (!musicMenu) return;
  if (musicMenu.classList.contains('hidden')) {
    buildMusicMenu();
    musicMenu.classList.remove('hidden');
    placeMusicMenuNear(trigger);
  } else {
    musicMenu.classList.add('hidden');
  }
}
// 탭 대상이 음표 버튼/FAB/메뉴인지(오버레이 클릭 동작에서 제외할 때 사용)
function isMusicTap(e) {
  return !!(e && e.target && e.target.closest && e.target.closest('.music-fab, #music-btn, #music-menu'));
}
onTap(musicBtn, () => toggleMusicMenuFrom(musicBtn));
// 일러스트 화면(인트로/일시정지/게임오버)의 큰 음표 버튼들 — 같은 메뉴를 띄운다.
document.querySelectorAll('.music-fab').forEach((el) => onTap(el, () => toggleMusicMenuFrom(el)));
// 메뉴·트리거 바깥을 누르면 닫기
window.addEventListener('pointerdown', (e) => {
  if (!musicMenu || musicMenu.classList.contains('hidden')) return;
  if (e.target.closest('#music-menu, #music-btn, .music-fab')) return;
  musicMenu.classList.add('hidden');
});
// 현재곡 표시줄의 다음 곡(⏭)·음소거(🔊/🔇) 버튼
onTap(document.getElementById('np-next'), nextSong);
onTap(npMuteBtn, toggleMute);
// 한 곡이 끝나면 자연스럽게 다음 곡으로(루프 대신 재생목록 순환)
if (bgmEl) bgmEl.addEventListener('ended', nextSong);
buildMusicMenu();
updateNowPlaying();

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
  // 한 번의 클릭/탭(마우스·터치 공통)으로 화면 전환. 일시정지 버튼 위는 제외.
  minimapEl.addEventListener('pointerup', (e) => {
    if (e.target.closest('#pause-btn, #music-btn')) return; // 버튼 위 탭은 시점 전환 제외
    toggleCockpitMain();
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
// 충돌로 다이아몬드를 잃을 때: 현재(잃기 전) 개수만큼 눈앞에 ◆ 를 띄우고, 마지막 하나가
// 붉게 깜빡이다 사라진 뒤 'N Diamonds Left!' 를 표시한다. before=잃기 전 수, after=남은 수.
function loseDiamondAnim(before, after) {
  const wrap = document.createElement('div');
  wrap.className = 'diamond-loss';
  const row = document.createElement('div');
  row.className = 'dl-row';
  const gems = [];
  for (let i = 0; i < before; i++) {
    const d = document.createElement('span');
    d.textContent = '◆';
    row.appendChild(d);
    gems.push(d);
  }
  const txt = document.createElement('div');
  txt.className = 'dl-text';
  txt.textContent = `${after} Diamond${after === 1 ? '' : 's'} Left!`;
  wrap.appendChild(row);
  wrap.appendChild(txt);
  document.body.appendChild(wrap);

  // 전체 등장(팝)
  wrap.animate(
    [{ opacity: 0, transform: 'translate(-50%,-50%) scale(0.8)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }],
    { duration: 240, easing: 'ease-out', fill: 'both' }
  );

  const finishOut = () => {
    txt.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 280, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => {
      const out = wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' });
      out.onfinish = () => wrap.remove();
    }, 1100);
  };

  const last = gems[before - 1];
  if (last) {
    last.style.color = '#ff5a4a';                  // 잃을 다이아 강조(붉게)
    const blink = last.animate(
      [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0 }],
      { duration: 850, delay: 320, easing: 'linear', fill: 'forwards' }
    );
    blink.onfinish = finishOut;
  } else {
    finishOut();
  }
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
  const off = '◇'.repeat(Math.max(0, MAX_DIAMONDS - game.diamonds));
  diamondsEl.innerHTML = on + '<span class="lost">' + off + '</span>';
}

// 에너지 게이지: 10칸을 빨강→초록→파랑 그라데이션으로 만들고, 에너지 비율만큼 켠다.
const ENERGY_SEGS = 10;
const energyEl = document.getElementById('energy');
const energyPctEl = document.getElementById('energy-pct');
const energyBarEl = document.getElementById('energy-bar');
const energySegEls = [];
function buildEnergyBar() {
  if (!energyBarEl) return;
  for (let i = 0; i < ENERGY_SEGS; i++) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    const hue = (i / (ENERGY_SEGS - 1)) * 240; // 0=빨강 → 120=초록 → 240=파랑
    seg.style.setProperty('--seg', `hsl(${hue}, 90%, 55%)`);
    energyBarEl.appendChild(seg);
    energySegEls.push(seg);
  }
}
function updateEnergy() {
  if (!energyEl) return;
  const e = Math.max(0, Math.min(100, game.energy));
  if (energyPctEl) energyPctEl.textContent = Math.ceil(e) + '%';
  energyEl.classList.toggle('low', e <= 50);   // 50% 이하 → ENERGY LOW + 게이지 깜빡임
  for (let i = 0; i < energySegEls.length; i++) {
    const on = e > i * (100 / ENERGY_SEGS);  // i번째 칸은 에너지가 그 구간을 넘기면 켜짐
    const seg = energySegEls[i];
    seg.classList.toggle('on', on);
    seg.style.background = on ? 'var(--seg)' : 'rgba(255,255,255,0.07)';
  }
}
buildEnergyBar();
updateEnergy();
// 에너지 소모. 0 이하가 되면 즉시 게임오버 대신 다이아몬드 1개 차감 후 에너지 재충전.
// (다이아몬드가 더 없으면 그때 게임오버)
function drainEnergy(amount) {
  if (game.over || game.finished) return; // 완주 후엔 에너지 소모/게임오버 없음
  game.energy -= amount;
  if (game.energy <= 0) {
    game.diamonds -= 1;
    updateDiamonds();
    if (game.diamonds <= 0) {
      game.diamonds = 0; game.energy = 0;
      updateDiamonds(); updateEnergy();
      gameOver();
      return;
    }
    game.energy = 100; // 다이아 1개로 버티고 계속(에너지 재충전)
    popText('⚠ ENERGY OUT  -◆', window.innerWidth / 2, window.innerHeight * 0.42, '#ff5a4a', 30);
  }
  updateEnergy();
}
// 충돌 시 다이아몬드 1개 소멸 → 다 사라지면 게임오버.
// 단, 마지막 다이아몬드를 잃어도 즉시 끝내지 않고, 충돌 스핀이 멈춘 뒤(animate 의
// 스핀 처리에서) 게임오버되도록 pendingOver 플래그만 세운다.
function loseDiamond() {
  if (game.over) return;
  const before = game.diamonds;
  game.diamonds = Math.max(0, game.diamonds - 1);
  updateDiamonds();
  loseDiamondAnim(before, game.diamonds);  // 눈앞에 현재 개수 → 하나 깜빡이며 소멸 → 'N Diamonds Left!'
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
    // 수동 일시정지에서만 타이틀 일러스트 복귀 화면 + 순위표를 띄운다(자동 정지는 화면을 그대로 멈춤).
    if (!game.autoPaused && pauseScreenEl) { pauseScreenEl.classList.remove('hidden'); showLeaderboard(true); }
  } else {
    if (pauseScreenEl) pauseScreenEl.classList.add('hidden'); // 복귀 → 일러스트 숨김(카운트다운 노출)
    showLeaderboard(false);
    game.autoPaused = false;  // 재개 시 자동정지 플래그 해제
    beginCountdown();        // 재개도 3-2-1 후 출발
    // iOS: AudioContext.resume() 은 반드시 사용자 제스처(이 클릭) 안에서 호출해야 한다.
    // 카운트다운 동안 컨텍스트는 켜 두고 엔진음은 게인으로 차단 → 카운트다운 후 엔진음 복원.
    const ctx = getAudioCtx();
    if (ctx) ctx.resume();
  }
}
// 일시정지 화면의 'Main' → 확인 후 모델 선택(타이틀) 화면으로. 진행 점수는 모두 사라진다.
// (리로드 없이 인앱 리셋 → 인트로 스플래시를 건너뛰고 곧바로 차량 선택 화면)
function returnToTitle() {
  // 게임 상태 초기화(점수 데이터 소멸)
  game.score = 0; game.sec = 0; game.diamonds = MAX_DIAMONDS; game.energy = 100;
  game.over = false; game.paused = false; game.autoPaused = false; game.frozen = false;
  game.started = false; game.grace = 0; game.countdown = 0; game.cdShown = 0; game.pendingOver = false;
  game.raceTime = 0; game.lapClock = 0; game.lap = 0; game.finished = false; game.finishing = false;
  game.bestLap = 0; game.bestLapNum = 0; game.worstLap = 0; game.worstLapNum = 0; fwActive = false;
  lapTimes.length = 0; prevLapU = 0; checkerBlinkT = 0;
  if (finishChecker) finishChecker.material.emissiveIntensity = 0;
  if (scoreValEl) scoreValEl.textContent = '0';
  updateDiamonds(); updateEnergy(); updateLapPanel(); updateRaceHud();
  if (pauseBtn) pauseBtn.textContent = '⏸';

  // 주행 상태를 시작점으로 리셋
  drive.active = false; drive.state = 'drive'; drive.boost = 1;
  drive.lateral = 0; drive.u = 0; drive.cooldown = 0;
  if (drive.curve) {
    drive.curve.getPointAt(0, _pos);
    drive.curve.getTangentAt(0, _tan);
    car.position.set(_pos.x, terrainHeight(_pos.x, _pos.z), _pos.z);
    drive.basePos.copy(car.position);
    drive.heading = Math.atan2(-_tan.z, _tan.x);
    car.rotation.set(0, drive.heading, 0);            // 틸트 잔재 제거
    drive.speed = drive.maxSpeed; drive.prevSpeed = drive.speed;
    camFollow.prev.copy(car.position);
  }

  // 아이템 제거 + 생성 진행도 리셋
  clearItemsOfType('energy'); clearItemsOfType('diamond');
  lapProgress = 0; energyMark = 0; diamondMark = 0;

  // 시점 기본값(시작 시 조종석 전체화면) + 충돌뷰에서 숨겼던 작은 창 복원
  cockpitMain = true; _collisionHidden = false;
  if (minimapLabelEl) minimapLabelEl.textContent = 'CHASE';
  if (minimapEl) minimapEl.style.display = '';

  // 오디오 정지(타이틀은 게임 전)
  if (bgmEl) bgmEl.pause();
  const ctx = getAudioCtx(); if (ctx) ctx.suspend();

  // 오버레이 정리 + 타이틀(모델 선택) 노출
  if (pauseScreenEl) pauseScreenEl.classList.add('hidden');
  if (countdownEl) countdownEl.classList.add('hidden');
  if (gameoverEl) gameoverEl.classList.add('hidden');
  if (confirmEl) confirmEl.classList.add('hidden');
  if (finishEl) finishEl.classList.add('hidden');
  if (titleScreenEl) titleScreenEl.classList.remove('hidden');
  document.body.classList.add('titlescreen');
  showLeaderboard(true); // 타이틀 복귀 시 순위표 노출
}
// 창이 포커스를 잃거나(blur) 탭이 가려지면(다른 앱/탭 전환) 자동 일시정지.
// 자동 정지(autoPaused)는 전시(쇼케이스) 모델을 띄우지 않고, 포커스를 되찾으면 자동 재개한다.
function pauseOnFocusLost() {
  if (game.started && !game.over && !game.paused && !game.frozen && game.countdown <= 0) {
    game.autoPaused = true;   // 쇼케이스 억제 + 포커스 복귀 시 자동 재개 표시
    togglePause();
  }
}
// F 키: 현재 장면을 그대로 정지(freeze) ↔ 해동(thaw). 일시정지(일러스트/카운트다운)와 달리
// 화면을 그 상태로 얼리고(dt=0), 다시 누르면 카운트다운 없이 즉시 이어서 진행한다.
function toggleFreeze() {
  const ctx = getAudioCtx();
  if (game.frozen) {                 // 해동: 즉시 재개
    game.frozen = false;
    if (ctx) ctx.resume();           // 사용자 제스처(F) 안에서 오디오 재개
    return;
  }
  // 새로 얼리는 건 실제 주행 중일 때만(시작 전·정지·게임오버·카운트다운 중엔 무시)
  if (!game.started || game.over || game.paused || game.countdown > 0) return;
  game.frozen = true;
  if (ctx) ctx.suspend();            // 즉시 무음
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFreeze(); }
  // ESC: 확인창 열려 있으면 닫기(취소) → 아니면 게임 중단(일시정지) 진입/재개.
  else if (e.key === 'Escape') {
    if (confirmEl && !confirmEl.classList.contains('hidden')) { e.preventDefault(); confirmEl.classList.add('hidden'); return; }
    if (game.started && !game.over && game.countdown <= 0 && !game.frozen) { e.preventDefault(); togglePause(); }
  }
});
// 포커스를 되찾으면(자동 정지 상태일 때만) 3-2-1 카운트다운 후 자동 재개.
function resumeOnFocusGain() {
  if (game.autoPaused && game.paused && !game.over && game.countdown <= 0) togglePause();
}
window.addEventListener('blur', pauseOnFocusLost);
window.addEventListener('focus', resumeOnFocusGain);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseOnFocusLost();
  else resumeOnFocusGain();
});
function gameOver() {
  game.over = true;
  drive.active = false; // 시뮬레이션 정지
  headlightFlash.active = false; setHeadlight(false); // 섬광 종료
  const ctx = getAudioCtx();
  if (ctx) ctx.suspend(); // 사운드 끄기
  if (gameoverScoreEl) gameoverScoreEl.textContent = game.score;
  if (gameoverEl) gameoverEl.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// 랩(20바퀴) 레이스: 안내 배너 / 랩 타임 / 완주
// ---------------------------------------------------------------------------
// 시간 포맷: m'ss".mmm  (1 millisec = .001)
function fmtLap(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t - Math.floor(t)) * 1000);
  return `${m}'${String(s).padStart(2, '0')}".${String(ms).padStart(3, '0')}`;
}
function fmtTime(t) { // 결과용: m:ss.d
  const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}
const curLapEl = document.getElementById('cur-lap');
const bestLapEl = document.getElementById('best-lap');
const worstLapEl = document.getElementById('worst-lap');
const lapListEl = document.getElementById('lap-list');
const lapValEl = document.getElementById('lap-val');
const finishEl = document.getElementById('finish');
const finScoreEl = document.getElementById('fin-score');
const finTimeEl = document.getElementById('fin-time');
const finBestEl = document.getElementById('fin-best');
const finSRankEl = document.getElementById('fin-srank');
const finLRankEl = document.getElementById('fin-lrank');
const finPointsEl = document.getElementById('fin-points');
const finNameEl = document.getElementById('fin-name');
// --- 순위표(리더보드) 표시: 좌=스코어, 우=랩타임. 데스크탑 Top10 / 모바일 Top5(토글) ---
const leaderboardEl = document.getElementById('leaderboard');
const lbScoreBody = document.getElementById('lb-score-body');
const lbLapBody = document.getElementById('lb-lap-body');
const lbMobileTitle = document.getElementById('lb-mobile-title');
let lbMobileView = 'lap'; // 모바일에서 현재 보이는 분야(기본 랩타임)
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function boardRows(list, kind, max) {
  let rows = '';
  for (let i = 0; i < max; i++) {
    const e = list[i];
    const nm = e ? escapeHtml(e.name) : '—';
    const val = e ? (kind === 'score' ? e.score : fmtLap(e.lap)) : '—';
    rows += `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${nm}</span><span class="lb-val">${val}</span></div>`;
  }
  return rows;
}
function applyMobileLbView() {
  if (!leaderboardEl) return;
  leaderboardEl.classList.toggle('show-score', lbMobileView === 'score');
  leaderboardEl.classList.toggle('show-lap', lbMobileView === 'lap');
  if (lbMobileTitle) lbMobileTitle.textContent = lbMobileView === 'score' ? 'SCORE TOP 5' : 'LAP TIME TOP 5';
}
function updateLeaderboards() {
  const max = IS_MOBILE ? 5 : 10;
  if (lbScoreBody) lbScoreBody.innerHTML = boardRows(boards.score, 'score', max);
  if (lbLapBody) lbLapBody.innerHTML = boardRows(boards.lap, 'lap', max);
  if (IS_MOBILE) applyMobileLbView();
}
function showLeaderboard(show) {
  if (!leaderboardEl) return;
  if (show) { updateLeaderboards(); leaderboardEl.classList.remove('hidden'); }
  else leaderboardEl.classList.add('hidden');
}
// 화면 중앙 안내 배너(작게→크게→깜빡→사라짐). strong=강조(노랑/큼).
function announce(text, strong) {
  const el = document.createElement('div');
  el.className = 'announce' + (strong ? ' strong' : '');
  el.textContent = text;
  document.body.appendChild(el);
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.28 },
    { transform: 'translate(-50%,-50%) scale(1.0)', opacity: 1, offset: 0.42 },
    { opacity: 0.25, offset: 0.56 },
    { opacity: 1, offset: 0.68 },
    { opacity: 0.25, offset: 0.8 },
    { opacity: 1, offset: 0.9 },
    { transform: 'translate(-50%,-50%) scale(1.0)', opacity: 0, offset: 1 },
  ], { duration: 2200, easing: 'ease-out', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}
// 랩 패널 갱신: best / worst (+ 데스크탑은 전체 랩 목록).
function updateLapPanel() {
  if (bestLapEl) bestLapEl.textContent = game.bestLap > 0 ? `best(${game.bestLapNum}-lap): ${fmtLap(game.bestLap)}` : 'best: -';
  if (worstLapEl) worstLapEl.textContent = game.worstLap > 0 ? `worst(${game.worstLapNum}-lap): ${fmtLap(game.worstLap)}` : 'worst: -';
  // 데스크탑(비모바일): 완성한 모든 랩 기록을 계속 누적 표시(CSS 로 모바일에선 숨김).
  if (lapListEl) lapListEl.innerHTML = lapTimes.map((t, i) => `<div class="lt-item">Lap ${i + 1}:<b>${fmtLap(t)}</b></div>`).join('');
}
// 매 프레임: 현재 랩 경과시간 + 현재 랩 번호 HUD 갱신
function updateRaceHud() {
  if (curLapEl) {
    const lapNo = Math.min(TOTAL_LAPS, game.lap + 1);
    curLapEl.innerHTML = `현재랩 ${lapNo} <b>${fmtLap(game.lapClock)}</b>`;
  }
  if (lapValEl) lapValEl.textContent = Math.min(TOTAL_LAPS, game.lap + 1);
}
// 한 바퀴 = 시작선(u=0, 체커가 시작되는 지점) 통과. 거기서 랩 시간이 끝나고 다음 랩이 시작된다.
function checkLap() {
  if (game.finished) { prevLapU = drive.u; return; }
  // 전진하다 u 가 1→0 으로 감기면(시작선 통과) 한 랩 완료.
  if (prevLapU - drive.u > 0.5) {
    game.lap += 1;
    const done = game.lap;
    const lt = game.lapClock;
    lapTimes.push(lt);
    if (game.bestLap === 0 || lt < game.bestLap) { game.bestLap = lt; game.bestLapNum = done; }
    if (game.worstLap === 0 || lt > game.worstLap) { game.worstLap = lt; game.worstLapNum = done; }
    game.lapClock = 0;  // 다음 랩 시간 측정 시작
    updateLapPanel();
    if (done >= TOTAL_LAPS) {
      announce('FINISH', true);
      finishRace();
    } else {
      const remaining = TOTAL_LAPS - done;
      announce(remaining === 1 ? 'FINAL LAP!' : `${remaining} Laps to Go`, remaining === 1);
    }
  }
  prevLapU = drive.u;
}
// 20랩 완주 → 곧장 멈추지 않고 '완주 마무리' 모드로. 차는 서서히 감속하며 연석으로 붙고
// 축포가 터진다(drive 루프가 처리). 거의 멈추면 finishStop() 가 결과 화면을 띄운다.
function finishRace() {
  if (game.finishing) return;
  game.finishing = true;
  game.finished = true;          // 랩/시간 카운트 중지
  fwActive = true; fwTimer = 0;  // 축포 시작
}
// 완주 차량이 거의 멈추면: 정지 + 축하/성적 결과 화면. 축포는 계속.
function finishStop() {
  if (game.over) return;
  game.over = true;
  drive.active = false;
  drive.speed = 0;
  const ctx = getAudioCtx();
  if (ctx) ctx.suspend();        // 엔진 정지(배경음악은 유지)
  // 결과를 순위표에 등록하고 각 분야 등수를 받는다.
  const res = submitResult(game.playerName, game.score, game.bestLap, game.raceTime);
  if (finNameEl) finNameEl.textContent = game.playerName;
  if (finScoreEl) finScoreEl.textContent = game.score;
  if (finTimeEl) finTimeEl.textContent = fmtTime(game.raceTime);
  if (finBestEl && game.bestLap > 0) finBestEl.textContent = `${fmtLap(game.bestLap)} (lap ${game.bestLapNum})`;
  if (finSRankEl) finSRankEl.textContent = `#${res.sRank}`;
  if (finLRankEl) finLRankEl.textContent = res.lRank === Infinity ? '—' : `#${res.lRank}`;
  if (finPointsEl) {
    const eligible = res.sIn || res.lIn;
    finPointsEl.textContent = eligible ? '🎉 포인트 획득권! (TOP 10 기록)' : '아쉽게 TOP 10 진입 실패';
    finPointsEl.classList.toggle('got', eligible);
  }
  updateLeaderboards(); // 다음 타이틀/일시정지 화면에 반영
  if (finishEl) finishEl.classList.remove('hidden');
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  let dt = clock.getDelta();
  if (game.frozen) dt = 0; // F 정지: dt=0 으로 모든 갱신을 멈춰 장면을 그대로 얼린다(렌더는 계속).

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
    if (!game.finished) { game.raceTime += dt; game.lapClock += dt; } // 레이스/현재 랩 경과 시간

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
      // 연석(도로 가장자리)을 밟고 달리면 최고 속도의 80%로 감속(가장자리 주행 페널티).
      if (Math.abs(drive.lateral) >= drive.lateralMax * CURB_ZONE_FRAC) {
        targetSpeed = Math.min(targetSpeed, drive.maxSpeed * CURB_SPEED_FRAC);
      }
      // 완주(finishing) 중에는 목표 속도 0 으로 서서히 감속.
      if (game.finishing) targetSpeed = 0;
      // 비대칭 반응: 감속은 강하게(slow-in), 가속은 부드럽게(fast-out)
      const rate = game.finishing ? FINISH_DECEL : (targetSpeed < drive.speed ? SPEED_BRAKE : SPEED_ACCEL);
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
      // 완주 중에는 입력을 무시하고 도로 가장자리(연석)로 서서히 붙어 정지한다.
      const latInput = game.finishing ? 0 : ((keyInput.right ? 1 : 0) - (keyInput.left ? 1 : 0));
      if (game.finishing) {
        drive.lateral += (drive.lateralMax - drive.lateral) * Math.min(1, dt * FINISH_EDGE_RATE); // 연석 쪽으로
      } else if (latInput !== 0) {
        drive.lateral += latInput * drive.lateralRate * dt;
        drive.lateral = Math.max(-drive.lateralMax, Math.min(drive.lateralMax, drive.lateral));
      } else if (drive.lateral !== 0) {
        // 키를 놓으면 서서히 0(주행선)으로 복귀
        drive.lateral += (0 - drive.lateral) * Math.min(1, dt * LATERAL_RETURN_RATE);
        if (Math.abs(drive.lateral) < 1e-3) drive.lateral = 0;
      }
      // 시각적 yaw 틀기: 누른 방향으로 차 앞코를 살짝 돌렸다가 떼면 0으로 복귀(이동 경로는 그대로).
      const yawTarget = -latInput * STEER_YAW_MAX; // 오른쪽 입력 → 앞코 오른쪽(heading 감소 방향)
      drive.steerYaw += (yawTarget - drive.steerYaw) * Math.min(1, dt * STEER_YAW_RATE);

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
      orientToTerrain(car, car.position.x, car.position.z, drive.heading + drive.steerYaw); // 노면 피치·롤 + 좌우 yaw 틀기
      // 완주 감속이 거의 멈추면 → 정지 + 결과 화면
      if (game.finishing && drive.speed < drive.maxSpeed * 0.02) finishStop();
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
    // 상태와 무관하게 차를 지형 위에 안착(주행/스핀/복귀 모두 XZ 기준 높이로)
    car.position.y = terrainHeight(car.position.x, car.position.z);
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
      drainEnergy(1); // 에너지: 1초에 1% 감소(0 되면 다이아 1개 차감 후 재충전)
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

    // 차량 뒤를 일정 거리로 따라간다 — 타깃까지 거리를 고정.
    // 충돌(스핀/복귀) 중에는 거리를 좁히고 '위쪽에서 내려다보는' 위치로 옮겨 회복 과정을 관찰한다.
    const collide = drive.state !== 'drive';
    const distTarget = collide ? camFollow.chaseDist * COLLISION_DIST_FRAC : camFollow.chaseDist;
    camFollow.dist += (distTarget - camFollow.dist) * Math.min(1, dt * COLLISION_CAM_RATE);
    _dir.subVectors(camera.position, controls.target);
    const curDist = _dir.length();
    if (curDist > 1e-4) {
      if (collide) {
        // 현재 수평 방위는 유지하되, 고정 고도각으로 차 위·뒤쪽에서 내려다보는 위치로 부드럽게 이동.
        let hx = _dir.x, hz = _dir.z, hl = Math.hypot(hx, hz);
        if (hl < 1e-4) { hx = -Math.cos(drive.heading); hz = Math.sin(drive.heading); hl = 1; } // 폴백: 차 뒤
        hx /= hl; hz /= hl;
        const ch = Math.cos(COLLISION_CAM_ELEV) * camFollow.dist; // 수평 성분
        const cv = Math.sin(COLLISION_CAM_ELEV) * camFollow.dist; // 수직 성분(위로)
        const tx = controls.target.x + hx * ch;
        const ty = controls.target.y + cv;
        const tz = controls.target.z + hz * ch;
        const a = Math.min(1, dt * COLLISION_CAM_RATE);
        camera.position.x += (tx - camera.position.x) * a;
        camera.position.y += (ty - camera.position.y) * a;
        camera.position.z += (tz - camera.position.z) * a;
      } else {
        _dir.multiplyScalar(camFollow.dist / curDist);
        camera.position.copy(controls.target).add(_dir);
      }
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
    const trafficDuBase = (heroSpeed * dt) / drive.length; // 주인공 속도 기준(차별 비율은 아래에서)
    markerBlinkT += dt; // 마커 깜빡임 위상
    for (const t of traffic) {
      if (t.state === 'drive') {
        // 재출발 후 서서히 가속(ramp 0.1→1)
        t.ramp += (1 - t.ramp) * Math.min(1, dt * RESUME_ACCEL);
        t.u = (t.u + trafficDuBase * t.speedRatio * t.ramp) % 1; // 차마다 다른 속도 비율

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
        orientToTerrain(t.rig, t.rig.position.x, t.rig.position.z, t.heading); // 노면 기울기로 피치·롤

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

      // 상태와 무관하게 지형 위에 안착(주행/스핀/복귀 모두 XZ 기준 높이로 맞춤)
      t.rig.position.y = terrainHeight(t.rig.position.x, t.rig.position.z);

      // 마커: 주인공과 가까워지면 노랑으로 깜빡, 멀면 빨강 상시 표시.
      const mdx = t.rig.position.x - car.position.x;
      const mdz = t.rig.position.z - car.position.z;
      const tm = t.markerTri.material;
      if (mdx * mdx + mdz * mdz < markerNearDist * markerNearDist) {
        tm.color.setHex(0xffe000);                                  // 노랑
        tm.opacity = Math.sin(markerBlinkT * 32) > 0 ? 1 : 0.12;    // 빠른 on/off 점멸(≈5Hz, 경고)
      } else {
        tm.color.setHex(0xff3030);                                  // 빨강
        tm.opacity = 1;
      }
    }

    // --- 충돌 검사(주인공 ↔ 상대) → 양쪽을 서로 반대로 스핀시킨다 ---
    checkCollisions();

    // --- 게임 아이템: 트랙 따라 이동·생성, 주인공이 지나가면 획득 ---
    updateItems(dt);

    // --- 랩 카운트(결승선 통과) + 랩 타임 HUD ---
    checkLap();
    updateRaceHud();
  }

  // 충돌 스파크 + 사람(걷기/뛰기) 갱신. 사람은 실제 렌더되는 카메라(체이스/조종석) 시야
  // 밖이면서 먼 경우 스켈레톤 갱신을 건너뛴다(직전 프레임 카메라 행렬 기준 — 1프레임 지연 무시 가능).
  _peopleCams[0] = camera; _peopleCams[1] = miniCam;
  if (!game.paused) {
    updateSparks(dt); updatePeople(dt, _peopleCams); updateFireworks(dt);
    // 마지막 랩 동안 결승선 체커가 반짝이며 기다린다(완주하면 멈춤).
    if (finishChecker) {
      const finalLap = game.started && !game.finished && game.lap === TOTAL_LAPS - 1;
      if (finalLap) {
        checkerBlinkT += dt;
        finishChecker.material.emissiveIntensity = (Math.sin(checkerBlinkT * 7) * 0.5 + 0.5) * 1.1;
      } else if (finishChecker.material.emissiveIntensity !== 0) {
        finishChecker.material.emissiveIntensity = 0;
      }
    }
  }

  // 체이스 카메라 롤/피치: 차 위치의 노면 법선 쪽으로 up 을 기울인다(부드럽게 보간).
  // OrbitControls.update() 가 이 up 으로 타깃을 바라보며 수평선이 노면 따라 기운다.
  if (game.started && drive.active && drive.state === 'drive') {
    terrainNormal(car.position.x, car.position.z, _tNorm);
    _camUpTarget.set(0, 1, 0).lerp(_tNorm, CAM_TILT_FACTOR).normalize();
  } else {
    _camUpTarget.set(0, 1, 0); // 충돌 관찰·타이틀 등에선 수평 유지
  }
  camFollow.up.lerp(_camUpTarget, Math.min(1, dt * CAM_TILT_RATE)).normalize();
  camera.up.copy(camFollow.up);

  // 주행 중에는 마우스 드래그를 조향에 쓰므로 궤도 회전을 끈다(타이틀/정지/게임오버에선 궤도 허용).
  controls.enableRotate = !steerActive();
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
      // 차의 시각적 heading(= heading + steerYaw) 뒤를 따라가 좌/우 입력 시 카메라도 함께 yaw 회전.
      const vh = drive.heading + drive.steerYaw;
      const behindAng = Math.atan2(Math.sin(vh), -Math.cos(vh));
      const az = behindAng + sweep; // 뒤쪽 ± 스윕
      camera.position.x = controls.target.x + Math.cos(az) * horiz;
      camera.position.z = controls.target.z + Math.sin(az) * horiz;
    }
  }

  // --- 조종석(1인칭) 카메라 포즈 갱신 — 전체화면/작은창 어느 쪽에 쓰이든 먼저 계산 ---
  // 차 중심에서 진행 방향 앞·눈높이에 두고, 진행 방향으로 약간(8도) 내려다본다.
  const cockpitReady = miniCam && camFollow.ready && game.started;
  if (cockpitReady) {
    // 노면 기울기를 1인칭 시점에도 반영하되, 카메라는 차량보다 CAM_TILT_FACTOR 배 더 민감.
    terrainNormal(car.position.x, car.position.z, _tNorm);          // 원본 법선
    _tNorm.sub(_up).multiplyScalar(CAM_TILT_FACTOR).add(_up).normalize(); // up + f·(N−up): 기울기 2배
    const vh = drive.heading + drive.steerYaw;                       // 좌우 입력 yaw 를 1인칭 시점에도 반영
    _tFwd.set(Math.cos(vh), 0, -Math.sin(vh));
    _tRgt.crossVectors(_tFwd, _tNorm).normalize();
    _tFwd.crossVectors(_tNorm, _tRgt).normalize();                  // 노면에 눕힌 전방
    miniCam.up.copy(_tNorm);
    miniCam.position.set(
      car.position.x + _tFwd.x * camFollow.camFwd,
      car.position.y + camFollow.eyeHeight + _tFwd.y * camFollow.camFwd, // 전방이 기울면 높이도 따라
      car.position.z + _tFwd.z * camFollow.camFwd
    );
    const cp = Math.cos(0.14), sp = Math.sin(0.14);                 // 약 8도 하향(노면 기준)
    miniCam.lookAt(
      miniCam.position.x + _tFwd.x * cp - _tNorm.x * sp,
      miniCam.position.y + _tFwd.y * cp - _tNorm.y * sp,
      miniCam.position.z + _tFwd.z * cp - _tNorm.z * sp
    );
  }

  // 구름은 월드 고정(따라가지 않음). 단, cyan 하늘 틴트 구만 카메라를 감싸도록 위치를 맞춘다.
  skyTint.position.copy(camera.position);

  // 트랙 미니맵(오른쪽): 코스 선 + 차량 점 갱신(게임 시작 후).
  if (game.started) drawTrackmap();

  // 스왑 여부: 조종석을 전체화면으로 띄울지(전시 화면 중에는 무시).
  // 전시(회전 모델)는 차량 선택 타이틀 화면에서만 띄운다.
  // 수동 일시정지·게임오버는 일러스트 DOM 화면이 대신하므로 전시 모델을 쓰지 않는다.
  const showcasing = !game.started && showcaseScene;
  // 충돌(스핀/복귀) 중에는 작은 창을 끄고 큰 화면을 체이스 모드로 고정해 근접 관찰한다.
  // 주행으로 돌아오면 cockpitMain(원래 모드)·작은 창이 자동 복원된다.
  const collisionView = cockpitReady && drive.active && drive.state !== 'drive';
  const swapped = cockpitMain && cockpitReady && !showcasing && !collisionView;
  // 충돌 중엔 작은 창 프레임(DOM)도 숨김 → 주행 복귀 시 자동 복원(상태 바뀔 때만 토글)
  if (collisionView !== _collisionHidden) {
    _collisionHidden = collisionView;
    if (minimapEl) minimapEl.style.display = collisionView ? 'none' : '';
  }
  const w = window.innerWidth, h = window.innerHeight;
  const fullAspect = w / h, smallAspect = MINIMAP_W / MINIMAP_H;

  // --- 전체화면 패스 ---
  // 차량 선택: 게임 씬은 렌더하지 않고 스튜디오 씬만 렌더(차만 회전, 고정 스포트라이트 + 바닥 그림자).
  if (showcasing) {
    showcaseAngle += dt * SHOWCASE_SPIN;
    showcaseSpinner.rotation.y = showcaseAngle;
    showcaseCam.aspect = fullAspect; showcaseCam.updateProjectionMatrix();
    renderer.toneMappingExposure = SHOWCASE_EXPOSURE;
    renderer.render(showcaseScene, showcaseCam);
    renderer.toneMappingExposure = SCENE_EXPOSURE;       // 복구(다음 패스용)
  } else {
    const mainCam = swapped ? miniCam : camera; // 스왑 시 조종석이 전체화면
    mainCam.aspect = fullAspect; mainCam.updateProjectionMatrix();
    renderer.render(scene, mainCam);
  }

  // --- 작은 창 패스(화면 중앙 상단, 2.5:1) — 75% 불투명도로 합성 ---
  // 평상시엔 조종석 시점, 스왑 시엔 게임(체이스) 화면을 작은 창에 그린다.
  // 충돌 중에는 작은 창을 끈다(큰 화면 체이스 근접뷰만).
  if (cockpitReady && !collisionView) {
    const smallCam = swapped ? camera : miniCam;
    smallCam.aspect = smallAspect; smallCam.updateProjectionMatrix();
    const mx = IS_MOBILE ? MINIMAP_MARGIN : (w - MINIMAP_W) / 2; // 모바일=좌측, 데스크탑=가운데
    const my = h - MINIMAP_H - MINIMAP_MARGIN;    // 뷰포트 원점은 좌하단 → 상단 배치

    // 1) 작은 시점을 오프스크린 타깃에 렌더(알파=1로 채워 오버레이가 사라지지 않게).
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearAlpha(1);
    renderer.setRenderTarget(miniRT);
    renderer.render(scene, smallCam);             // autoClear=true → 타깃 클리어 후 렌더
    renderer.setRenderTarget(null);
    renderer.setClearAlpha(prevAlpha);

    // 2) 메인 화면을 지우지 않고, 작은 창 영역에 반투명 쿼드로 덧그려 25% 비치게.
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setViewport(mx, my, MINIMAP_W, MINIMAP_H);
    renderer.setScissor(mx, my, MINIMAP_W, MINIMAP_H);
    renderer.render(miniOverlayScene, miniOverlayCam);
    renderer.setScissorTest(false);               // 원상 복구(다음 프레임 메인 렌더)
    renderer.autoClear = true;
    renderer.setViewport(0, 0, w, h);
    // 체이스 카메라를 작은창에 쓴 경우 종횡비를 전체화면 기준으로 되돌려 둔다.
    if (swapped) { camera.aspect = fullAspect; camera.updateProjectionMatrix(); }
  }
}
animate();
