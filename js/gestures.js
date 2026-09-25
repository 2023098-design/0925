/* ────────────────────────────────────────────────────────────
   브라우저 손 제스처 — MediaPipe Hand Landmarker (웹캠)
   TouchDesigner 없이도 배포된 사이트에서 바로 손으로 조작할 수 있게 합니다.
   TouchDesigner(touchdesigner/)는 같은 이벤트를 WebSocket 으로 보냅니다 → js/td-bridge.js

   내보내는 이벤트 (app.js onInput 이 받음)
     cursor {x,y}            검지 끝 위치 (0~1, 화면 기준 · 거울 반전)
     pinchstart / pinchmove {dx,dy} / pinchend {moved}
     fist {dx,dy}            주먹 쥐고 이동
     zoom {scale}            양손 핀치 거리 변화
     swipe {dir}             손바닥 좌우로 휙 → 지도 필터 변경
     hold {pose}             ✌️ victory · 👍 thumbs 1초 유지
   ──────────────────────────────────────────────────────────── */
const MP_VER = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const TIP = [4, 8, 12, 16, 20];
const PIP = [3, 6, 10, 14, 18];
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 21개 랜드마크 → 손 모양
export function classify(lm) {
  const wrist = lm[0];
  const size = d2(wrist, lm[9]) || 1e-3;
  const ext = [1, 2, 3, 4].map((f) => d2(lm[TIP[f]], wrist) > d2(lm[PIP[f]], wrist) * 1.12);
  const thumbExt = d2(lm[4], lm[17]) > d2(lm[3], lm[17]) * 1.08 && d2(lm[4], lm[5]) > size * 0.55;
  const pinchD = d2(lm[4], lm[8]) / size;
  const nExt = ext.filter(Boolean).length;
  let pose = 'none';
  if (pinchD < 0.32) pose = 'pinch';
  else if (nExt === 0 && !thumbExt) pose = 'fist';
  else if (nExt === 0 && thumbExt && lm[4].y < wrist.y - size * 0.5 && lm[4].y < lm[5].y) pose = 'thumbs';
  else if (ext[0] && ext[1] && !ext[2] && !ext[3]) pose = 'victory';
  else if (nExt >= 4) pose = 'open';
  else if (ext[0] && !ext[1] && !ext[2] && !ext[3]) pose = 'point';
  const palm = { x: (lm[0].x + lm[5].x + lm[17].x) / 3, y: (lm[0].y + lm[5].y + lm[17].y) / 3 };
  return { pose, pinchD, size, palm, index: lm[8], thumb: lm[4] };
}

export const POSE_LABEL = {
  none: '✋ 손', open: '🖐 손바닥', point: '☝️ 가리키기', pinch: '🤏 핀치', fist: '✊ 주먹', victory: '✌️ 브이', thumbs: '👍 좋아요',
};

export class HandGestures {
  constructor({ video, canvas, onEvent, onStatus }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emit = onEvent;
    this.status = onStatus || (() => {});
    this.running = false;
    this.cur = { x: 0.5, y: 0.5 };
    this.pinching = false;
    this.pinchStart = null;
    this.pinchMoved = false;
    this.last = null;
    this.hist = [];
    this.swipeCool = 0;
    this.holdPose = null;
    this.holdSince = 0;
    this.holdFired = false;
    this.twoPinch = null;
  }

