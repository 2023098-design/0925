/* ────────────────────────────────────────────────────────────
   공부각 — 앱 본체
   구조는 과제 뼈대(W03_spec_kit)의 state → load() → render() 흐름을 그대로 따릅니다.
     statsOf / withStats : 평균 평점 · 리뷰 수 (리뷰 0개 → avg null)
     getVisible          : 검색 · 태그 · 분류 · 정렬 (원본 state.places 는 건드리지 않음)
     stateOf             : 'loading' | 'error' | 'empty' | 'list'
     cardHTML            : 카드 한 장 (photo null → 회색 일러스트 박스)
   ──────────────────────────────────────────────────────────── */
import { FILTERS, applyWebFilter } from './filters.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};

let state = {
  loading: true,
  error: null,
  places: [],
  reviews: [],
  users: [],
  geo: null,
  keyword: '',
  onlyQuiet: false,
  openNow: false,
  favOnly: false,
  category: '전체',
  tags: [],
  sortBy: 'rating',
  mode: 'web',
  filter: LS.get('gbk_filter', 0),
  selectedId: null,
  writing: false,
  user: LS.get('gbk_user', null),
  favs: LS.get('gbk_favs', []),
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAT = {
  '스터디카페': { c: '#7b61ff', e: '📚' },
  '카페': { c: '#ff6f91', e: '☕' },
  '디저트카페': { c: '#ffb347', e: '🍧' },
};
const catOf = (p) => CAT[p.category] || { c: '#8a8aa0', e: '📍' };

/* ── 데이터 불러오기 ─────────────────────────────────────── */
async function load() {
  state.loading = true;
  state.error = null;
  render();
  try {
    const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); });
    const [places, reviews, users, geo] = await Promise.all([
      get('./seed/places.json'), get('./seed/reviews.json'), get('./seed/users.json'), get('./data/geo.json'),
    ]);
    state.places = places;
    state.users = users;
    state.geo = geo;
    // 이 브라우저에서 쓴 리뷰를 시드 리뷰 뒤에 붙입니다
    state.reviews = [...reviews, ...LS.get('gbk_reviews', [])];
    withStats();
  } catch (e) {
    state.error = e.message;
  } finally {
    state.loading = false;
    render();
    renderStats();
    renderPick();
    if (map) map.updateData(state.places, state.geo, statsMap);
    route();
  }
}

/* ── 평균 평점 · 리뷰 수 ───────────────────────────────────
   목록을 그릴 때마다 리뷰 전체를 훑지 않도록 한 번에 미리 계산해 둡니다 (W11). */
let statsMap = new Map();
function withStats() {
  statsMap = new Map(state.places.map((p) => [p.id, { count: 0, sum: 0, avg: null, dist: [0, 0, 0, 0, 0] }]));
  for (const r of state.reviews) {
    const s = statsMap.get(r.placeId);
    if (!s) continue;
    s.count += 1;
    s.sum += r.rating;
    s.dist[r.rating - 1] += 1;
  }
  for (const s of statsMap.values()) s.avg = s.count ? Math.round((s.sum / s.count) * 10) / 10 : null;
}
function statsOf(place) {
  return statsMap.get(place.id) || { count: 0, avg: null, dist: [0, 0, 0, 0, 0] };
}

/* ── 운영시간 ────────────────────────────────────────────── */
function openInfo(hours) {
  if (!hours) return { known: false, open: false, label: '운영시간 정보 없음' };
  const m = hours.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return { known: false, open: false, label: hours };
  const a = +m[1] * 60 + +m[2];
  const b = +m[3] * 60 + +m[4];
  if (a === 0 && b === 24 * 60) return { known: true, open: true, label: '24시간 운영' };
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();
  const open = b > a ? t >= a && t < b : t >= a || t < b;
  return { known: true, open, label: `${hours}` };
}

