# Genesis Magma — WebGL 주행 시뮬레이션

`meshes/GenesisMagma.glb` 차량 모델을 Three.js(WebGL)로 불러와, 닫힌 곡선 트랙을 자동 주행하는 시뮬레이션입니다.

## 실행

로컬 정적 서버가 필요합니다(GLB는 `file://`에서 CORS로 로드 불가).

```bash
npm start        # = node server.js
# http://localhost:5173 접속
```

의존성 설치 없이 동작합니다(`server.js`는 표준 라이브러리만 사용, Three.js는 CDN import map).

## 주요 기능

- **모델 로딩**: 바운딩 박스 기반 자동 정렬(바닥 안착·중심 정렬), +X 정면 정렬.
- **트랙**: `CatmullRomCurve3` 닫힌 곡선 + 아스팔트 도로 리본, 초록 바닥, 트랙 위 자잘한 이물질(InstancedMesh).
- **주행 모델**:
  - 곡률 기반 **slow-in / fast-out** 속도 제어.
  - 접지력(grip) 한계가 있는 추격(pursuit) 조향 → 급코너에서 관성 이탈.
  - 감속 시 후면 **브레이크등** 점등.
- **카메라**: 차량 추적 + 높이 진동 + 근접/원거리 반복(시네마틱), OrbitControls 회전 가능. 카메라는 조종석보다 진행 방향 앞으로 나가지 않게 제한.
- **미니맵**: 우측 상단에 조종석에서 앞을 바라보는 원근 카메라 2차 패스(1인칭 전방 시점).
- **환경**: 절차적 Sky-box(짙은 청색), 차량을 따라다니는 태양광 그림자.

## 에셋 압축

원본 `GenesisMagma.glb`(16.3 MB)를 `gltf-transform`으로 압축한 `GenesisMagma.opt.glb`(약 0.64 MB)를 사용합니다.

- 지오메트리: **Draco** 압축 (`DRACOLoader`, 디코더는 CDN).
- 텍스처: **WebP** + 1024 리사이즈(브라우저 기본 디코드).

재압축 예:

```bash
npx @gltf-transform/cli optimize meshes/GenesisMagma.glb meshes/GenesisMagma.opt.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

트랙 중심에 배치하는 `Raceway.glb`(16.0 MB)도 같은 방식으로 `Raceway.opt.glb`(약 1.54 MB)로 압축해 사용합니다.

```bash
npx @gltf-transform/cli optimize meshes/Raceway.glb meshes/Raceway.opt.glb \
  --compress draco --texture-compress webp --texture-size 2048
```

레이스웨이는 단위 스케일로 정규화돼 있어, 로드 시 트랙 인필드 크기에 맞춰 스케일링하고 코스 중심(원점)에 바닥 안착시켜 배치합니다.

교통 차량 `Toyota.glb`(13.1 MB)도 같은 방식으로 `Toyota.opt.glb`(약 0.48 MB)로 압축해 사용합니다.

```bash
npx @gltf-transform/cli optimize meshes/Toyota.glb meshes/Toyota.opt.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

Toyota는 메인 차량과 비슷한 크기로 정규화한 뒤 한 번만 로드하고, 같은 메쉬를 `TOYOTA_COUNT`(기본 20)대 복제(geometry/material 공유)해 트랙 곡선 전체에 균등하게 흩뿌립니다. 각 대는 곡선을 따라 **독립적으로** 주행하며 속도는 주인공 레이싱 카의 `TOYOTA_SPEED_RATIO`(기본 80%)입니다. 주행선에서의 횡방향 오프셋은 차폭 `w` 기준 `[-3w, 3w]` 균등분포로 무작위 결정해 한 줄로 늘어서지 않게 했습니다.

## 구조

```
index.html      진입점(HUD·로딩바·import map)
src/main.js      씬·트랙·주행·카메라·환경
server.js        의존성 없는 정적 서버
meshes/          GLB 모델(원본 + 압축본)
```
