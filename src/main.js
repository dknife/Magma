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
renderer.toneMappingExposure = 0.5; // 짙은 하늘을 위해 노출 약간 하향
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
const hemi = new THREE.HemisphereLight(0xffd9a8, 0x4a3b38, 0.8); // 따뜻한 하늘 / 어둑한 지면
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
};

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

// 카메라 추적 + 높이 진동 + 근접/원거리 반복
const CAM_BOB_OMEGA = 1.1;      // 상하 진동 각속도(rad/s)
const CAM_DOLLY_OMEGA = 0.45;   // 근접↔원거리 왕복 각속도(rad/s) — 더 느린 주기
const COCKPIT_FWD_RATIO = 0.10; // 차 중심 기준 조종석의 전방 위치(차 길이 비율)

// 미니맵(우측 상단): 차 위에서 내려다보는 직교 카메라. 화면 위 = 차 진행 방향.
// 픽셀 크기·여백은 index.html 의 #minimap 프레임과 일치시킨다.
const MINIMAP_SIZE = 200;       // 미니맵 한 변(px)
const MINIMAP_MARGIN = 16;      // 화면 가장자리 여백(px)
let miniCam = null;             // 모델 로드 후 생성(차 크기에 맞춰 프러스텀 설정)
let miniHeight = 0;             // 미니맵 카메라 높이(월드 단위)
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

