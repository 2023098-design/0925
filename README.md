# 공부각 — 성신여대 공부 공간 리뷰 🧊✋

> 「캠퍼스 공간 리뷰」 · 성신여대 주변에서 공부하거나 작업할 만한 공간을 기록하고 후기를 나누는 서비스
> **웹 목록 ↔ 3D 지도**를 오가며 키보드 · 마우스 · **카메라 손 제스처** · **TouchDesigner** 로 조작합니다.

**▶ 배포 주소: https://2023098-design.github.io/0925/**

| 웹 목록 | 3D 지도 (Blender) | 지도 디자인 필터 7종 |
|---|---|---|
| 검색 · 태그 · 분류 · 정렬 · 상세 · 리뷰 작성 | 성신여대입구역 ~ 수정캠퍼스 반경 560m | 손바닥을 좌우로 휙 → 필터 변경 |

---

## 추천 공간 11곳

| # | 공간 | 분류 | 주소 |
|---|---|---|---|
| 1 | 위드스터디라운지 | 스터디카페 | 보문로34가길 20 1층 |
| 2 | 스터디위드미 라운지 | 스터디카페 | 보문로34가길 2 3층 |
| 3 | 카페구월 | 카페 | 보문로30길 43 |
| 4 | 팀홀튼 성신여대입구역점 | 카페 | 동소문로 97 1층 |
| 5 | 스타벅스 성신여대점 | 카페 | 동소문로24길 12 |
| 6 | 무스커피 | 카페 | 동소문로20나길 48 1층 |
| 7 | 스타벅스 성신여대정문점 | 카페 | 보문로34길 62 |
| 8 | 컴포즈커피 안암성북천점 | 카페 | 고려대로7길 74 1층 |
| 9 | 설빙 서울성신여대점 | 디저트카페 | 동소문로22길 36 2·3층 |
| 10 | 페이스 스터디카페 워크스페이스 성신여대점 | 스터디카페 | 동소문로26다길 23 2층 |
| 11 | 카공족 성신여대점 | 스터디카페 | 아리랑로4길 5 2층 |

각 공간 상세 화면에 네이버지도 링크가 있습니다. 지도 좌표(`data/geo.json`)는 OpenStreetMap 도로·주소로 추정한 근사값이고, 운영시간은 예시값이에요. 기본 리뷰 26개는 **시연용 예시 리뷰**입니다 (화면에 ‘예시’ 표시).

## 조작법

| | 키보드 | 손 제스처 (카메라 · TouchDesigner) |
|---|---|---|
| 웹 ↔ 3D 지도 | `M` | ✌️ 브이 1초 유지 |
| 지도 디자인 필터 | `F` / `Shift+F` | 🖐 손바닥을 좌우로 휙 (스와이프) |
| 이동 | `←↑↓→` `WASD` | 🤏 핀치한 채로 끌기 |
| 회전 · 기울기 | `Q` `E` · `PgUp` `PgDn` | ✊ 주먹 쥐고 끌기 |
| 확대 · 축소 | `Z` `X` · 휠 | 🤏🤏 양손 핀치 벌리기/오므리기 |
| 선택 · 클릭 | `Tab` → `Enter` | ☝️ 검지로 가리키고 🤏 핀치 |
| 다음 공간 | `Tab` | 👍 1초 유지 |
| 자동 투어 · 처음 시점 | `Space` · `H` | |
| 카메라 제스처 켜기 | `C` | |
| TouchDesigner 연결 | `T` | |
| 검색 · 뽀모도로 · 도움말 | `/` · `P` · `?` | |

## 지도 디자인 필터

`js/filters.js` 한 곳에서 웹 화면 색(CSS 변수)과 3D 지도(재질 · 조명 · 안개 · 블룸 · 후처리 셰이더)를 함께 정의합니다. TouchDesigner 카메라 화면도 같은 순서의 필터(`touchdesigner/filters.glsl`)로 바뀝니다.

| 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 🌸 파스텔 데이 | 🌃 미드나잇 네온 | 📐 블루프린트 | ✏️ 페이퍼 스케치 | 🌇 골든아워 | 🔥 공부 히트맵 | 🧸 클레이 토이 |

‘공부 히트맵’은 공간별 평균 평점과 리뷰 수로 지도 위에 열 분포를 그립니다 — 리뷰를 쓰면 바로 바뀌어요.

## 폴더 구성