  async start() {
    if (!this.landmarker) {
      this.status('손 인식 모델 불러오는 중…');
      const vision = await import(`${MP_URL}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.5 });
      try { this.landmarker = await vision.HandLandmarker.createFromOptions(files, opts('GPU')); } catch { this.landmarker = await vision.HandLandmarker.createFromOptions(files, opts('CPU')); }
    }
    this.status('카메라 켜는 중…');
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;
    this.running = true;
    this.status('손을 보여주세요');
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.emit({ type: 'cursor', x: this.cur.x, y: this.cur.y, visible: false });
  }

  tick() {
    const v = this.video;
    if (v.readyState < 2) return;
    const now = performance.now();
    if (v.currentTime === this.lastTime) return;
    this.lastTime = v.currentTime;
    const res = this.landmarker.detectForVideo(v, now);
    const hands = (res.landmarks || []).map((lm) => lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }))); // 거울 반전
    this.draw(res.landmarks || []);
    this.handle(hands, now);
  }

  handle(hands, now) {
    if (!hands.length) {
      if (this.pinching) this.endPinch();
      this.emit({ type: 'cursor', x: this.cur.x, y: this.cur.y, visible: false });
      this.status('손을 보여주세요');
      this.hist = []; this.last = null; this.holdPose = null; this.twoPinch = null;
      return;
    }
    const cs = hands.map(classify);
    // 양손 핀치 → 줌
    if (cs.length === 2 && cs[0].pose === 'pinch' && cs[1].pose === 'pinch') {
      const dist = d2(cs[0].index, cs[1].index);
      if (this.twoPinch) {
        const scale = this.twoPinch / dist;
        if (Math.abs(scale - 1) > 0.004) this.emit({ type: 'zoom', scale: Math.max(0.9, Math.min(1.1, scale)) });
      }
      this.twoPinch = dist;
      if (this.pinching) { this.pinching = false; this.emit({ type: 'pinchend', moved: true }); }
      this.status('🤏🤏 확대 · 축소');
      return;
    }
    this.twoPinch = null;
    const c = cs[0];
    this.status(POSE_LABEL[c.pose] || '✋');
    this.emit({ type: 'pose', pose: c.pose });

    // 커서 — 가운데 70% 영역을 화면 전체로 넓혀서 팔을 덜 움직여도 되게
    const src = c.pose === 'pinch' ? { x: (c.index.x + c.thumb.x) / 2, y: (c.index.y + c.thumb.y) / 2 } : c.index;
    const tx = Math.min(1, Math.max(0, (src.x - 0.15) / 0.7));
    const ty = Math.min(1, Math.max(0, (src.y - 0.12) / 0.66));
    const a = c.pose === 'pinch' || c.pose === 'fist' ? 0.5 : 0.35;
    const prev = { ...this.cur };
    this.cur.x += (tx - this.cur.x) * a;
    this.cur.y += (ty - this.cur.y) * a;
    const dx = this.cur.x - prev.x;
    const dy = this.cur.y - prev.y;
    this.emit({ type: 'cursor', x: this.cur.x, y: this.cur.y, visible: true });

    // 핀치 (히스테리시스: 0.32 에서 잡고 0.45 에서 놓음)
    if (!this.pinching && c.pose === 'pinch') {
      this.pinching = true; this.pinchMoved = false; this.pinchStart = { ...this.cur, t: now };
      this.emit({ type: 'pinchstart' });
    } else if (this.pinching) {
      if (c.pinchD > 0.45) this.endPinch();
      else {
        if (Math.hypot(this.cur.x - this.pinchStart.x, this.cur.y - this.pinchStart.y) > 0.025) this.pinchMoved = true;
        if (this.pinchMoved) this.emit({ type: 'pinchmove', dx, dy });
      }
    }

    // 주먹 → 회전
    if (c.pose === 'fist' && this.last?.pose === 'fist') this.emit({ type: 'fist', dx, dy });

    // 손바닥 스와이프 → 필터 변경
    if (c.pose === 'open' || c.pose === 'point') {
      this.hist.push({ t: now, x: c.palm.x, y: c.palm.y });
      this.hist = this.hist.filter((h) => now - h.t < 320);
      const h0 = this.hist[0];
      const ddx = c.palm.x - h0.x;
      const ddy = c.palm.y - h0.y;
      if (now > this.swipeCool && this.hist.length >= 4 && Math.abs(ddx) > 0.2 && Math.abs(ddy) < Math.abs(ddx) * 0.6) {
        const dir = ddx > 0 ? 'right' : 'left';
        this.emit({ type: 'swipe', dir });
        this.status(dir === 'right' ? '👉 다음 필터' : '👈 이전 필터');
        this.swipeCool = now + 900;
        this.hist = [];
      }
    } else this.hist = [];

    // ✌️ · 👍 1초 유지
    if (c.pose === 'victory' || c.pose === 'thumbs') {
      if (this.holdPose !== c.pose) { this.holdPose = c.pose; this.holdSince = now; this.holdFired = false; }
      else if (!this.holdFired && now - this.holdSince > 900) { this.holdFired = true; this.emit({ type: 'hold', pose: c.pose }); }
    } else this.holdPose = null;

    this.last = c;
  }

  endPinch() {
    this.pinching = false;
    this.emit({ type: 'pinchend', moved: this.pinchMoved });
  }

  draw(raw) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7b61ff';
    for (const lm of raw) {
      ctx.lineWidth = 4; ctx.strokeStyle = accent; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [a, b] of LINKS) { ctx.moveTo(lm[a].x * canvas.width, lm[a].y * canvas.height); ctx.lineTo(lm[b].x * canvas.width, lm[b].y * canvas.height); }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}
