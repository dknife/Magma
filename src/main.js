import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

// ---------------------------------------------------------------------------
// 기본 설정값
// ---------------------------------------------------------------------------
const MODEL_URL = './meshes/GenesisMagma.opt.glb'; // Draco 지오메트리 + WebP 텍스처 압축본
const RACEWAY_URL = './meshes/Raceway.opt.glb';     // 트랙 중심 배치용 압축본(Draco + WebP)
const TOYOTA_URL = './meshes/Toyota.opt.glb';       // 트랙 전체를 도는 교통(traffic) 차량(압축본)
const TOYOTA_COUNT = 20;                            // 트랙에 흩뿌릴 Toyota 대수
const TOYOTA_SPEED_RATIO = 0.8;                     // 주인공 레이싱 카 대비 주행 속도 비율
const GROUND_SIZE = 1600;   // 그림자받이 바닥 평면 한 변 길이 (월드 단위)

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
renderer.toneMappingExposure = 0.62; // 전체적으로 조금 더 밝게
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---------------------------------------------------------------------------
// 씬 / 카메라
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d23); // Sky 메쉬가 덮음(로드 전 폴백)
scene.fog = new THREE.Fog(0x24405e, 1200, 4400); // 짙은 청색 — 먼 곳을 푸른 하늘에 블렌드

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(8, 6, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495; // 지면 아래로 못 내려가게
controls.target.set(0, 1, 0);

// ---------------------------------------------------------------------------
// 조명
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffd9a8, 0x4a3b38, 1.05); // 따뜻한 하늘 / 어둑한 지면(조금 밝게)
scene.add(hemi);

// 큰 트랙에서도 그림자가 선명하도록, 태양광은 차를 따라다니게 한다.
// (그림자 카메라 영역을 차 주변으로 좁게 유지 → 높은 해상도)
// 일몰: 태양을 지평선 근처로 낮춰 긴 그림자 + 따뜻한 색
const SUN_OFFSET = new THREE.Vector3(150, 30, 75); // 차 기준 태양 위치(저고도)
const sun = new THREE.DirectionalLight(0xffa15c, 2.6); // 따뜻한 주황빛
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
// 짙은 푸른 하늘: 레일리 산란↑(파랑 강화) + 탁도↓(맑고 진하게)
skyU['turbidity'].value = 2;
skyU['rayleigh'].value = 5;
skyU['mieCoefficient'].value = 0.003;
skyU['mieDirectionalG'].value = 0.8;
// 하늘의 태양 위치를 조명 방향(SUN_OFFSET, 저고도)과 일치시켜 그림자와 정합
skyU['sunPosition'].value.copy(SUN_OFFSET).normalize();

// ---------------------------------------------------------------------------
// 지면 / 그리드 / 축 헬퍼
// ---------------------------------------------------------------------------
// 초록색 바닥(잔디) — 그림자도 받음
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE * 2, GROUND_SIZE * 2),
  new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1.0, metalness: 0.0 })
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

// 브레이크등(감속 시 후면 적색 발광)
let brakeMaterial = null;   // 발광 머티리얼(emissiveIntensity 를 조절)
let brakeLight = null;      // 후면 적색 포인트라이트
const brake = { glow: 0 };  // 0~1 발광 정도(부드럽게 보간)

// 코너 속도(slow-in / fast-out) 튜닝
const CORNER_EPS = 0.006;       // 곡률 측정용 접선 간격(u 단위)
const TURN_MAX = 0.22;          // 이 이상 꺾이면 최저 속도(rad)
const BRAKE_TIME = 1.4;         // 전방 브레이킹 예측 시간(초) — 클수록 더 일찍 감속(slow-in)
const BRAKE_SAMPLES = 6;        // 전방 곡률 스캔 표본 수
const SPEED_BRAKE = 3.2;        // 감속 강도(코너 진입, 강하게)
const SPEED_ACCEL = 1.1;        // 가속 강도(코너 탈출 fast-out, 부드럽게)
const LATERAL_RETURN_RATE = 2.0;// 좌우 키를 놓으면 횡오프셋이 0으로 복귀하는 속도(1/s)