/* ── 보여줄 목록 계산 ────────────────────────────────────── */
function getVisible() {
  const keyword = state.keyword.trim().toLowerCase();
  const list = state.places.filter((place) => {
    if (keyword && !place.name.toLowerCase().includes(keyword)) return false;
    if (state.onlyQuiet && !place.tags.includes('조용함')) return false;
    if (state.category !== '전체' && place.category !== state.category) return false;
    if (state.tags.length && !state.tags.every((t) => place.tags.includes(t))) return false;
    if (state.openNow && !openInfo(place.hours).open) return false;
    if (state.favOnly && !state.favs.includes(place.id)) return false;
    return true;
  });
  const by = {
    // 평점이 null(리뷰 없음)인 공간은 항상 맨 뒤
    rating: (a, b) => nullLast(statsOf(a).avg, statsOf(b).avg) || statsOf(b).count - statsOf(a).count || a.name.localeCompare(b.name, 'ko'),
    count: (a, b) => statsOf(b).count - statsOf(a).count || nullLast(statsOf(a).avg, statsOf(b).avg) || a.name.localeCompare(b.name, 'ko'),
    name: (a, b) => a.name.localeCompare(b.name, 'ko'),
  }[state.sortBy];
  return [...list].sort(by);
}
function nullLast(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/* ── 화면 상태 판별 ─────────────────────────────────────── */
function stateOf(visible) {
  if (state.loading) return 'loading';
  if (state.error) return 'error';
  if (visible.length === 0) return 'empty';
  return 'list';
}

/* ── 카드 한 장 ─────────────────────────────────────────── */
function photoHTML(place, cls = '') {
  if (!place.photo) return `<div class="noimg ${cls}"><span>${catOf(place).e}</span>사진 준비 중</div>`;
  return `<img src="${esc(place.photo)}" alt="${esc(place.name)} 주변 3D 맵 렌더" loading="lazy" onerror="this.outerHTML='<div class=&quot;noimg&quot;><span>📷</span>사진을 불러오지 못했어요</div>'">`;
}
function ratingHTML(avg, count) {
  if (avg === null) return '<span class="rating none">아직 리뷰가 없어요</span>';
  return `<span class="rating"><span class="star">★</span>${avg.toFixed(1)}</span>`;
}
function cardHTML(place, i = 0) {
  const { count, avg } = statsOf(place);
  const cat = catOf(place);
  const oi = openInfo(place.hours);
  const fav = state.favs.includes(place.id);
  return `
    <li class="card" tabindex="0" data-id="${place.id}" style="--i:${i}" aria-label="${esc(place.name)} 상세 보기">
      <div class="thumb">
        ${photoHTML(place)}
        <span class="badge" style="--c:${cat.c}"><i></i>${esc(place.category)}</span>
        <span class="open-pill ${oi.open ? 'on' : ''}">${oi.known ? (oi.open ? (oi.label === '24시간 운영' ? '24시간' : '영업 중') : '영업 종료') : '시간 정보 없음'}</span>
        <button class="fav" data-fav="${place.id}" aria-pressed="${fav}" aria-label="${fav ? '저장 해제' : '저장하기'}">${fav ? '♥' : '♡'}</button>
      </div>
      <div class="body">
        <p class="name">${esc(place.name)}</p>
        <p class="addr">${esc(place.address.replace('서울 성북구 ', ''))}</p>
        <div class="tags">${place.tags.map((t) => `<span class="tag ${state.tags.includes(t) ? 'hit' : ''}">${esc(t)}</span>`).join('')}</div>
        <div class="meta">${ratingHTML(avg, count)}<span class="rcount">리뷰 ${count}개</span></div>
      </div>
    </li>`;
}

/* ── 그리기 ─────────────────────────────────────────────── */
function render() {
  const visible = getVisible();
  const view = stateOf(visible);

  if (view === 'loading') {
    app.innerHTML = `<ul class="grid" aria-busy="true">${Array.from({ length: 6 }, () => '<li class="skel"><div class="a"></div><div class="b"></div><div class="c"></div></li>').join('')}</ul>`;
    return;
  }
  if (view === 'error') {
    app.innerHTML = `<div class="state"><span class="big">🌧</span>
        <strong>공간을 불러오지 못했어요</strong>
        잠시 후 다시 시도해 주세요
        <div style="margin-top:12px"><button class="btn sm primary" id="retry">다시 시도</button></div>
      </div>`;
    $('#retry').onclick = () => load();
    return;
  }
  if (view === 'empty') {
    const filtered = state.places.length > 0;
    app.innerHTML = filtered
      ? `<div class="state"><span class="big">🔍</span><strong>조건에 맞는 공간이 없어요</strong>검색어나 필터를 바꿔 보세요
           <div style="margin-top:12px"><button class="btn sm" id="clearAll">필터 모두 지우기</button></div></div>`
      : `<div class="state"><span class="big">🪑</span><strong>등록된 공간이 없습니다</strong></div>`;
    const c = $('#clearAll');
    if (c) c.onclick = clearFilters;
    syncMapDim(visible);
    return;
  }

  const activeTags = state.tags.map((t) => `<button data-untag="${esc(t)}" aria-label="${esc(t)} 해제">${esc(t)} ✕</button>`).join('');
  app.innerHTML =
    `<div class="count">전체 <b>${state.places.length}</b>개 중 <b>${visible.length}</b>개 표시 <span class="active-tags">${activeTags}</span></div>
     <ul class="grid">${visible.map(cardHTML).join('')}</ul>`;
  syncMapDim(visible);
}

function renderStats() {
  const el = $('#heroStats');
  if (state.loading || state.error) { el.innerHTML = ''; return; }
  const rated = [...statsMap.values()].filter((s) => s.avg !== null);
  const avg = rated.length ? rated.reduce((a, s) => a + s.sum, 0) / rated.reduce((a, s) => a + s.count, 0) : null;
  const openCount = state.places.filter((p) => openInfo(p.hours).open).length;
  el.innerHTML = `
    <div class="stat"><b>${state.places.length}곳</b><span>추천 공간</span></div>
    <div class="stat"><b>${state.reviews.length}개</b><span>리뷰</span></div>
    <div class="stat"><b>★ ${avg ? avg.toFixed(1) : '-'}</b><span>평균 평점</span></div>
    <div class="stat"><b>${openCount}곳</b><span>지금 영업 중</span></div>`;
}

function renderPick() {
  const el = $('#pick');
  if (!state.places.length) { el.hidden = true; return; }
  const h = new Date().getHours();
  const pool = state.places.filter((p) => openInfo(p.hours).open && (statsOf(p).avg ?? 0) >= 4);
  const list = pool.length ? pool : state.places;
  const p = list[(new Date().getDate() + h) % list.length];
  const s = statsOf(p);
  const why = h >= 22 || h < 6 ? '늦은 밤에도 열려 있는' : h < 12 ? '아침 공부 시작하기 좋은' : '오후 공강에 들르기 좋은';
  el.hidden = false;
  el.innerHTML = `<span class="ico">${catOf(p).e}</span>
    <p><strong>오늘의 공부각 · ${esc(p.name)}</strong><br>${why} ${esc(p.category)} · ${s.avg ? `★ ${s.avg.toFixed(1)} · 리뷰 ${s.count}개` : '첫 리뷰를 남겨 주세요'}</p>
    <button class="btn sm" data-open="${p.id}">자세히 보기</button>`;
}

/* ── 태그 · 분류 컨트롤 ─────────────────────────────────── */
function buildControls() {
  const cats = ['전체', ...new Set(state.places.map((p) => p.category))];
  $('#catSeg').innerHTML = cats.map((c) => `<button type="button" data-cat="${esc(c)}" aria-pressed="${state.category === c}">${c === '전체' ? '전체' : `${CAT[c]?.e || ''} ${esc(c)}`}</button>`).join('');
  const tags = [...new Set(state.places.flatMap((p) => p.tags))];
  $('#tagPick').innerHTML = tags.map((t) => `<label><input type="checkbox" value="${esc(t)}" ${state.tags.includes(t) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('');
  syncTagCount();
}
function syncTagCount() {
  const n = $('#tagN');
  n.textContent = state.tags.length;
  n.classList.toggle('on', state.tags.length > 0);
  $$('#tagPick input').forEach((i) => { i.checked = state.tags.includes(i.value); });
}
function clearFilters() {
  state.keyword = ''; state.tags = []; state.onlyQuiet = false; state.openNow = false; state.favOnly = false; state.category = '전체';
  $('#search').value = ''; $('#quiet').checked = false; $('#openNow').checked = false; $('#favOnly').checked = false;
  $$('#catSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cat === '전체'));
  syncTagCount();
  render();
}

/* ── 상세 시트 ───────────────────────────────────────────── */
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
function userName(userId) {
  const u = state.users.find((x) => x.id === userId);
  if (u) return u.nickname; // 탈퇴한 사용자는 null
  const mine = LS.get('gbk_localUsers', {})[userId];
  return mine ?? null;
}
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

function openPlace(id, { push = true } = {}) {
  const place = state.places.find((p) => p.id === id);
  if (!place) { toast('없는 공간이에요'); return; }
  state.selectedId = id;
  renderSheet();
  sheet.classList.add('on');
  sheet.setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('on');
  if (push) {
    const h = `${state.mode === 'map' ? '#/map' : '#'}/place/${id}`;
    if (location.hash !== h) history.pushState(null, '', h);
  }
  if (map && state.mode === 'map') map.select(id, true);
  $$('.map-list li').forEach((li) => li.classList.toggle('sel', +li.dataset.id === id));
  setTimeout(() => $('#sheetClose').focus({ preventScroll: true }), 50);
}
function closeSheet({ push = true } = {}) {
  if (!sheet.classList.contains('on')) return;
  sheet.classList.remove('on');
  sheet.setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('on');
  state.writing = false;
  const id = state.selectedId;
  state.selectedId = null;
  if (map) map.clearSelection();
  $$('.map-list li').forEach((li) => li.classList.remove('sel'));
  if (push) history.pushState(null, '', state.mode === 'map' ? '#/map' : '#/');
  const card = id && $(`.card[data-id="${id}"]`);
  if (card && state.mode === 'web') card.focus({ preventScroll: true });
}

function renderSheet() {
  const place = state.places.find((p) => p.id === state.selectedId);
  if (!place) return;
  const s = statsOf(place);
  const g = state.geo?.places.find((x) => x.id === place.id) || {};
  const oi = openInfo(place.hours);
  const reviews = state.reviews.filter((r) => r.placeId === place.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  const max = Math.max(1, ...s.dist);
  const cat = catOf(place);
  const fav = state.favs.includes(place.id);
  sheetBody.innerHTML = `
    <div class="cover">${photoHTML(place)}<span class="badge" style="--c:${cat.c}"><i></i>${esc(place.category)}</span></div>
    <div class="inner">
      <h2>${esc(place.name)}</h2>
      <div class="tags">${place.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="score">
        <div class="num">${s.avg === null ? '–' : s.avg.toFixed(1)}<small>${s.avg === null ? '평점 없음' : `리뷰 ${s.count}개`}</small></div>
        <div class="bars">${[5, 4, 3, 2, 1].map((n) => `<div><b>${n}</b><span><i style="width:${(s.dist[n - 1] / max) * 100}%"></i></span><em>${s.dist[n - 1]}</em></div>`).join('')}</div>
      </div>
      <div class="info-rows">
        <div><span>📍</span><span>${esc(place.address)}${g.floor ? '' : ''}</span><button class="copy" data-copy="${esc(place.address)}">복사</button></div>
        <div><span>🕒</span><span class="${oi.known ? '' : 'muted'}">${esc(oi.label)} ${oi.known ? (oi.open ? '· <b style="color:#1db36b">영업 중</b>' : '· 영업 종료') : ''}</span><span></span></div>
        ${g.floor ? `<div><span>🏢</span><span>${esc(g.floor)}</span><span></span></div>` : ''}
      </div>
      <div class="actions">
        <button class="btn" data-fly="${place.id}">🧊 3D 지도에서 보기</button>
        ${g.naver ? `<a class="btn" href="${esc(g.naver)}" target="_blank" rel="noopener">🗺 네이버지도</a>` : '<span></span>'}
        <button class="btn" data-fav="${place.id}" aria-pressed="${fav}">${fav ? '♥ 저장됨' : '♡ 저장하기'}</button>
        <button class="btn primary" data-write="${place.id}">✍️ 리뷰 쓰기</button>
      </div>
      ${state.writing ? writeHTML(place) : ''}
      <div class="reviews-head"><h3>리뷰 ${reviews.length}</h3><span class="note">기본 리뷰는 시연용 예시예요</span></div>
      ${reviews.length ? reviews.map(reviewHTML).join('') : '<div class="state" style="padding:36px 16px;margin:0"><span class="big">📝</span><strong>아직 작성된 리뷰가 없습니다</strong>첫 번째 리뷰를 남겨 주세요</div>'}
    </div>`;
  const ta = $('#reviewText', sheetBody);
  if (ta) ta.focus({ preventScroll: false });
}
function reviewHTML(r) {
  const name = userName(r.userId);
  const gone = name === null || name === undefined;
  const mine = typeof r.userId === 'string';
  return `<article class="review">
    <header>
      <span class="avatar ${gone ? 'gone' : ''}">${gone ? '?' : esc(name.slice(0, 1))}</span>
      <div><div class="who ${gone ? 'gone' : ''}">${gone ? '탈퇴한 사용자' : esc(name)}${mine ? '<span class="mine">내 리뷰</span>' : '<span class="sample">예시</span>'}</div><div class="when">${esc(r.createdAt)}</div></div>
      <span class="stars" aria-label="${r.rating}점">${stars(r.rating)}</span>
    </header>
    <p>${esc(r.content)}</p>
    ${r.tags.length ? `<div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  </article>`;
}
function writeHTML(place) {
  return `<form class="write" id="writeForm">
    <h4>${esc(state.user?.nickname)}님의 리뷰</h4>
    <div class="starpick" role="radiogroup" aria-label="평점">
      ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="st${n}" value="${n}"><label for="st${n}" title="${n}점">★</label>`).join('')}
    </div>
    <textarea id="reviewText" placeholder="콘센트, 소음, 좌석, 머물기 좋은 시간대 등을 알려 주세요 (5자 이상)" maxlength="400"></textarea>
    <div class="tagpick" style="margin-top:10px">${place.tags.map((t) => `<label><input type="checkbox" name="rtag" value="${esc(t)}"><span>${esc(t)}</span></label>`).join('')}</div>
    <div class="row"><span class="err" id="writeErr"></span><span style="display:flex;gap:6px"><button type="button" class="btn sm" id="writeCancel">취소</button><button class="btn sm primary">등록</button></span></div>
  </form>`;
}
function submitReview(form) {
  const rating = +(form.querySelector('input[name=rating]:checked')?.value || 0);
  const content = form.querySelector('#reviewText').value.trim();
  const tags = [...form.querySelectorAll('input[name=rtag]:checked')].map((i) => i.value);
  const err = form.querySelector('#writeErr');
  if (!rating) { err.textContent = '별점을 골라 주세요'; return; }
  if (content.length < 5) { err.textContent = '내용을 5자 이상 적어 주세요'; return; }
  const mine = LS.get('gbk_reviews', []);
  const r = { id: Date.now(), placeId: state.selectedId, userId: state.user.id, rating, content, tags, createdAt: new Date().toISOString().slice(0, 10) };
  mine.push(r);
  LS.set('gbk_reviews', mine);
  state.reviews.push(r);
  withStats();
  state.writing = false;
  renderSheet(); render(); renderStats();
  if (map) map.updateData(state.places, state.geo, statsMap);
  toast('리뷰가 등록됐어요 ✨');
}

/* ── 로그인 ─────────────────────────────────────────────── */
function syncLogin() {
  $('#btnLogin').textContent = state.user ? `👤 ${state.user.nickname}` : '로그인';
}
function openLogin(after) {
  const dlg = $('#loginDlg');
  if (state.user) {
    if (confirmLogout()) { state.user = null; LS.set('gbk_user', null); syncLogin(); toast('로그아웃했어요'); }
    return;
  }
  $('#nickInput').value = '';
  dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    const nick = $('#nickInput').value.trim().slice(0, 12);
    if (nick.length < 2) return;
    const id = `local-${Date.now().toString(36)}`;
    state.user = { id, nickname: nick };
    LS.set('gbk_user', state.user);
    const lu = LS.get('gbk_localUsers', {}); lu[id] = nick; LS.set('gbk_localUsers', lu);
    syncLogin();
    toast(`반가워요, ${nick}님!`);
    if (after) after();
  };
}
function confirmLogout() {
  // 브라우저 confirm 대신 한 번 더 누르면 로그아웃
  const b = $('#btnLogin');
  if (b.dataset.arm) { delete b.dataset.arm; return true; }
  b.dataset.arm = '1'; b.textContent = '한 번 더 누르면 로그아웃';
  setTimeout(() => { delete b.dataset.arm; syncLogin(); }, 2500);
  return false;
}

/* ── 저장(♥) ─────────────────────────────────────────────── */
function toggleFav(id) {
  const i = state.favs.indexOf(id);
  if (i >= 0) state.favs.splice(i, 1); else state.favs.push(id);
  LS.set('gbk_favs', state.favs);
  toast(i >= 0 ? '저장을 해제했어요' : '♥ 저장했어요');
  render();
  if (state.selectedId === id) renderSheet();
}

/* ── 웹 ↔ 3D 모드 ────────────────────────────────────────── */
let map = null;
let mapLoading = null;
async function ensureMap() {
  if (map) return map;
  if (mapLoading) return mapLoading;
  mapLoading = (async () => {
    const { Map3D } = await import('./map3d.js');
    const m = new Map3D($('#map3d'), {
      onSelect: (id) => (id ? openPlace(id) : closeSheet()),
      onHover: (id) => $$('.map-list li').forEach((li) => li.classList.toggle('hand-hover', +li.dataset.id === id)),
      onProgress: (p, msg) => { $('#loaderBar').style.width = `${Math.round(p * 100)}%`; if (msg) $('#loaderMsg').textContent = msg; },
    });
    await m.init(state.places, state.geo, statsMap, state.filter);
    $('#mapLoader').classList.add('done');
    map = m;
    if (m.filter !== state.filter) m.setFilter(state.filter, false);
    m.setActive(state.mode === 'map');
    return m;
  })().catch((e) => {
    console.error(e);
    $('#loaderMsg').textContent = `3D 지도를 불러오지 못했어요 (${e.message}). 새로고침해 주세요.`;
    mapLoading = null;
  });
  return mapLoading;
}
async function setMode(mode, { push = true } = {}) {
  if (mode === state.mode) return;
  state.mode = mode;
  document.body.classList.toggle('mode-map', mode === 'map');
  document.body.classList.toggle('mode-web', mode === 'web');
  $$('.mode-toggle button').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === mode));
  if (push) {
    const sel = state.selectedId ? `/place/${state.selectedId}` : '';
    history.pushState(null, '', mode === 'map' ? `#/map${sel}` : `#${sel || '/'}`);
  }
  sendTD({ type: 'state', mode });
  if (mode === 'map') {
    renderMapList();
    const m = await ensureMap();
    if (!m) return;
    m.setActive(true);
    if (state.selectedId) m.select(state.selectedId, true);
    if (!LS.get('gbk_mapIntro', false)) { LS.set('gbk_mapIntro', true); toast('←↑↓→ 이동 · Q/E 회전 · F 필터 · ✋ 손 제스처도 돼요'); }
  } else if (map) {
    map.setActive(false);
  }
}

function renderMapList() {
  const kw = ($('#mapSearch').value || '').trim().toLowerCase();
  const list = state.places.filter((p) => !kw || p.name.toLowerCase().includes(kw));
  $('#mapCount').textContent = `${list.length}곳`;
  $('#mapList').innerHTML = list.map((p) => {
    const s = statsOf(p);
    return `<li data-id="${p.id}" class="${state.selectedId === p.id ? 'sel' : ''}" style="--c:${catOf(p).c}" tabindex="0">
      <span class="n">${catOf(p).e}</span><span><b>${esc(p.name)}</b><small>${esc(p.category)} · 리뷰 ${s.count}</small></span>
      <span class="r">${s.avg === null ? '<small>–</small>' : `<span style="color:#ffb400">★</span>${s.avg.toFixed(1)}`}</span></li>`;
  }).join('');
  if (map) map.setDim(kw ? list.map((p) => p.id) : null);
}
function syncMapDim(visible) {
  if (map && state.mode === 'web') map.setDim(visible.length === state.places.length ? null : visible.map((p) => p.id));
}

/* ── 지도 디자인 필터 ─────────────────────────────────────── */
function buildFilterDock() {
  $('#filterDock').innerHTML = `<button class="arrow" data-fstep="-1" aria-label="이전 필터">‹</button>` +
    FILTERS.map((f, i) => `<button data-filter="${i}" aria-pressed="${i === state.filter}" title="${f.name}"><span class="e">${f.emoji}</span><span class="t">${f.name}</span></button>`).join('') +
    `<button class="arrow" data-fstep="1" aria-label="다음 필터">›</button>`;
}
function setFilter(i, { dir = 1, source = 'ui', silent = false } = {}) {
  const n = FILTERS.length;
  i = ((i % n) + n) % n;
  if (i === state.filter && source !== 'init') return;
  state.filter = i;
  LS.set('gbk_filter', i);
  const f = FILTERS[i];
  if (source !== 'init') {
    const w = $('#wipe');
    w.style.background = f.web.accent;
    w.style.setProperty('--x', dir > 0 ? '100%' : '0%');
    w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
    setTimeout(() => applyWebFilter(i), 180);
  } else applyWebFilter(i);
  $('#filterName').textContent = f.name;
  $$('#filterDock button[data-filter]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.filter === i));
  if (map) map.setFilter(i, source !== 'init');
  if (!silent && source !== 'init') pop(f.emoji, `${f.name}${source === 'gesture' ? ' · 스와이프' : source === 'td' ? ' · TouchDesigner' : ''}`);
  if (source !== 'td') sendTD({ type: 'filter', index: i, key: f.key, name: f.name });
}

/* ── 알림 ─────────────────────────────────────────────── */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2200);
}
let popT;
function pop(emoji, text) {
  const p = $('#gesturePop');
  $('.e', p).textContent = emoji;
  $('.t', p).textContent = text;
  p.classList.add('on');
  clearTimeout(popT);
  popT = setTimeout(() => p.classList.remove('on'), 1300);
}

