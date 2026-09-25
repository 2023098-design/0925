# ─────────────────────────────────────────────────────────────
# 공부각 × TouchDesigner — 손 제스처 엔진
#
#   카메라(Video Device In TOP) → MediaPipe 손 랜드마크 → 제스처 판정
#   → ① TD 안의 카메라 필터(GLSL TOP) 전환  ② WebSocket 으로 웹사이트 조작
#
#   TD 네트워크 : /project1/gongbugak   (touchdesigner/td_setup.py 가 만듭니다)
#     engine        Text DAT  ← 이 파일 (파일과 동기화)
#     frame_exec    Execute DAT  onFrameStart → engine.update()
#     ws            Web Server DAT (포트 9980) + ws_callbacks
#     filter_glsl   GLSL TOP  (uFilter / uPrev / uMix / uTime)
#
#   MediaPipe 가 없으면 '움직임 스와이프' 모드로 동작합니다 (프레임 차이로 좌우 손짓 감지).
# ─────────────────────────────────────────────────────────────
import json
import math
import os
import sys
import threading
import time

FILTER_NAMES = ['파스텔 데이', '미드나잇 네온', '블루프린트', '페이퍼 스케치', '골든아워', '공부 히트맵', '클레이 토이']
POSE_LABEL = {'none': '손', 'open': '손바닥', 'point': '가리키기', 'pinch': '핀치', 'fist': '주먹',
              'victory': '브이', 'thumbs': '좋아요'}
TIP = [4, 8, 12, 16, 20]
PIP = [3, 6, 10, 14, 18]

COMP = parent()                      # /project1/gongbugak
ROOT = COMP.par.Projectroot.eval() if hasattr(COMP.par, 'Projectroot') else ''
LIB = os.path.join(ROOT, 'touchdesigner', 'py_libs')
MODEL = os.path.join(ROOT, 'touchdesigner', 'models', 'hand_landmarker.task')
if os.path.isdir(LIB) and LIB not in sys.path:
    sys.path.insert(0, LIB)


def d2(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def classify(lm):
    """21개 랜드마크(x,y 0~1, 거울 반전 후) → 손 모양"""
    wrist = lm[0]
    size = d2(wrist, lm[9]) or 1e-3
    ext = [d2(lm[TIP[f]], wrist) > d2(lm[PIP[f]], wrist) * 1.12 for f in (1, 2, 3, 4)]
    thumb_ext = d2(lm[4], lm[17]) > d2(lm[3], lm[17]) * 1.08 and d2(lm[4], lm[5]) > size * 0.55
    pinch = d2(lm[4], lm[8]) / size
    n = sum(ext)
    pose = 'none'
    if pinch < 0.32:
        pose = 'pinch'
    elif n == 0 and not thumb_ext:
        pose = 'fist'
    elif n == 0 and thumb_ext and lm[4][1] < wrist[1] - size * 0.5 and lm[4][1] < lm[5][1]:
        pose = 'thumbs'
    elif ext[0] and ext[1] and not ext[2] and not ext[3]:
        pose = 'victory'
    elif n >= 4:
        pose = 'open'
    elif ext[0] and not any(ext[1:]):
        pose = 'point'
    palm = ((lm[0][0] + lm[5][0] + lm[17][0]) / 3, (lm[0][1] + lm[5][1] + lm[17][1]) / 3)
    return {'pose': pose, 'pinch': pinch, 'size': size, 'palm': palm, 'index': lm[8], 'thumb': lm[4]}


class Tracker:
    """MediaPipe 손 추적을 별도 스레드에서 돌립니다 (TD 메인 스레드가 멈추지 않도록)"""

    def __init__(self):
        self.ok = False
        self.error = ''
        self.frame = None
        self.result = []
        self.lock = threading.Lock()
        self.running = False
        try:
            import numpy  # noqa
            import types
            # mediapipe 가 불러오는 matplotlib(그리기 전용)은 TD 에 없어도 되도록 가짜 모듈로 대신합니다
            if 'matplotlib' not in sys.modules:
                try:
                    import matplotlib  # noqa
                except Exception:
                    fake = types.ModuleType('matplotlib')
                    fake.pyplot = types.ModuleType('matplotlib.pyplot')
                    sys.modules['matplotlib'] = fake
                    sys.modules['matplotlib.pyplot'] = fake.pyplot
            from mediapipe.tasks.python import vision, BaseOptions
            import mediapipe as mp
            self.mp = mp
            opts = vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=MODEL),
                running_mode=vision.RunningMode.VIDEO, num_hands=2,
                min_hand_detection_confidence=0.6, min_hand_presence_confidence=0.55, min_tracking_confidence=0.5)
            self.landmarker = vision.HandLandmarker.create_from_options(opts)
            self.ok = True
        except Exception as e:  # mediapipe 없음 → 움직임 모드
            self.error = str(e)[:160]

    def start(self):
        if not self.ok or self.running:
            return
        self.running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def stop(self):
        self.running = False

    def push(self, rgb):
        with self.lock:
            self.frame = rgb

    def _loop(self):
        t0 = time.time()
        while self.running:
            with self.lock:
                f, self.frame = self.frame, None
            if f is None:
                time.sleep(0.004)
                continue
            try:
                img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=f)
                res = self.landmarker.detect_for_video(img, int((time.time() - t0) * 1000))
                hands = [[(1 - p.x, p.y) for p in lm] for lm in (res.hand_landmarks or [])]  # 거울 반전
                with self.lock:
                    self.result = hands
            except Exception as e:
                self.error = str(e)[:160]


