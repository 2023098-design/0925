// 시드 JSON 을 DB에 넣습니다.  실행:  node seed.js
// 이미 들어 있는 데이터는 지우고 다시 넣습니다.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, 'app.db'));
const seedDir = path.join(__dirname, '..', 'seed');
const read = (f) => JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));

db.exec(`
  CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT, address TEXT,
    photo TEXT, tags TEXT, hours TEXT, createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY, placeId INTEGER NOT NULL, userId INTEGER NOT NULL,
    rating INTEGER NOT NULL, content TEXT, tags TEXT, createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, nickname TEXT, email TEXT, joinedAt TEXT
  );
  DELETE FROM places;
  DELETE FROM reviews;
  DELETE FROM users;
`);

const insPlace = db.prepare(`
  INSERT INTO places (id, name, category, address, photo, tags, hours, createdAt)
  VALUES (@id, @name, @category, @address, @photo, @tags, @hours, @createdAt)
`);
const insReview = db.prepare(`
  INSERT INTO reviews (id, placeId, userId, rating, content, tags, createdAt)
  VALUES (@id, @placeId, @userId, @rating, @content, @tags, @createdAt)
`);
const insUser = db.prepare(`
  INSERT INTO users (id, nickname, email, joinedAt)
  VALUES (@id, @nickname, @email, @joinedAt)
`);

// SQLite 에는 배열 타입이 없습니다. JSON 문자열로 바꿔 넣습니다.
db.transaction(() => {
  for (const p of read('places.json'))  insPlace.run({ ...p, tags: JSON.stringify(p.tags ?? []) });
  for (const r of read('reviews.json')) insReview.run({ ...r, tags: JSON.stringify(r.tags ?? []) });
  for (const u of read('users.json'))   insUser.run(u);      // 로그인(M10)에 씁니다
})();

console.log('places :', db.prepare('SELECT COUNT(*) n FROM places').get().n);
console.log('reviews:', db.prepare('SELECT COUNT(*) n FROM reviews').get().n);
console.log('users  :', db.prepare('SELECT COUNT(*) n FROM users').get().n);
