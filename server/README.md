# 서버 뼈대 — W6에서 완성합니다

「캠퍼스 공간 리뷰」의 백엔드입니다. **W5에서 만든 내 EC2 인스턴스 위에서** 돌립니다.

## 파일

| 파일 | 무엇 |
|---|---|
| `server.js` | Express 서버 · API 7개 + **로그인 세션** (**TODO 2곳**) |
| `seed.js` | `../seed/*.json` 을 SQLite 에 넣기 |
| `package.json` | 필요한 라이브러리 목록 |
| `.env.example` | 키 파일의 본보기 — 복사해서 `.env` 로 만드세요 (`GEMINI_API_KEY` · `SESSION_SECRET`) |
| `.gitignore` | **`.env` · `app.db` · `*.pem` 은 깃에 올리지 않습니다** |

## 처음 한 번

```bash
npm install          # 라이브러리 설치
cp .env.example .env # 키 파일 만들고 값 채우기
node seed.js         # 시드 데이터를 DB에 넣기
node server.js       # 서버 켜기
```

브라우저에서 `http://<내 EC2 퍼블릭 IP>:3000/api/places` 로 확인합니다.

## 계속 켜 두기 (W6 후반)

```bash
npm install -g pm2
pm2 start server.js --name isc
pm2 status
pm2 logs isc
```

`node server.js` 로 켜면 **SSH 창을 닫는 순간 서버가 꺼집니다.** `pm2` 는 그것을 막아 줍니다.

## 화면 파일은 어디에?

`server/public/` 폴더를 만들고 그 안에 `index.html` 을 넣으세요.
`express.static` 이 그 폴더를 그대로 웹에 내보냅니다.

```
server/
├── server.js
├── seed.js
└── public/
    ├── index.html      ← ../index.html 을 여기로
    └── 상세.html
```

화면 코드는 `fetch('/api/places')` 로 **내 서버**에서 데이터를 받습니다.
JSON 파일을 직접 읽던 것을 이걸로 바꾸는 것이 W6의 작업입니다.

## API 목록

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/api/places` | 목록 + **평균 평점·리뷰 수** (리뷰 0개면 `avg: null`) |
| GET | `/api/places/:id` | 상세 + 그 공간의 리뷰들 (없는 id면 404) |
| POST | `/api/reviews` | 리뷰 작성 — **로그인 필요** |
| POST | `/api/summary` | AI 한 줄 요약 (M7) |
| GET | `/api/me` | 지금 로그인한 사람 |
| POST | `/api/login` | 로그인 — `{ userId }` |
| POST | `/api/logout` | 로그아웃 |

## 로그인 (M10) — 이미 들어 있습니다

간이 방식이 **완성된 채로** 들어 있습니다. 화면에서 이렇게 부르면 됩니다.

```js
await fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 3 }),
});

const { user } = await (await fetch('/api/me')).json();
// user 가 null 이면 로그아웃 상태 → 리뷰 작성 버튼을 잠그세요
```

**이것만으로 M10 은 됩니다.** 비밀번호나 소셜 로그인은 나머지를 다 끝낸 뒤 여유가 되면 하세요.

> ⚠ **`userId` 를 브라우저에서 받지 않습니다.**
> `POST /api/reviews` 는 `req.session.userId` 를 씁니다. 브라우저가 보낸 값을 믿으면
> **남의 이름으로 리뷰를 쓸 수 있습니다.** 이게 W12에서 배우는 핵심입니다.

## 두 개의 TODO

| TODO | 어디 | 무엇 |
|---|---|---|
| ① | `POST /api/reviews` | 유효성 검사 — 평점 1~5 · 내용 비어 있지 않음 · 존재하는 공간 |
| ② | `POST /api/summary` | Gemini 호출 (**W7에서 합니다**) |

## 반드시 지킬 것

- **API 키와 `SESSION_SECRET` 은 `.env` 에만.** 코드에 직접 적거나 깃에 올리지 마세요.
- **`app.db` 는 깃에 없습니다.** 인스턴스가 날아가면 데이터도 같이 사라집니다.
  발표 전에는 `scp` 로 내 노트북에 한 벌 내려받아 두세요.
- **로그에 키와 비밀번호를 찍지 마세요.** `console.error(e.message)` 까지만.