```
index.html              화면 (웹 목록 + 3D 지도 + 상세 시트 + 제스처 HUD)
css/style.css           디자인 (필터별 CSS 변수)
js/app.js               state → load() → render() · 검색/필터/정렬 · 상세 · 리뷰 · 로그인 · 입력 라우팅
js/map3d.js             three.js 3D 지도 — GLB 로드, 필터 셰이더, 핀/라벨, 카메라 조작
js/gestures.js          브라우저 손 제스처 (MediaPipe Hand Landmarker)
js/td-bridge.js         TouchDesigner WebSocket 연결 (ws://localhost:9980)
js/filters.js           지도 디자인 필터 7종
js/vendor/three/        three.js r165 (MIT) — 빌드 도구 없이 importmap 으로 사용
seed/                   시드 JSON 3개 + 검사기 (node seed/check_seed.js)
data/geo.json           공간 좌표 · 네이버지도 링크 (시드 필드 이름은 그대로 두기 위해 따로 둠)
assets/map/sungshin_map.glb   Blender 가 만든 3D 지도 (Draco 압축)
images/                 Blender 렌더 — 히어로 이미지 · 공간 카드 사진
blender/build_map.py    OSM → Blender 3D 지도 → GLB · 썸네일 렌더 스크립트
blender/sungshin_map.blend
touchdesigner/          TouchDesigner 손 제스처 · 필터 네트워크
server/                 Express 서버 뼈대 (W6 과제용, 그대로 둠)
```

## 로컬에서 실행

```bash
node serve.js            # → http://localhost:8000
node seed/check_seed.js  # 시드 검사 (함정 3개 유지 확인)
```

## Blender 3D 지도 다시 만들기

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/build_map.py
```

- 입력: `blender/cache/osm.json` (Overpass API, © OpenStreetMap contributors, ODbL) · `data/geo.json`
- 건물 높이: `height` → `building:levels × 3.3m` → 용도·면적 기반 추정
- OSM에 건물이 비어 있는 골목 블록에는 작은 상가 건물을 절차적으로 채웁니다 (`Buildings_Fill`)
- 공간이 들어 있는 건물은 `Spot_<id>`, 핀은 `Pin_<id>`, 라벨 위치는 `Anchor_<id>` 로 이름을 붙여 웹에서 찾습니다

## TouchDesigner 연결

1. TouchDesigner(2023.11+)에서 `touchdesigner/gongbugak.tox` 를 네트워크로 끌어다 놓거나, Textport(`Alt+T`)에서
   `exec(open('<저장소 폴더>/touchdesigner/td_setup.py', encoding='utf-8').read())` 를 실행합니다
   (컴포넌트의 **프로젝트 폴더** 파라미터를 이 저장소 경로로 맞춰 주세요)
2. 손 추적용 MediaPipe 설치 (한 번만) — TD 파이썬(3.11)용 휠을 `touchdesigner/py_libs` 에 받습니다
   ```bash
   python3 -m pip install --target touchdesigner/py_libs --python-version 3.11 --only-binary=:all: --no-deps \
     --platform macosx_11_0_universal2 --platform macosx_11_0_arm64 \
     mediapipe==0.10.14 absl-py flatbuffers "protobuf>=4.25.3,<5" sounddevice cffi pycparser
   mkdir -p touchdesigner/models && curl -L -o touchdesigner/models/hand_landmarker.task \
     https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
   ```
   설치하지 않으면 프레임 차이로 좌우 손짓만 감지하는 **움직임 스와이프 모드**로 동작합니다
3. 카메라가 켜지고 `window` 컴포넌트로 필터 화면이 열립니다 — 손바닥을 좌우로 휙 넘기면 **TD 카메라 필터와 웹 지도 필터가 함께** 바뀝니다 (TD 창에서 `←` `→` 키도 가능)
4. 웹사이트 상단 **TD** 버튼(또는 `T`)을 누르면 `ws://localhost:9980` 으로 연결됩니다
   - Chrome 이 “로컬 네트워크 접근” 권한을 물으면 허용해 주세요
   - 다른 컴퓨터의 TD: `https://2023098-design.github.io/0925/?td=ws://<IP>:9980`
   - 연결 상태 확인: 브라우저에서 `http://localhost:9980` → `{"app":"gongbugak-td", …}`

| TD → 웹 메시지 | 동작 |
|---|---|
| `{"type":"cursor","x":0.4,"y":0.6}` | 손 커서 이동 |
| `{"type":"pinchstart"}` · `{"type":"pinchmove","dx":0.01,"dy":0}` · `{"type":"pinchend","moved":false}` | 클릭 · 끌기 |
| `{"type":"fist","dx":..,"dy":..}` · `{"type":"zoom","scale":1.05}` | 회전 · 줌 |
| `{"type":"filter","index":3,"dir":"right"}` | 지도 필터 변경 |
| `{"type":"hold","pose":"victory"}` · `{"type":"mode","mode":"map"}` · `{"type":"key","key":"Tab"}` | 모드 전환 · 키 입력 |

웹 → TD: `{"type":"filter","index":3}` (키보드·버튼으로 바꾼 필터를 TD 카메라 필터에 반영)


## 프로젝트 규칙 (시드)

- 시드 JSON 필드 이름은 바꾸지 않습니다 (`placeId` · `photo` · `tags` · `hours` · `nickname` …)
- 함정 3개 유지: 리뷰 0개 공간 2곳 · `photo: null` 1곳 · 탈퇴한 사용자(`nickname: null`)와 그 리뷰
- 리뷰 0개 공간의 평균은 `null` → “아직 리뷰가 없어요”, 정렬 시 맨 뒤

---

지도 데이터 © OpenStreetMap contributors (ODbL) · three.js (MIT) · MediaPipe (Apache-2.0) · 글꼴 Pretendard (OFL)