/* ── 뽀모도로 ─────────────────────────────────────────── */
const pomo = { left: 25 * 60, running: false, t: null, phase: 'focus' };
function pomoTick() {
  pomo.left -= 1;
  if (pomo.left <= 0) {
    pomo.phase = pomo.phase === 'focus' ? 'break' : 'focus';
    pomo.left = (pomo.phase === 'focus' ? 25 : 5) * 60;
    toast(pomo.phase === 'focus' ? '🍅 다시 집중할 시간!' : '☕ 5분 쉬어 가요');
  }
  drawPomo();
}
function drawPomo() {
  const m = String(Math.floor(pomo.left / 60)).padStart(2, '0');
  const s = String(pomo.left % 60).padStart(2, '0');
  $('#pomoTime').textContent = `${pomo.phase === 'break' ? '☕' : ''}${m}:${s}`;
  $('#btnPomo').classList.toggle('running', pomo.running);
}
function togglePomo() {
  pomo.running = !pomo.running;
  clearInterval(pomo.t);
  if (pomo.running) pomo.t = setInterval(pomoTick, 1000);
  drawPomo();
  toast(pomo.running ? '🍅 25분 집중 시작' : '⏸ 일시정지');
}

/* ── 손 제스처 / TouchDesigner 입력 → 화면 조작 ──────────── */
let gestures = null;
async function toggleCamera() {
  const btn = $('#btnCam');
  if (gestures?.running) {
    gestures.stop();
    btn.setAttribute('aria-pressed', 'false');
    $('#hud').classList.remove('on');
    document.body.classList.remove('gesture-on');
    cursor.classList.remove('on');
    return;
  }
  btn.setAttribute('aria-pressed', 'true');
  $('#hud').classList.add('on');
  document.body.classList.add('gesture-on');
  $('#hudPose').textContent = '카메라 준비 중…';
  try {
    const { HandGestures } = await import('./gestures.js');
    gestures = gestures || new HandGestures({ video: $('#camVideo'), canvas: $('#camCanvas'), onEvent: onInput, onStatus: (s) => { $('#hudPose').textContent = s; } });
    await gestures.start();
    toast('✋ 손 제스처 켜짐 — 손바닥을 좌우로 휙 넘기면 필터가 바뀌어요');
  } catch (e) {
    console.error(e);
    $('#hudPose').textContent = '카메라를 켤 수 없어요';
    toast(`카메라를 켤 수 없어요: ${e.message}`);
    btn.setAttribute('aria-pressed', 'false');
    setTimeout(() => { $('#hud').classList.remove('on'); document.body.classList.remove('gesture-on'); }, 2500);
  }
}

