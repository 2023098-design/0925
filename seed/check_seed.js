/**
 * 시드 데이터 검사 — 도메인으로 바꾼 뒤 구조와 함정이 살아 있는지 확인합니다.
 *
 *   node seed/check_seed.js            (프로젝트 루트에서)
 *   node check_seed.js                 (seed 폴더 안에서)
 *
 * 어디가 함정인지는 알려 주지 않습니다. 개수만 봅니다.
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const results = [];
const ok   = (msg) => results.push(['✅', msg]);
const fail = (msg) => results.push(['❌', msg]);
const warn = (msg) => results.push(['⚠️', msg]);   // 있으면 좋지만 제출에는 영향 없음

function load(name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) { fail(`${name} 파일이 없습니다`); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`${name} 이 올바른 JSON 이 아닙니다 — ${e.message.split('\n')[0]}`); return null; }
}

const SHAPE = {
  'places.json':  ['id', 'name', 'category', 'address', 'photo', 'tags', 'hours', 'createdAt'],
  'users.json':   ['id', 'nickname', 'email', 'joinedAt'],
  'reviews.json': ['id', 'placeId', 'userId', 'rating', 'content', 'tags', 'createdAt'],
};

function checkShape(name, rows) {
  if (!Array.isArray(rows)) { fail(`${name} 은 배열이어야 합니다`); return false; }
  const want = SHAPE[name];
  const bad = rows.findIndex(r => {
    const keys = Object.keys(r);
    return keys.length !== want.length || want.some(k => !(k in r));
  });
  if (bad >= 0) {
    const keys = Object.keys(rows[bad]);
    const extra = keys.filter(k => !want.includes(k));
    const missing = want.filter(k => !keys.includes(k));
    fail(`${name} ${bad + 1}번째 항목의 필드가 다릅니다` +
         (extra.length ? ` · 없어야 할 필드: ${extra.join(', ')}` : '') +
         (missing.length ? ` · 빠진 필드: ${missing.join(', ')}` : ''));
    return false;
  }
  const ids = rows.map(r => r.id);
  if (new Set(ids).size !== ids.length) { fail(`${name} 에 id 가 중복됩니다`); return false; }
  ok(`${name}  ${rows.length}개 · 필드 이름 정확`);
  return true;
}

const places  = load('places.json');
const users   = load('users.json');
const reviews = load('reviews.json');

const shapeOk = places && users && reviews &&
  [checkShape('places.json', places), checkShape('users.json', users), checkShape('reviews.json', reviews)].every(Boolean);

if (shapeOk) {
  const placeIds = new Set(places.map(p => p.id));
  const userIds  = new Set(users.map(u => u.id));
  const byPlace  = Object.fromEntries(places.map(p => [p.id, p]));

  // 개수
  if (places.length < 10) fail(`공간이 ${places.length}개 — 10개 이상이어야 합니다`);
  if (reviews.length < 20) fail(`리뷰가 ${reviews.length}개 — 20개 이상이어야 합니다`);
  if (users.length < 4) fail(`사용자가 ${users.length}명 — 4명 이상이어야 합니다`);

  // 참조
  const badPlaceRef = reviews.filter(r => !placeIds.has(r.placeId)).length;
  const badUserRef  = reviews.filter(r => !userIds.has(r.userId)).length;
  if (badPlaceRef || badUserRef) fail(`리뷰가 없는 공간/사용자를 가리킵니다 — placeId ${badPlaceRef}건 · userId ${badUserRef}건`);
  else ok('reviews.json  placeId · userId 모두 존재');

  // 타입
  const badRating = reviews.filter(r => !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5).length;
  if (badRating) fail(`rating 이 1~5 정수가 아닌 리뷰 ${badRating}건`);
  const badTags = [...places, ...reviews].filter(r => !Array.isArray(r.tags)).length;
  if (badTags) fail(`tags 가 배열이 아닌 항목 ${badTags}건`);
  const badRevTags = reviews.filter(r => Array.isArray(r.tags) && byPlace[r.placeId] &&
                                         r.tags.some(t => !byPlace[r.placeId].tags.includes(t))).length;
  if (badRevTags) fail(`리뷰의 tags 가 그 공간의 tags 에 없는 값을 씁니다 — ${badRevTags}건`);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  const badDate = [...places, ...users, ...reviews].filter(r => !isDate(r.createdAt || r.joinedAt)).length;
  if (badDate) fail(`날짜가 YYYY-MM-DD 형식이 아닌 항목 ${badDate}건`);
  const emptyContent = reviews.filter(r => typeof r.content !== 'string' || r.content.trim().length < 5).length;
  if (emptyContent) fail(`내용이 비었거나 너무 짧은 리뷰 ${emptyContent}건`);
  const dupContent = reviews.length - new Set(reviews.map(r => r.content)).size;
  if (dupContent) fail(`내용이 똑같은 리뷰 ${dupContent}건 — 서로 다르게 쓰세요`);
  if (!badRating && !badTags && !badRevTags && !badDate && !emptyContent && !dupContent) ok('타입 · 날짜 · 리뷰 내용 정상');

  // 함정 3개 — 어디인지는 말하지 않습니다 (리뷰 0개 · 사진 null · 탈퇴 사용자)
  const reviewed = new Set(reviews.map(r => r.placeId));
  const emptyPlaces = places.filter(p => !reviewed.has(p.id)).length;
  (emptyPlaces >= 2 ? ok : fail)(`리뷰가 0개인 공간: ${emptyPlaces}개` + (emptyPlaces >= 2 ? '' : ' (2개 이상이어야 합니다)'));

  const nullPhoto = places.filter(p => p.photo === null).length;
  (nullPhoto >= 1 ? ok : fail)(`사진(photo)이 null 인 공간: ${nullPhoto}개` + (nullPhoto >= 1 ? '' : ' (1개 이상이어야 합니다)'));

  const deleted = users.filter(u => u.nickname === null);
  const deletedIds = new Set(deleted.map(u => u.id));
  const deletedReviews = reviews.filter(r => deletedIds.has(r.userId)).length;
  (deleted.length >= 1 ? ok : fail)(`탈퇴한 사용자(nickname null): ${deleted.length}명` + (deleted.length >= 1 ? '' : ' (1명 이상이어야 합니다)'));
  (deletedReviews >= 1 ? ok : fail)(`탈퇴한 사용자가 쓴 리뷰: ${deletedReviews}건` + (deletedReviews >= 1 ? '' : ' (1건 이상이어야 합니다)'));

  // 있으면 좋은 것 2개 — 없어도 제출은 됩니다 (W9 · W10 에서 씁니다)
  const nullHours = places.filter(p => p.hours === null).length;
  (nullHours >= 1 ? ok : warn)(`운영시간(hours)이 null 인 공간: ${nullHours}개` + (nullHours >= 1 ? '' : ' — 없어도 되지만 W9 "정보 없음" 연습용으로 1곳 두면 좋습니다'));

  const avgs = places.map(p => {
    const rs = reviews.filter(r => r.placeId === p.id);
    return rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null;
  }).filter(a => a !== null);
  const low = avgs.filter(a => a < 2.5).length;
  (low >= 1 ? ok : warn)(`평균 평점 2.5 미만인 공간: ${low}개` + (low >= 1 ? '' : ' — 없어도 되지만 W10 정렬 확인용으로 1곳 두면 좋습니다'));
}

// 출력
console.log('');
for (const [mark, msg] of results) console.log(`${mark} ${msg}`);
const fails = results.filter(r => r[0] === '❌').length;
console.log('');
console.log(fails === 0 ? '모두 통과했습니다. 로컬 서버를 새로고침해서 화면을 확인하세요. (⚠️ 는 참고만)'
                        : `${fails}개 항목을 고쳐야 합니다. ❌ 줄을 그대로 AI 에게 보여 주세요. (⚠️ 는 참고만)`);
process.exit(fails === 0 ? 0 : 1);