// 충돌/스핀/복귀 튜닝
const SPIN_OMEGA0 = 5.0;        // 충돌 직후 회전 각속도(rad/s)
const SPIN_OMEGA_DECAY = 4.0;   // 회전 감쇠율(1/s) — 제자리 스핀이 잦아드는 속도
const SPIN_OMEGA_STOP = 0.3;    // 이 각속도 미만이면 스핀 종료로 보고 복귀
const SPIN_SPEED_DECAY = 30.0;  // 진행 속도 감쇠율(1/s) — 충돌 직후 즉시 0에 수렴
const RECOVER_SPEED_FRAC = 0.15;       // 주인공 복귀 주행 속도(maxSpeed 비율) — 천천히 이동
const TRAFFIC_RECOVER_SPEED_FRAC = 0.04;// 상대 차 복귀 속도(매우 느리게 — 주인공과 충돌 회피)
const RECOVER_TURN = 3.0;       // 복귀 시 선회 각속도(rad/s)
const RECOVER_ALIGN = 0.12;     // 주행선 방향 일치 판정 허용 오차(rad)
const RECOVER_ACCEL_RATE = 1.5; // 복귀 중 정지(≈0)→순항 속도 가속(1/s) — 전이 연속성
const COLLISION_COOLDOWN = 1.5; // 복귀 후 재충돌 방지 시간(s)
const RESUME_ACCEL = 0.5;       // 복귀 후 최대속도까지 서서히 가속(1/s)
const AVOID_RATE = 2.5;         // 교통 차량 회피 차선 변경 부드러움(1/s)
let collisionDist = 0;          // 충돌 판정 거리 — 모델 로드 후 설정
let recoverArrive = 0;          // 곡선 도달 판정 거리 — 모델 로드 후 설정
let avoidRadius = 0;            // 교통 차량이 레이싱 카를 회피하기 시작하는 거리
let avoidClearance = 0;         // 회피 시 확보할 횡방향 간격

// 카메라 추적 + 높이 진동 + 근접/원거리 반복
const CAM_BOB_OMEGA = 1.1;      // 상하 진동 각속도(rad/s)
const CAM_DOLLY_OMEGA = 0.45;   // 근접↔원거리 왕복 각속도(rad/s) — 더 느린 주기
const CAM_REAR_HALF_ANGLE = Math.PI / 4; // 카메라 허용 범위: 차 뒤쪽 ±45°(총 90°)
const COCKPIT_FWD_RATIO = 0.10; // 차 중심 기준 조종석의 전방 위치(차 길이 비율)