let td = null;
async function toggleTD() {
  const btn = $('#btnTD');
  if (td?.enabled) { td.disconnect(); btn.setAttribute('aria-pressed', 'false'); return; }
  const { TDBridge } = await import('./td-bridge.js');
  const url = new URLSearchParams(location.search).get('td') || 'ws://localhost:9980';
  td = td || new TDBridge(url, {
    onEvent: (e) => onInput({ ...e, source: 'td' }),
    onStatus: (on) => {
      $('#tdDot').classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(td.enabled));
      if (on) { toast('🎛 TouchDesigner 연결됨'); sendTD({ type: 'hello', mode: state.mode, filter: state.filter, filters: FILTERS.map((f) => f.name) }); }
    },
  });
  td.connect();
  btn.setAttribute('aria-pressed', 'true');
  toast(`TouchDesigner 연결 시도 중… (${url})`);
}
function sendTD(msg) { if (td?.open) td.send(msg); }

const cursor = $('#handCursor');
const hover = { el: null, x: 0, y: 0 };
function hoverTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  return el.closest('.card, .map-list li, button, a, .pin-label, input, select, label, .hero-visual') || el;
}
function onInput(e) {
  const W = innerWidth, H = innerHeight;
  switch (e.type) {
    case 'cursor': {
      hover.x = e.x * W; hover.y = e.y * H;
      cursor.style.transform = `translate(${hover.x}px, ${hover.y}px)`;
      cursor.classList.toggle('on', e.visible !== false);
      const t = hoverTarget(hover.x, hover.y);
      if (t !== hover.el) {
        hover.el?.classList?.remove('hand-hover');
        hover.el = t;
        if (t && (t.matches('.card, .map-list li'))) t.classList.add('hand-hover');
      }
      if (map && state.mode === 'map' && t?.tagName === 'CANVAS') map.hoverAt(hover.x, hover.y);
      break;
    }
    case 'pinchstart': cursor.classList.add('pinch'); break;
    case 'pinchmove':
      if (state.mode === 'map' && hover.el?.tagName === 'CANVAS' || state.mode === 'map' && !hover.el?.closest('.map-side, .sheet')) map?.panScreen(e.dx, e.dy);
      else {
        const sc = hover.el?.closest('.sheet-scroll, .map-list');
        if (sc) sc.scrollBy(0, -e.dy * H * 1.4); else window.scrollBy(0, -e.dy * H * 1.4);
      }
      break;
    case 'pinchend':
      cursor.classList.remove('pinch');
      if (!e.moved) {
        const t = hoverTarget(hover.x, hover.y);
        if (state.mode === 'map' && (!t || t.tagName === 'CANVAS')) map?.clickAt(hover.x, hover.y);
        else if (t) { t.focus?.({ preventScroll: true }); t.click(); }
      }
      break;
    case 'fist':
      cursor.classList.add('fist');
      clearTimeout(onInput.ft); onInput.ft = setTimeout(() => cursor.classList.remove('fist'), 200);
      if (state.mode === 'map') map?.rotateBy(e.dx * Math.PI * 1.2, e.dy * 1.2);
      break;
    case 'zoom':
      if (state.mode === 'map') map?.zoomBy(e.scale);
      break;
    case 'swipe':
      setFilter(state.filter + (e.dir === 'right' ? 1 : -1), { dir: e.dir === 'right' ? 1 : -1, source: e.source === 'td' ? 'td' : 'gesture' });
      break;
    case 'filter':
      if (typeof e.index === 'number') setFilter(e.index, { source: 'td', dir: e.dir === 'left' ? -1 : 1 });
      break;
    case 'hold':
      if (e.pose === 'victory') { pop('✌️', state.mode === 'web' ? '3D 지도로' : '웹으로'); setMode(state.mode === 'web' ? 'map' : 'web'); }
      if (e.pose === 'thumbs') {
        if (state.mode === 'map' && map) { const id = map.next(1); if (id) openPlace(id); pop('👍', '다음 공간'); } else { pop('👍', '좋아요!'); }
      }
      break;
    case 'mode':
      setMode(e.mode === 'map' ? 'map' : 'web');
      break;
    case 'key':
      // TouchDesigner 가 키 입력을 흉내 낼 때 — { type:'key', key:'ArrowLeft' }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true }));
      break;
    case 'pose':
      if (e.source === 'td') $('#hudSrc').textContent = 'TouchDesigner';
      break;
    default: break;
  }
}

