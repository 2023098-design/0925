// ─────────────────────────────────────────────────────────────
// 「캠퍼스 공간 리뷰」 서버 뼈대 — W6에서 이 파일을 완성합니다
//
//   실행:  node server.js
//   접속:  http://<내 EC2 퍼블릭 IP>:3000
//
//   TODO 가 붙은 곳이 여러분이 채울 자리입니다.
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));   // 화면 파일들

// ── 로그인 세션 ────────────────────────────────────────────
// 브라우저에는 세션 번호만 주고, "그 번호가 누구인지"는 서버가 기억합니다.
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
}));

// ── DB 열기 ────────────────────────────────────────────────
// 파일이 없으면 자동으로 만들어집니다. 이 파일이 곧 우리 데이터베이스입니다.
const db = new Database(path.join(__dirname, 'app.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS places (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    category TEXT,
    address  TEXT,
    photo    TEXT,            -- 없을 수 있습니다 (NULL)
    tags     TEXT,            -- JSON 문자열로 저장합니다
    hours    TEXT,            -- 없을 수 있습니다 (NULL)
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id        INTEGER PRIMARY KEY,
    placeId   INTEGER NOT NULL,
    userId    INTEGER NOT NULL,
    rating    INTEGER NOT NULL,
    content   TEXT,
    tags      TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY,
    nickname TEXT,             -- 탈퇴한 사용자는 NULL 입니다
    email    TEXT,
    joinedAt TEXT
  );
`);

// ── 로그인 (M10) ───────────────────────────────────────────
// 간이 방식입니다. 사용자를 골라 세션에 넣습니다. 이것만으로 M10 충족입니다.
//
// 비밀번호를 직접 받고 싶다면 users 테이블에 passwordHash 칸을 만들고
// bcrypt 로 해시해서 비교하세요. 절대 평문으로 저장하지 마세요. (W12)

// GET /api/me  →  지금 로그인한 사람이 누구인가
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, nickname FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user });
});

// POST /api/login   { userId }
app.post('/api/login', (req, res) => {
  const user = db.prepare('SELECT id, nickname FROM users WHERE id = ?').get(req.body.userId);
  if (!user) return res.status(401).json({ error: '없는 사용자입니다' });

  req.session.userId = user.id;      // ← 서버가 기억합니다
  res.json({ user });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// 로그인해야 지나갈 수 있는 문
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다' });
  next();
}

// ── 목록 API ───────────────────────────────────────────────
// GET /api/places  →  공간 목록 + 평균 평점 + 리뷰 수
app.get('/api/places', (req, res) => {
  const places = db.prepare('SELECT * FROM places').all();

  const result = places.map((p) => {
    const rows = db.prepare('SELECT rating FROM reviews WHERE placeId = ?').all(p.id);

    // ⚠ 리뷰가 0개면 avg 는 null 입니다. 0 이 아닙니다.
    //   "평점이 0점" 과 "아직 평가가 없음" 은 완전히 다른 뜻입니다.
    const avg = rows.length === 0
      ? null
      : Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10;

    return { ...p, tags: JSON.parse(p.tags || '[]'), avg, count: rows.length };
  });

  res.json(result);
});

// ── 상세 API ───────────────────────────────────────────────
// GET /api/places/:id  →  공간 하나 + 그 공간의 리뷰들
app.get('/api/places/:id', (req, res) => {
  const place = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id);

  // 없는 id 로 들어올 수 있습니다. 404 를 돌려주지 않으면 화면이 조용히 깨집니다.
  if (!place) return res.status(404).json({ error: 'not found' });

  const reviews = db.prepare('SELECT * FROM reviews WHERE placeId = ?').all(place.id);
  res.json({ ...place, tags: JSON.parse(place.tags || '[]'), reviews });
});

// ── 리뷰 작성 API ──────────────────────────────────────────
// POST /api/reviews
app.post('/api/reviews', requireLogin, (req, res) => {
  const { placeId, rating, content } = req.body;

  // ⚠ userId 는 req.body 에서 받지 않습니다. 세션에서 꺼냅니다.
  //   브라우저가 보낸 값을 그대로 믿으면 남의 이름으로 리뷰를 쓸 수 있습니다.
  const userId = req.session.userId;

  // TODO ① 유효성 검사
  //   - rating 이 1~5 사이 정수인가
  //   - content 가 비어 있지 않은가
  //   - placeId 가 실제로 존재하는 공간인가
  //   통과 못 하면  res.status(400).json({ error: '...' })

  const stmt = db.prepare(`
    INSERT INTO reviews (placeId, userId, rating, content, tags, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(placeId, userId, rating, content, '[]', new Date().toISOString().slice(0, 10));

  res.json({ id: info.lastInsertRowid });
});

// ── AI 리뷰 요약 (M9) ──────────────────────────────────────
// POST /api/summary   { placeId }
//
// ⚠ 키는 반드시 서버에만 둡니다. 브라우저에서 직접 부르면 키가 그대로 노출됩니다.
app.post('/api/summary', async (req, res) => {
  const rows = db.prepare('SELECT content FROM reviews WHERE placeId = ?').all(req.body.placeId);

  // 리뷰가 없으면 AI 를 부르지 않습니다 — 돈이 나가는 호출입니다.
  if (rows.length === 0) return res.json({ summary: null });

  const prompt = '다음 리뷰들을 한 문장으로 요약해줘:\n' + rows.map((r) => r.content).join('\n');

  try {
    // TODO ② Gemini 호출
    //   const KEY = process.env.GEMINI_API_KEY;
    //   const r = await fetch('https://.../models/gemini:generateContent', {
    //     method: 'POST',
    //     headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    //   });
    //   const data = await r.json();
    //   const summary = data.candidates[0].content.parts[0].text;
    //   res.json({ summary });

    res.json({ summary: null });   // ← 위를 완성하면 이 줄은 지웁니다
  } catch (e) {
    // AI 가 실패해도 화면 전체가 멈추면 안 됩니다.
    console.error('summary failed:', e.message);   // 키는 절대 찍지 마세요
    res.status(502).json({ error: 'summary failed' });
  }
});

app.listen(PORT, () => {
  console.log(`서버가 ${PORT} 번 포트에서 돌고 있습니다`);
});