// 곡선 위 u 지점의 국소 곡률 → 허용(목표) 속도. 급할수록 minSpeed에 가까움.
function cornerSpeedLimit(u) {
  const a = ((u % 1) + 1) % 1;
  drive.curve.getTangentAt(a, _tan);
  drive.curve.getTangentAt(((a + CORNER_EPS) % 1), _tanAhead);
  const sharp = Math.min(_tan.angleTo(_tanAhead) / TURN_MAX, 1); // 0=직선,1=급코너
  return drive.maxSpeed + (drive.minSpeed - drive.maxSpeed) * sharp;
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

      // 스케일 적용 후 재측정 → 바닥 안착(min.y=0)·XZ 중심 정렬 + 차폭(w) 산출
      box = new THREE.Box3().setFromObject(toy);
      const center = box.getCenter(new THREE.Vector3());
      const w = box.getSize(new THREE.Vector3()).z; // 스케일 반영된 차폭(횡방향)
      toy.position.x -= center.x;
      toy.position.z -= center.z;
      toy.position.y -= box.min.y;

      // N대 복제 → 각자 리그(Group)에 담아 곡선 위에 균등 배치.
      // 리그가 곡선 위치·진행 방향 회전을 담당하고, 안쪽 clone 은 정규화 상태 유지.
      for (let i = 0; i < count; i++) {
        const rig = new THREE.Group();
        rig.add(toy.clone());
        scene.add(rig);
        // 주행선 횡방향 오프셋: [-3w, 3w] 균등분포로 무작위 결정.
        traffic.push({
          rig,
          u: i / count,                        // 곡선 위 균등 분포
          lateral: (Math.random() * 2 - 1) * 3 * w,
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
    drive.active = true;

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

    // 카메라 상하 진동 진폭(차 크기에 비례)
    camFollow.bobAmp = maxDim * 1.3;
    // 근접샷 / 원거리샷 거리(차 크기에 비례)
    camFollow.nearDist = maxDim * 2.2;
    camFollow.farDist = maxDim * 5.5;        // 최원거리를 기존(11)의 1/2로
    // 조종석은 차 중심에서 진행 방향으로 size.x·비율 만큼 앞(카메라 전진 한계)
    camFollow.cockpitFwd = size.x * COCKPIT_FWD_RATIO;

    // 차를 트랙 시작점에 배치하고 접선 방향(+X 정면)으로 정렬
    drive.curve.getPointAt(0, _pos);
    drive.curve.getTangentAt(0, _tan);
    car.position.set(_pos.x, 0, _pos.z);
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
      maxDim * 2.0,
      car.position.z + maxDim * 3.0
    );
    controls.update();

    // 미니맵 카메라: 차 위 높은 곳에서 수직으로 내려다보는 직교(ortho) 카메라.
    // 한 변이 차 길이의 약 60배인 정사각 영역을 보여 주변 도로·교통을 담는다.
    const miniExtent = maxDim * 30;          // 화면 절반에 담기는 월드 거리(반경)
    miniHeight = maxDim * 80;                 // 차 위 카메라 높이
    miniCam = new THREE.OrthographicCamera(
      -miniExtent, miniExtent, miniExtent, -miniExtent, 1, miniHeight * 1.5
    );

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

    // --- 브레이크등: 감속도(속도 감소율)에 비례해 후면을 적색 발광 ---
    const accel = (drive.speed - drive.prevSpeed) / Math.max(dt, 1e-4);
    drive.prevSpeed = drive.speed;
    const decelNorm = Math.min(Math.max(-accel, 0) / drive.maxSpeed, 1); // 0~1
    brake.glow += (decelNorm - brake.glow) * Math.min(1, dt * 10); // 부드럽게
    if (brakeMaterial) brakeMaterial.emissiveIntensity = brake.glow * 3.5;
    if (brakeLight) brakeLight.intensity = brake.glow * brakeLight.userData.peak;

    // --- 기준 목표를 곡선 위에서 전진(닫힌 곡선이라 u>1 이면 0으로 순환) ---
    drive.u = (drive.u + (drive.speed * dt) / drive.length) % 1;

    // --- 관성 주행(추격 모델): 곡선 위 앞 지점을 목표로 조향하되,
    //     조향 각속도를 접지력(grip)으로 제한 → 급코너에선 못 꺾고 밖으로 밀림 ---
    drive.curve.getPointAt((drive.u + drive.aimAhead) % 1, _aim);
    const desiredHeading = Math.atan2(
      -(_aim.z - car.position.z),
      _aim.x - car.position.x
    );
    // 목표와의 각도차를 [-π, π]로 래핑
    let dAng = desiredHeading - drive.heading;
    dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
    // 접지력 한계 → 최대 선회 각속도 ω = grip / v (속도가 빠를수록 덜 꺾임)
    const maxTurn = (drive.grip / Math.max(drive.speed, 1e-3)) * dt;
    drive.heading += Math.max(-maxTurn, Math.min(maxTurn, dAng));

    // 실제 진행 방향으로 전진(곡선이 아니라 차의 heading을 따라 이동)
    const fx = Math.cos(drive.heading);
    const fz = -Math.sin(drive.heading);
    car.position.x += fx * drive.speed * dt;
    car.position.z += fz * drive.speed * dt;
    // 차의 +X(앞코)를 실제 진행 방향에 정렬(밀릴 때 라인 바깥을 향함)
    car.rotation.y = drive.heading;

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

    // --- 교통 차량(Toyota): 곡선을 따라 각자 주행(주인공 속도의 80%) ---
    // 닫힌 곡선을 그대로 따르므로 항상 트랙 위에 있고, 진행값 u 만 전진시킨다.
    // 차선(lateral) 오프셋은 접선의 수직(횡)방향으로 더해 한 줄 행렬을 피한다.
    const trafficDu = (drive.speed * TOYOTA_SPEED_RATIO * dt) / drive.length;
    for (const t of traffic) {
      t.u = (t.u + trafficDu) % 1;
      drive.curve.getPointAt(t.u, _pos);
      drive.curve.getTangentAt(t.u, _tan);
      _lat.crossVectors(_up, _tan).normalize().multiplyScalar(t.lateral);
      t.rig.position.set(_pos.x + _lat.x, 0, _pos.z + _lat.z);
      t.rig.rotation.y = Math.atan2(-_tan.z, _tan.x); // +X 앞코를 진행 방향에 정렬
    }
  }

  controls.update();

  // 카메라가 조종석보다 앞(진행 방향)으로 나가지 않도록 제한한다.
  // 진행축 f=(cosθ,0,-sinθ) 위에서 카메라가 조종석 지점보다 앞서 있으면
  // 그 초과분만큼 뒤로 끌어당겨 조종석 평면에 머무르게 한다(높이는 유지).
  if (drive.active) {
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

  renderer.render(scene, camera);

  // --- 미니맵: 차 위에서 내려다보는 두 번째 패스(우측 상단) ---
  // 직교 카메라를 차 바로 위에 두고 수직으로 내려다보되, 카메라의 up 벡터를
  // 차의 진행 방향으로 맞춰 '화면 위 = 진행 방향'이 되게 한다(GPS식 헤딩-업).
  if (miniCam && camFollow.ready) {
    const fx = Math.cos(drive.heading);
    const fz = -Math.sin(drive.heading);
    miniCam.position.set(car.position.x, miniHeight, car.position.z);
    miniCam.up.set(fx, 0, fz);                 // 진행 방향이 화면 위쪽
    miniCam.lookAt(car.position.x, 0, car.position.z);

    const w = window.innerWidth, h = window.innerHeight;
    const mx = w - MINIMAP_SIZE - MINIMAP_MARGIN;
    const my = h - MINIMAP_SIZE - MINIMAP_MARGIN; // 뷰포트 원점은 좌하단 → 상단 배치
    renderer.setScissorTest(true);                // 미니맵 영역만 클리어/렌더
    renderer.setViewport(mx, my, MINIMAP_SIZE, MINIMAP_SIZE);
    renderer.setScissor(mx, my, MINIMAP_SIZE, MINIMAP_SIZE);
    renderer.render(scene, miniCam);
    renderer.setScissorTest(false);               // 원상 복구(다음 프레임 메인 렌더)
    renderer.setViewport(0, 0, w, h);
  }
}
animate();