/* ── 키보드 ─────────────────────────────────────────────── */
const held = new Set();
function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;
  if (e.key === 'Escape') {
    if (typing) { e.target.blur(); return; }
    if ($('#tagDD').classList.contains('open')) { $('#tagDD').classList.remove('open'); return; }
    if (sheet.classList.contains('on')) { closeSheet(); return; }
    if (map?.touring) { map.stopTour(); $('#btnTour').setAttribute('aria-pressed', 'false'); }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'm' || k === 'M') { setMode(state.mode === 'web' ? 'map' : 'web'); return; }
  if (k === 'f' || k === 'F') { setFilter(state.filter + (e.shiftKey ? -1 : 1), { dir: e.shiftKey ? -1 : 1, source: 'key' }); return; }
  if (k === 'c' || k === 'C') { toggleCamera(); return; }
  if (k === 't' || k === 'T') { toggleTD(); return; }
  if (k === 'p' || k === 'P') { togglePomo(); return; }
  if (k === '?') { $('#helpDlg').showModal(); return; }
  if (k === '/') { e.preventDefault(); (state.mode === 'map' ? $('#mapSearch') : $('#search')).focus(); if (state.mode === 'web') $('#list').scrollIntoView({ behavior: 'smooth' }); return; }

  if (state.mode === 'web') {
    const cards = $$('.card');
    const idx = cards.indexOf(document.activeElement);
    if (['ArrowRight', 'ArrowDown', 'j', 'J'].includes(k) && cards.length && !sheet.classList.contains('on')) {
      if (idx >= 0 || ['j', 'J'].includes(k)) { e.preventDefault(); cards[Math.min(cards.length - 1, idx + 1)].focus(); }
    } else if (['ArrowLeft', 'ArrowUp', 'k', 'K'].includes(k) && cards.length && !sheet.classList.contains('on')) {
      if (idx >= 0 || ['k', 'K'].includes(k)) { e.preventDefault(); cards[Math.max(0, idx - 1)].focus(); }
    } else if (k === 'Enter' && idx >= 0) {
      openPlace(+cards[idx].dataset.id);
    }
    return;
  }
  // 3D 지도
  if (!map) return;
  const movement = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'e', 'Q', 'E', 'z', 'x', 'Z', 'X', '+', '-', '=', 'PageUp', 'PageDown'];
  if (movement.includes(k)) { e.preventDefault(); held.add(k.length === 1 ? k.toLowerCase() : k); map.stopTour(); $('#btnTour').setAttribute('aria-pressed', 'false'); return; }
  if (k === 'Tab') { e.preventDefault(); const id = map.next(e.shiftKey ? -1 : 1); if (id) openPlace(id); return; }
  if (k === 'Enter') { const id = map.selectedId || map.hoverId; if (id) openPlace(id); return; }
  if (k === ' ') { e.preventDefault(); toggleTour(); return; }
  if (k === 'h' || k === 'H' || k === 'r' || k === 'R' || k === 'Home') { map.reset(); return; }
}
function keyLoop() {
  if (map && state.mode === 'map' && held.size) {
    const sp = 1;
    let px = 0, pz = 0, rot = 0, zoom = 1, tilt = 0;
    if (held.has('ArrowUp') || held.has('w')) pz -= sp;
    if (held.has('ArrowDown') || held.has('s')) pz += sp;
    if (held.has('ArrowLeft') || held.has('a')) px -= sp;
    if (held.has('ArrowRight') || held.has('d')) px += sp;
    if (held.has('q')) rot += 0.025;
    if (held.has('e')) rot -= 0.025;
    if (held.has('z') || held.has('+') || held.has('=')) zoom *= 0.975;
    if (held.has('x') || held.has('-')) zoom *= 1.025;
    if (held.has('PageUp')) tilt -= 0.015;
    if (held.has('PageDown')) tilt += 0.015;
    map.keyMove(px, pz, rot, zoom, tilt);
  }
  requestAnimationFrame(keyLoop);
}
function toggleTour() {
  if (!map) return;
  const on = map.toggleTour((id) => { if (id) openPlace(id); });
  $('#btnTour').setAttribute('aria-pressed', String(on));
  toast(on ? '▶ 자동 투어 시작 — Space 로 멈춰요' : '⏸ 투어 정지');
  if (!on) closeSheet();
}