// 미니맵(화면 중앙 상단): 조종석 전방 시점. 가로:세로 = 2.5:1.
// 픽셀 크기·여백은 index.html 의 #minimap 프레임과 일치시킨다.
const MINIMAP_W = 320;          // 미니맵 너비(px)
const MINIMAP_H = 154;          // 미니맵 높이(px) — 상하 1.2배(128→154)
const MINIMAP_MARGIN = 16;      // 화면 상단 여백(px)
const MINIMAP_LAYER = 1;        // 조종석 카메라 전용 마커 레이어(메인 화면은 무시)
let miniCam = null;             // 조종석 전방 시점 카메라(모델 로드 후 생성)
const camFollow = {
  prev: new THREE.Vector3(),
  ready: false,
  t: 0,                          // 높이 진동 위상 누적 시간
  bobPrev: 0,                    // 직전 프레임의 진동 오프셋
  bobAmp: 0,                     // 진동 진폭 — 모델 로드 후 설정
  dollyT: 0,                     // 근접/원거리 위상 누적 시간
  nearDist: 0,                   // 근접샷 거리 — 모델 로드 후 설정
  farDist: 0,                    // 원거리샷 거리
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

// 스핀 한 프레임: 진행 속도는 충돌 직후 즉시 0에 수렴(거의 미끄러지지 않음)하고,
// 차는 제자리에서 회전하며 회전 속도가 서서히 줄어든다. 회전이 충분히 잦아들면
// 스핀 종료로 보고 true 반환 → 복귀 단계로.
function stepSpin(rec, obj, dt) {
  // 진행 속도 즉시 0 수렴
  rec.slideSpeed *= Math.max(0, 1 - SPIN_SPEED_DECAY * dt);
  obj.position.x += rec.slideDir.x * rec.slideSpeed * dt;
  obj.position.z += rec.slideDir.z * rec.slideSpeed * dt;
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

  // 완료 판정: 주행선에 충분히 가깝고 진행 방향이 접선과 일치
  _lat.crossVectors(_up, _tan).normalize();
  const latOffset = (obj.position.x - _pos.x) * _lat.x + (obj.position.z - _pos.z) * _lat.z;
  let hAng = lineHeading - rec.heading;
  hAng = Math.atan2(Math.sin(hAng), Math.cos(hAng));
  return Math.abs(latOffset) < recoverArrive && Math.abs(hAng) < RECOVER_ALIGN;
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
      color: 0x9a9ea6, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
    })
  );
  road.receiveShadow = true;
  scene.add(road);

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
  const baseSize = roadHalfWidth * 0.03; // 도로 폭 대비 자잘한 크기(더 작게)
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
// 레이스웨이(Raceway) — 주행 코스 중심(원점)에 배치
// ---------------------------------------------------------------------------
// 압축본 Raceway.opt.glb 는 단위 스케일(약 1.9 유닛)로 정규화돼 있다.
// 트랙은 원점을 둘러싼 닫힌 곡선이므로, 레이스웨이를 트랙 안쪽(인필드)에
// 들어가도록 스케일·정렬해 코스 한가운데에 놓는다.
function loadRaceway(trackRadius) {
  gltfLoader.load(
    RACEWAY_URL,
    (gltf) => {
      const racetrack = gltf.scene;
      racetrack.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      // 바운딩 박스로 크기 측정 → 수평 footprint 를 트랙 인필드에 맞춰 스케일
      let box = new THREE.Box3().setFromObject(racetrack);
      const size = box.getSize(new THREE.Vector3());
      const horiz = Math.max(size.x, size.z) || 1;
      // 트랙 곡선의 내측 반경(약 0.5·trackRadius)에 들어가도록 지름을 잡는다.
      const targetSpan = trackRadius * 0.9;
      racetrack.scale.setScalar(targetSpan / horiz);
      racetrack.updateMatrixWorld(true);

      // 스케일 적용 후 다시 측정해 XZ 중심을 원점으로 정렬.
      // 바닥 정렬(min.y)은 떠 보이고 상단 정렬(max.y)은 지면 아래로 묻히므로,
      // 수직 중심(center.y)을 기준으로 노면을 주행 평면(y=0) 근처에 두되,
      // 살짝 위로 올려(높이의 약 25%) 노면이 바닥에 더 잘 드러나게 한다.
      box = new THREE.Box3().setFromObject(racetrack);
      const center = box.getCenter(new THREE.Vector3());
      const lift = (box.max.y - box.min.y) * 0.40; // 위로 올리는 양(스케일 비례)
      racetrack.position.x -= center.x;
      racetrack.position.z -= center.z;
      racetrack.position.y -= center.y - lift;

      scene.add(racetrack);
      console.log(
        `[Raceway] 로드 완료 — 배치 footprint ≈ ${targetSpan.toFixed(1)} ` +
        `(트랙 반경 ${trackRadius.toFixed(1)})`
      );
    },
    undefined,
    (err) => console.error('[Raceway] 로드 실패:', err)
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

// 차량(바운딩 크기 size)을 조종석 시점에서 강조: 밝은 테두리(와이어 박스) +
// 위쪽 역삼각형 마커. 둘 다 MINIMAP_LAYER 에만 두어 조종석 카메라에서만 보인다.
function buildCockpitMarker(size) {
  const group = new THREE.Group();
  // 밝은 테두리(차 바운딩 박스 외곽선)
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: 0xff3030, toneMapped: false })
  );
  box.position.y = size.y / 2; // 바닥 안착 모델 → 박스 중심을 차 높이 절반에
  box.layers.set(MINIMAP_LAYER);
  group.add(box);
  // 위쪽 역삼각형(▼) — 스프라이트(항상 카메라를 향함)
  const s = size.x * 0.7;
  const tri = new THREE.Sprite(new THREE.SpriteMaterial({
    map: _triTex, toneMapped: false, depthTest: false, transparent: true,
  }));
  tri.scale.set(s, s, 1);
  tri.position.y = size.y + s * 0.7; // 차 위로 띄움
  tri.layers.set(MINIMAP_LAYER);
  group.add(tri);
  return group;
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

    // 레이스웨이를 코스 중심(원점)에 배치
    loadRaceway(trackRadius);

    // 교통 차량(Toyota) N대를 트랙 전체에 흩뿌려 각자 주행시킴
    loadToyota(size, TOYOTA_COUNT);

    // 속도: 다시 2배(직선 maxDim*72). 코너는 크게 감속.
    drive.maxSpeed = maxDim * 72;
    drive.minSpeed = maxDim * 10;            // 코너 최저 속도
    drive.speed = drive.maxSpeed;
    drive.grip = maxDim * 100;               // 접지력(횡가속도 한계) — 매우 높여 거의 안 밀림
    drive.aimAhead = (maxDim * 9) / drive.length; // 추격 목표를 차 앞 ~9 차길이
    drive.u = 0;
    drive.prevSpeed = drive.speed;
    drive.recoverFrac = RECOVER_SPEED_FRAC; // 주인공 복귀 속도
    drive.lateralMax = size.z * 3;          // 주행선 횡오프셋 한계 ±3w(w=차폭)
    drive.lateralRate = size.z * 4;         // 좌우 화살표 횡이동 속도(≈1.5초에 전구간)
    drive.active = true;

    // 충돌 판정/곡선 도달 거리(차 크기 비례)
    collisionDist = maxDim * 0.7; // 충돌 영역을 조금 작게(접촉보다 더 가까울 때만)
    recoverArrive = maxDim * 0.3;
    // 교통 차량 회피: 이 거리 안에서 횡방향 간격을 확보하며 비켜간다
    avoidRadius = maxDim * 4.0;
    avoidClearance = maxDim * 1.2; // collisionDist 보다 크게 → 확실히 비켜감

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

    // 카메라 상하 진동 진폭(차 크기에 비례) — 높이 60% 수준에 맞춰 축소
    camFollow.bobAmp = maxDim * 0.78;
    // 근접샷 / 원거리샷 거리(차 크기에 비례)
    camFollow.nearDist = maxDim * 2.2;
    camFollow.farDist = maxDim * 5.5;        // 최원거리를 기존(11)의 1/2로
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
    miniCam = new THREE.PerspectiveCamera(86, MINIMAP_W / MINIMAP_H, maxDim * 0.05, 2000);
    miniCam.layers.enable(MINIMAP_LAYER); // 강조 마커(테두리·역삼각형)는 조종석 시점에만
    camFollow.eyeHeight = size.y * 0.95;      // 조종석 눈높이(조금 더 높게)
    // 차체에 시야가 막히지 않도록 카메라를 차 앞코(앞 절반 끝 ≈ 0.5·size.x)
    // 너머로 빼 전방 상황이 보이게 한다.
    camFollow.camFwd = size.x * 0.6;

    console.log(
      `[GenesisMagma] 로드 완료 — 크기(W×H×L): ` +
      `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}, ` +
      `트랙 길이 ${drive.length.toFixed(1)}`
    );

    loaderEl.classList.add('hidden');
    setTimeout(() => loaderEl.remove(), 500);
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

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (drive.active) {
    let decelNorm = 0; // 브레이크등 세기(스핀/복귀 중엔 0)

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
      drive.u = (drive.u + (drive.speed * dt) / drive.length) % 1;

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
      const maxTurn = (drive.grip / Math.max(drive.speed, 1e-3)) * dt;
      drive.heading += Math.max(-maxTurn, Math.min(maxTurn, dAng));

      // 기준 위치를 진행 방향으로 전진
      const fx = Math.cos(drive.heading);
      const fz = -Math.sin(drive.heading);
      drive.basePos.x += fx * drive.speed * dt;
      drive.basePos.z += fz * drive.speed * dt;

      // 실제(충돌·표시) 위치 = 기준 위치 + 차의 오른쪽(sinθ,0,cosθ)으로 횡오프셋.
      // 추격 루프와 분리되어 있어 진동이 없고, 충돌 판정도 오프셋을 정확히 반영한다.
      car.position.set(
        drive.basePos.x + Math.sin(drive.heading) * drive.lateral,
        0,
        drive.basePos.z + Math.cos(drive.heading) * drive.lateral
      );
      car.rotation.y = drive.heading;
    } else if (drive.state === 'spin') {
      // 충돌 스핀: 진행 속도를 유지한 채 미끄러지며 회전 → 멈추면 복귀로
      if (stepSpin(drive, car, dt)) enterRecover(drive, car);
    } else { // 'recover'
      // 정지 후 원래 주행 곡선으로 복귀 → 도달하면 정상 주행 재개
      if (stepRecover(drive, car, dt)) resumeHero();
    }
    if (drive.cooldown > 0) drive.cooldown -= dt;

    // --- 브레이크등: 감속도에 비례해 후면을 적색 발광(스핀/복귀 중엔 서서히 소등) ---
    brake.glow += (decelNorm - brake.glow) * Math.min(1, dt * 10); // 부드럽게
    if (brakeMaterial) brakeMaterial.emissiveIntensity = brake.glow * 3.5;
    if (brakeLight) brakeLight.intensity = brake.glow * brakeLight.userData.peak;

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

    // 근접샷 ↔ 원거리샷을 지속 반복: 타깃까지의 거리를 사인파로 왕복시킨다.
    // (현재 시선 방향을 유지한 채 거리만 목표값으로 맞춰 줌인/줌아웃)
    camFollow.dollyT += dt;
    const sRaw = Math.sin(camFollow.dollyT * CAM_DOLLY_OMEGA) * 0.5 + 0.5; // 0(근접)~1(원거리)
    const s = Math.pow(sRaw, 2.4); // 근접 쪽으로 치우쳐 근접샷 비율↑
    const targetDist = camFollow.nearDist + (camFollow.farDist - camFollow.nearDist) * s;
    _dir.subVectors(camera.position, controls.target);
    const curDist = _dir.length();
    if (curDist > 1e-4) {
      _dir.multiplyScalar(targetDist / curDist);
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
    // 'drive' 는 곡선 추종(주인공 속도의 80%), 'spin'/'recover' 는 주인공과 동일.
    const trafficDu = (drive.speed * TOYOTA_SPEED_RATIO * dt) / drive.length;
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
      } else if (t.state === 'spin') {
        if (stepSpin(t, t.rig, dt)) enterRecover(t, t.rig);
      } else { // 'recover'
        if (stepRecover(t, t.rig, dt)) resumeTraffic(t);
      }
      if (t.cooldown > 0) t.cooldown -= dt;
    }

    // --- 충돌 검사(주인공 ↔ 상대) → 양쪽을 서로 반대로 스핀시킨다 ---
    checkCollisions();
  }

  controls.update();

  // 카메라가 조종석보다 앞(진행 방향)으로 나가지 않도록 제한한다.
  // 진행축 f=(cosθ,0,-sinθ) 위에서 카메라가 조종석 지점보다 앞서 있으면
  // 그 초과분만큼 뒤로 끌어당겨 조종석 평면에 머무르게 한다(높이는 유지).
  // (스핀 중에는 heading 이 빠르게 돌아 클램프가 흔들리므로 정상 주행일 때만.)
  if (drive.active && drive.state === 'drive') {
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

  // 카메라를 차량 '뒤쪽' ±45°(총 90°) 범위로 제한한다(멀어졌다/가까워지는 줌은 유지).
  // 뒤쪽 방향 = 진행(heading) 반대. 차가 회전하면 그 범위도 함께 돌아 항상 뒤를 본다.
  // (스핀 중에는 heading 이 빠르게 돌아 카메라가 휙휙 돌므로 정상 주행일 때만.)
  if (drive.active && drive.state === 'drive') {
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz > 1e-4) {
      const camAng = Math.atan2(dz, dx);
      const behindAng = Math.atan2(Math.sin(drive.heading), -Math.cos(drive.heading));
      let rel = camAng - behindAng;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel)); // [-π, π]
      const clamped = Math.max(-CAM_REAR_HALF_ANGLE, Math.min(CAM_REAR_HALF_ANGLE, rel));
      if (clamped !== rel) {
        const newAng = behindAng + clamped;
        camera.position.x = controls.target.x + Math.cos(newAng) * horiz;
        camera.position.z = controls.target.z + Math.sin(newAng) * horiz;
      }
    }
  }

  renderer.render(scene, camera);

  // --- 미니맵: 조종석에서 앞을 바라보는 두 번째 패스(화면 중앙 상단, 2.5:1) ---
  // 원근 카메라를 조종석 위치(차 중심에서 진행 방향 앞·눈높이)에 두고 진행
  // 방향으로 약간(8도) 내려다보게 해 노면이 보이는 1인칭 전방 시점을 그린다.
  if (miniCam && camFollow.ready) {
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

    const w = window.innerWidth, h = window.innerHeight;
    const mx = (w - MINIMAP_W) / 2;               // 화면 중앙(가로)
    const my = h - MINIMAP_H - MINIMAP_MARGIN;    // 뷰포트 원점은 좌하단 → 상단 배치
    renderer.setScissorTest(true);                // 미니맵 영역만 클리어/렌더
    renderer.setViewport(mx, my, MINIMAP_W, MINIMAP_H);
    renderer.setScissor(mx, my, MINIMAP_W, MINIMAP_H);
    renderer.render(scene, miniCam);
    renderer.setScissorTest(false);               // 원상 복구(다음 프레임 메인 렌더)
    renderer.setViewport(0, 0, w, h);
  }
}
animate();
