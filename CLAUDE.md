# 프로젝트 규칙 — 공부각 (캠퍼스 공간 리뷰)

AI 코딩 도구가 매번 읽는 규칙입니다. (`CLAUDE.md` · `AGENTS.md` · `GEMINI.md` 내용 동일)

## 프로젝트

- 성신여대 주변 **공부·작업 공간**(스터디카페 · 카페 · 디저트카페)에 대한 리뷰 서비스
- 화면: 웹 목록 · 상세 · 리뷰 작성 · 로그인 + **3D 지도 모드**(Blender GLB, three.js)
- 입력: 키보드 · 마우스 · 브라우저 손 제스처(MediaPipe) · TouchDesigner(WebSocket)

## 폴더 구조

```
index.html · css/ · js/     화면 (빌드 도구 없음, importmap 으로 three.js 사용)
seed/                       시드 JSON 3개 (places · reviews · users) + check_seed.js
data/geo.json               공간 좌표 · 네이버지도 링크
assets/map/                 Blender 가 만든 GLB
blender/                    3D 지도 빌드 스크립트
touchdesigner/              TD 손 제스처 · 필터 네트워크
server/                     Express + SQLite 서버 (W6 부터)
```

## 스택 · 스타일

- HTML + CSS + JavaScript (ES 모듈). 프레임워크 · 빌드 도구 · npm 패키지 추가 금지 (`server/` 예외, `js/vendor/` 는 복사해 둔 라이브러리)
- 들여쓰기 2칸 · camelCase · 주석은 한글 · `const` 우선, `var` 금지

## 절대 규칙

- 시드 JSON 의 **필드 이름을 바꾸지 말 것** — 좌표처럼 새 정보는 `data/` 에 따로 둘 것
- `app.js` 의 `state` · `load()` · `render()` · `statsOf` · `getVisible` · `stateOf` · `cardHTML` 구조 유지
- 리뷰가 0개인 공간의 평균 평점은 `0` 이 아니라 **`null`** → 화면에는 "아직 리뷰가 없어요", 정렬 시 맨 뒤
- `photo` · `hours` · `nickname` 은 `null` 일 수 있음. 화면에 `null` 이 찍히면 안 됨 (탈퇴한 사용자 → "탈퇴한 사용자")
- 시드의 함정(리뷰 0개 공간 · `photo` null · `nickname` null 사용자와 리뷰)을 유지할 것
- 지도 필터를 추가할 때는 `js/filters.js` 와 `touchdesigner/filters.glsl` 순서를 함께 맞출 것

## 작업 방식

- 한 번에 카드 하나만. 바꾼 뒤 무엇을 왜 바꿨는지 한 줄로 설명
- 확실하지 않으면 추측하지 말고 먼저 물어볼 것