class Engine:
    def __init__(self):
        self.clients = set()
        self.filter = 0
        self.prev = 0
        self.mix = 1.0
        self.cur = [0.5, 0.5]
        self.pinching = False
        self.pinch_start = None
        self.pinch_moved = False
        self.last_pose = None
        self.hist = []
        self.cool = 0
        self.hold_pose = None
        self.hold_since = 0
        self.hold_fired = False
        self.two = None
        self.label = ''
        self.mode = 'web'
        self.motion_prev = None
        self.motion_hist = []
        self.tracker = Tracker()
        self.tracker.start()
        self.status('MediaPipe 손 추적' if self.tracker.ok else '움직임 스와이프 모드 (MediaPipe 없음)')

    # ── WebSocket ─────────────────────────────────────────
    def send(self, obj):
        ws = op('ws')
        txt = json.dumps(obj, ensure_ascii=False)
        for c in list(self.clients):
            try:
                ws.webSocketSendText(c, txt)
            except Exception:
                self.clients.discard(c)

    def on_open(self, client):
        self.clients.add(client)
        self.send({'type': 'hello', 'from': 'touchdesigner', 'filter': self.filter, 'tracking': 'mediapipe' if self.tracker.ok else 'motion'})
        self.status(f'웹 연결됨 ({len(self.clients)})')

    def on_close(self, client):
        self.clients.discard(client)
        self.status(f'웹 연결 {len(self.clients)}')

    def on_message(self, text):
        try:
            m = json.loads(text)
        except Exception:
            return
        t = m.get('type')
        if t in ('filter', 'hello') and isinstance(m.get('index', m.get('filter')), int):
            self.set_filter(m.get('index', m.get('filter')), echo=False)
        if m.get('mode'):
            self.mode = m['mode']

    # ── 필터 ──────────────────────────────────────────────
    def set_filter(self, i, echo=True, direction='right'):
        i %= len(FILTER_NAMES)
        if i == self.filter:
            return
        self.prev, self.filter, self.mix = self.filter, i, 0.0
        if echo:
            self.send({'type': 'filter', 'index': i, 'dir': direction, 'via': 'swipe'})
        self.status('스와이프로 필터 전환' if echo else '웹에서 필터 변경')

    def step_filter(self, d):
        self.set_filter(self.filter + d, echo=True, direction='right' if d > 0 else 'left')

    def status(self, s):
        self.label = s
        t = op('hud_text')
        if t is not None:
            t.par.text = f'공부각 × TouchDesigner   |   필터 {self.filter + 1}/7 · {FILTER_NAMES[self.filter]}   |   {s}   |   웹 연결 {len(self.clients)}   |   손바닥 좌우 스와이프 = 필터'

    # ── 매 프레임 ─────────────────────────────────────────
    def update(self):
        now = time.time()
        g = op('filter_glsl')
        if self.mix < 1:
            self.mix = min(1.0, self.mix + 1 / 18)
        if g is not None:
            g.par.value0x = self.filter
            g.par.value1x = self.prev
            g.par.value2x = self.mix
            g.par.value3x = absTime.seconds
        small = op('small')
        if small is None:
            return
        arr = small.numpyArray(delayed=True)
        if arr is None:
            return
        if self.tracker.ok:
            import numpy as np
            rgb = (np.flipud(arr[:, :, :3]) * 255).astype(np.uint8)
            self.tracker.push(np.ascontiguousarray(rgb))
            with self.tracker.lock:
                hands = list(self.tracker.result)
            self.handle(hands, now)
            self.draw(hands)
        else:
            self.motion(arr, now)

    def handle(self, hands, now):
        if not hands:
            if self.pinching:
                self.end_pinch()
            if self.last_pose is not None:
                self.send({'type': 'cursor', 'x': self.cur[0], 'y': self.cur[1], 'visible': False})
            self.last_pose = None
            self.hist = []
            self.hold_pose = None
            self.two = None
            return
        cs = [classify(h) for h in hands]
        if len(cs) == 2 and cs[0]['pose'] == 'pinch' and cs[1]['pose'] == 'pinch':
            dist = d2(cs[0]['index'], cs[1]['index'])
            if self.two:
                sc = max(0.9, min(1.1, self.two / max(dist, 1e-3)))
                if abs(sc - 1) > 0.004:
                    self.send({'type': 'zoom', 'scale': sc})
            self.two = dist
            return
        self.two = None
        c = cs[0]
        if c['pose'] != self.last_pose:
            self.send({'type': 'pose', 'pose': c['pose'], 'label': POSE_LABEL.get(c['pose'], '')})
        src = c['index'] if c['pose'] != 'pinch' else ((c['index'][0] + c['thumb'][0]) / 2, (c['index'][1] + c['thumb'][1]) / 2)
        tx = min(1, max(0, (src[0] - 0.15) / 0.7))
        ty = min(1, max(0, (src[1] - 0.12) / 0.66))
        a = 0.5 if c['pose'] in ('pinch', 'fist') else 0.35
        px, py = self.cur
        self.cur = [px + (tx - px) * a, py + (ty - py) * a]
        dx, dy = self.cur[0] - px, self.cur[1] - py
        self.send({'type': 'cursor', 'x': round(self.cur[0], 4), 'y': round(self.cur[1], 4), 'visible': True})

        if not self.pinching and c['pose'] == 'pinch':
            self.pinching, self.pinch_moved, self.pinch_start = True, False, list(self.cur)
            self.send({'type': 'pinchstart'})
        elif self.pinching:
            if c['pinch'] > 0.45:
                self.end_pinch()
            else:
                if math.hypot(self.cur[0] - self.pinch_start[0], self.cur[1] - self.pinch_start[1]) > 0.025:
                    self.pinch_moved = True
                if self.pinch_moved:
                    self.send({'type': 'pinchmove', 'dx': dx, 'dy': dy})

        if c['pose'] == 'fist' and self.last_pose == 'fist':
            self.send({'type': 'fist', 'dx': dx, 'dy': dy})

        if c['pose'] in ('open', 'point'):
            self.hist.append((now, c['palm'][0], c['palm'][1]))
            self.hist = [h for h in self.hist if now - h[0] < 0.32]
            h0 = self.hist[0]
            ddx, ddy = c['palm'][0] - h0[1], c['palm'][1] - h0[2]
            if now > self.cool and len(self.hist) >= 4 and abs(ddx) > 0.2 and abs(ddy) < abs(ddx) * 0.6:
                self.step_filter(1 if ddx > 0 else -1)
                self.cool = now + 0.9
                self.hist = []
        else:
            self.hist = []

        if c['pose'] in ('victory', 'thumbs'):
            if self.hold_pose != c['pose']:
                self.hold_pose, self.hold_since, self.hold_fired = c['pose'], now, False
            elif not self.hold_fired and now - self.hold_since > 0.9:
                self.hold_fired = True
                self.send({'type': 'hold', 'pose': c['pose']})
                self.status('✌️ 웹 ↔ 3D' if c['pose'] == 'victory' else '👍 다음 공간')
        else:
            self.hold_pose = None
        self.last_pose = c['pose']

    def end_pinch(self):
        self.pinching = False
        self.send({'type': 'pinchend', 'moved': self.pinch_moved})

    # ── MediaPipe 없을 때: 프레임 차이로 좌우 손짓 감지 ──
    def motion(self, arr, now):
        import numpy as np
        gray = arr[::4, ::4, :3].mean(axis=2)
        if self.motion_prev is None or self.motion_prev.shape != gray.shape:
            self.motion_prev = gray
            return
        diff = np.abs(gray - self.motion_prev) > 0.12
        self.motion_prev = gray
        n = diff.sum()
        if n > diff.size * 0.03:
            xs = np.nonzero(diff)[1]
            cx = 1 - xs.mean() / diff.shape[1]          # 거울 반전
            self.motion_hist.append((now, cx))
        self.motion_hist = [h for h in self.motion_hist if now - h[0] < 0.45]
        if len(self.motion_hist) >= 5 and now > self.cool:
            dx = self.motion_hist[-1][1] - self.motion_hist[0][1]
            if abs(dx) > 0.35:
                self.step_filter(1 if dx > 0 else -1)
                self.cool = now + 1.0
                self.motion_hist = []

    # ── 손 뼈대 오버레이 (Script TOP 에 그림) ──────────────
    def draw(self, hands):
        self.overlay = hands


ENGINE = None


def get():
    global ENGINE
    if ENGINE is None:
        ENGINE = Engine()
    return ENGINE


def reset():
    global ENGINE
    if ENGINE is not None:
        ENGINE.tracker.stop()
    ENGINE = None
    return get()