/* ── 라우팅 ─────────────────────────────────────────────── */
function route() {
  const h = location.hash || '#/';
  const isMap = h.startsWith('#/map');
  const m = h.match(/place\/(\d+)/);
  setMode(isMap ? 'map' : 'web', { push: false });
  if (m && !state.loading && !state.error) openPlace(+m[1], { push: false });
  else closeSheet({ push: false });
}

/* ── 이벤트 연결 ─────────────────────────────────────────── */
function bind() {
  $('#search').addEventListener('input', (e) => { state.keyword = e.target.value; render(); });
  $('#quiet').addEventListener('change', (e) => { state.onlyQuiet = e.target.checked; render(); });
  $('#openNow').addEventListener('change', (e) => { state.openNow = e.target.checked; render(); });
  $('#favOnly').addEventListener('change', (e) => { state.favOnly = e.target.checked; render(); });
  $('#sort').addEventListener('change', (e) => { state.sortBy = e.target.value; render(); });
  $('#catSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    state.category = b.dataset.cat;
    $$('#catSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    render();
  });
  const dd = $('#tagDD');
  $('button', dd).addEventListener('click', () => { dd.classList.toggle('open'); $('button', dd).setAttribute('aria-expanded', dd.classList.contains('open')); });
  document.addEventListener('click', (e) => { if (!dd.contains(e.target)) dd.classList.remove('open'); });
  $('#tagPick').addEventListener('change', () => { state.tags = $$('#tagPick input:checked').map((i) => i.value); syncTagCount(); render(); });
  $('#tagReset').addEventListener('click', () => { state.tags = []; syncTagCount(); render(); });

  document.addEventListener('click', (e) => {
    const t = e.target;
    const fav = t.closest('[data-fav]');
    if (fav) { e.stopPropagation(); toggleFav(+fav.dataset.fav); return; }
    const untag = t.closest('[data-untag]');
    if (untag) { state.tags = state.tags.filter((x) => x !== untag.dataset.untag); syncTagCount(); render(); return; }
    const card = t.closest('.card');
    if (card) { openPlace(+card.dataset.id); return; }
    const open = t.closest('[data-open]');
    if (open) { openPlace(+open.dataset.open); return; }
    const go = t.closest('[data-go]');
    if (go) { setMode(go.dataset.go); return; }
    const li = t.closest('.map-list li');
    if (li) { openPlace(+li.dataset.id); return; }
    const fly = t.closest('[data-fly]');
    if (fly) { const id = +fly.dataset.fly; setMode('map').then(() => openPlace(id)); return; }
    const write = t.closest('[data-write]');
    if (write) {
      const doIt = () => { state.writing = true; renderSheet(); };
      if (!state.user) openLogin(doIt); else doIt();
      return;
    }
    if (t.closest('#writeCancel')) { state.writing = false; renderSheet(); return; }
    const copy = t.closest('[data-copy]');
    if (copy) { navigator.clipboard?.writeText(copy.dataset.copy).then(() => toast('주소를 복사했어요'), () => toast(copy.dataset.copy)); return; }
    const fi = t.closest('[data-filter]');
    if (fi && fi.closest('#filterDock')) { const i = +fi.dataset.filter; setFilter(i, { dir: i > state.filter ? 1 : -1 }); return; }
    const fs = t.closest('[data-fstep]');
    if (fs) { const d = +fs.dataset.fstep; setFilter(state.filter + d, { dir: d }); return; }
    if (t.closest('[data-open-help]')) { $('#helpDlg').showModal(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.map-list li, .hero-visual')) e.target.click();
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'writeForm') { e.preventDefault(); submitReview(e.target); }
  });
  $$('.mode-toggle button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#btnFilter').addEventListener('click', () => setFilter(state.filter + 1));
  $('#btnCam').addEventListener('click', toggleCamera);
  $('#btnTD').addEventListener('click', toggleTD);
  $('#btnLogin').addEventListener('click', () => openLogin());
  $('#btnPomo').addEventListener('click', togglePomo);
  $('#sheetClose').addEventListener('click', () => closeSheet());
  $('#scrim').addEventListener('click', () => closeSheet());
  $('#mapSearch').addEventListener('input', renderMapList);
  $('#sideToggle').addEventListener('click', () => {
    const s = $('#mapSide'); s.classList.toggle('collapsed');
    $('#sideToggle').textContent = s.classList.contains('collapsed') ? '⟩' : '⟨';
  });
  $('#btnTour').addEventListener('click', toggleTour);
  $('#btnReset').addEventListener('click', () => map?.reset());
  $('#btnZoomIn').addEventListener('click', () => map?.zoomBy(0.75));
  $('#btnZoomOut').addEventListener('click', () => map?.zoomBy(1.33));
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', (e) => { held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
  addEventListener('blur', () => held.clear());
  addEventListener('popstate', route);
  addEventListener('hashchange', route);
}

/* ── 시작 ─────────────────────────────────────────────── */
bind();
setFilter(state.filter, { source: 'init' });
buildFilterDock();
syncLogin();
drawPomo();
requestAnimationFrame(keyLoop);
load().then(() => { buildControls(); renderMapList(); });
if (new URLSearchParams(location.search).has('td')) toggleTD();

// 디버그 · 터치디자이너 없이 제스처 흉내: window.gbk.input({type:'swipe',dir:'right'})
window.gbk = { input: onInput, setFilter: (i) => setFilter(i), setMode, get state() { return state; } };
