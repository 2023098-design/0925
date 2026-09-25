# ─────────────────────────────────────────────────────────────
# 공부각 × TouchDesigner — 네트워크 자동 생성
#
#   TouchDesigner Textport(Alt+T) 에서:
#     exec(open('/Users/admin/Desktop/0925/touchdesigner/td_setup.py', encoding='utf-8').read())
#
#   만들어지는 것 (/project1/gongbugak)
#     cam(Video Device In) ─┬─ mirror ─ filter_glsl ─┐
#                           │                         ├─ comp ─ hud ─ out_view  → window (별도 창)
#                           └─ small(640×360) ─→ engine(손 추적) ─ hand_overlay ┘
#     ws (Web Server DAT :9980) ⇄ 웹사이트 (js/td-bridge.js)
#     frame_exec (매 프레임 engine.update())
# ─────────────────────────────────────────────────────────────
import os

ROOT_DIR = globals().get('GBK_ROOT', '/Users/admin/Desktop/0925')
TD_DIR = os.path.join(ROOT_DIR, 'touchdesigner')

proj = op('/project1')
old = proj.op('gongbugak')
if old is not None:
    try:
        old.op('engine').module.reset().tracker.stop()
    except Exception:
        pass
    old.destroy()

c = proj.create(baseCOMP, 'gongbugak')
c.nodeX, c.nodeY = 0, -300
c.color = (0.48, 0.38, 1.0)
c.comment = '공부각 — 손 제스처로 웹사이트 · 3D 지도 조작 + 스와이프로 카메라/지도 필터 전환'
pg = c.appendCustomPage('공부각')
pg.appendFolder('Projectroot', label='프로젝트 폴더')
c.par.Projectroot = ROOT_DIR
pg.appendInt('Filter', label='필터 번호')
c.par.Filter.normMin, c.par.Filter.normMax = 0, 6


def place(o, x, y):
    o.nodeX, o.nodeY = x * 170, -y * 130
    return o


# ── 코드 DAT (파일과 동기화 → 저장소 파일을 고치면 바로 반영) ──
def file_dat(name, fname, x, y):
    d = place(c.create(textDAT, name), x, y)
    d.par.file = os.path.join(TD_DIR, fname)
    try:
        d.par.syncfile = True
    except Exception:
        pass
    d.par.loadonstartpulse.pulse() if hasattr(d.par, 'loadonstartpulse') else None
    return d


engine = file_dat('engine', 'gbk_engine.py', 0, 5)
code = file_dat('filter_code', 'filters.glsl', 2, 5)

# ── 카메라 ──
cam = place(c.create(videodeviceinTOP, 'cam'), 0, 0)
mirror = place(c.create(flipTOP, 'mirror'), 1, 0)
mirror.par.flipx = True
mirror.inputConnectors[0].connect(cam)
small = place(c.create(resolutionTOP, 'small'), 1, 1)
small.par.outputresolution = 'custom'
small.par.resolutionw, small.par.resolutionh = 640, 360
small.inputConnectors[0].connect(cam)

# ── 필터 (웹 지도 필터와 같은 7종) ──
glsl = place(c.create(glslTOP, 'filter_glsl'), 2, 0)
glsl.par.pixeldat = code
glsl.inputConnectors[0].connect(mirror)
for i, n in enumerate(['uFilter', 'uPrev', 'uMix', 'uTime']):
    setattr(glsl.par, f'uniname{i}', n)
glsl.par.value2x = 1

# ── 손 뼈대 오버레이 ──
ov_cb = place(c.create(textDAT, 'overlay_callbacks'), 1, 3)
ov_cb.text = '''import numpy as np
LINKS = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),(5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),(13,17),(17,18),(18,19),(19,20),(0,17)]
W, H = 640, 360
def onCook(scriptOp):
    img = np.zeros((H, W, 4), dtype=np.float32)
    try:
        hands = getattr(op('engine').module.get(), 'overlay', []) or []
    except Exception:
        hands = []
    col = np.array([0.48, 0.38, 1.0, 1.0], dtype=np.float32)
    for lm in hands:
        pts = [(int(x * W), int((1 - y) * H)) for x, y in lm]   # TD 이미지는 아래가 원점
        for a, b in LINKS:
            (x0, y0), (x1, y1) = pts[a], pts[b]
            for t in np.linspace(0, 1, 14):
                x, y = int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t)
                img[max(0, y-2):y+2, max(0, x-2):x+2] = col
        for x, y in pts:
            img[max(0, y-4):y+4, max(0, x-4):x+4] = (1, 1, 1, 1)
    scriptOp.copyNumpyArray(img)
    return
def onSetupParameters(scriptOp):
    return
def onPulse(par):
    return
'''
overlay = place(c.create(scriptTOP, 'hand_overlay'), 2, 1)
overlay.par.callbacks = ov_cb

comp = place(c.create(compositeTOP, 'comp'), 3, 0)
comp.par.operand = 'add'
comp.inputConnectors[0].connect(glsl)
comp.inputConnectors[1].connect(overlay)

hud_text = place(c.create(textTOP, 'hud_text'), 3, 1)
hud_text.par.resolutionw, hud_text.par.resolutionh = 1280, 52
hud_text.par.text = '공부각 × TouchDesigner'
hud_text.par.fontsizex = 20
hud_text.par.alignx = 'left'
hud_text.par.aligny = 'center'
hud_text.par.positionx, hud_text.par.positiony = 22, 0
hud_text.par.bgcolorr, hud_text.par.bgcolorg, hud_text.par.bgcolorb = 0.05, 0.04, 0.12
hud_text.par.bgalpha = 0.62

hud = place(c.create(overTOP, 'hud'), 4, 0)
hud.inputConnectors[0].connect(hud_text)
hud.inputConnectors[1].connect(comp)
hud.par.outputresolution = 'custom'
hud.par.resolutionw, hud.par.resolutionh = 1280, 720
hud.par.prefit = 'nativeres'
hud.par.justifyv = 'bottom'
hud.par.justifyh = 'left'
out = place(c.create(nullTOP, 'out_view'), 5, 0)
out.inputConnectors[0].connect(hud)
out.viewer = True

win = place(c.create(windowCOMP, 'window'), 5, 1)
win.par.winop = out
win.par.title = '공부각 × TouchDesigner — 손 제스처 필터'
win.par.winw, win.par.winh = 960, 540

# ── WebSocket 서버 ──
ws_cb = place(c.create(textDAT, 'ws_callbacks'), 3, 3)
ws_cb.text = '''import json
def E():
    return op('engine').module.get()
def onHTTPRequest(webServerDAT, request, response):
    response['statusCode'] = 200
    response['statusReason'] = 'OK'
    e = E()
    response['content-type'] = 'application/json'
    response['data'] = json.dumps({'app': 'gongbugak-td', 'filter': e.filter, 'clients': len(e.clients), 'tracking': 'mediapipe' if e.tracker.ok else 'motion', 'error': e.tracker.error})
    return response
def onWebSocketOpen(webServerDAT, client, uri):
    E().on_open(client)
    return
def onWebSocketClose(webServerDAT, client):
    E().on_close(client)
    return
def onWebSocketReceiveText(webServerDAT, client, data):
    E().on_message(data)
    return
def onWebSocketReceiveBinary(webServerDAT, client, data):
    return
def onWebSocketReceivePing(webServerDAT, client, data):
    webServerDAT.webSocketSendPong(client, data=data)
    return
def onWebSocketReceivePong(webServerDAT, client, data):
    return
def onServerStart(webServerDAT):
    return
def onServerStop(webServerDAT):
    return
'''
ws = place(c.create(webserverDAT, 'ws'), 4, 3)
ws.par.port = 9980
ws.par.callbacks = ws_cb
ws.par.active = True

# ── 매 프레임 실행 ──
fx = place(c.create(executeDAT, 'frame_exec'), 0, 3)
fx.text = '''def onFrameStart(frame):
    e = op('engine').module.get()
    e.update()
    parent().par.Filter = e.filter
    op('hand_overlay').cook(force=True)
    return
'''
fx.par.framestart = True
fx.par.active = True

# ── 키보드 (TD 창에서 ←/→ 로 필터 전환) ──
kb = place(c.create(keyboardinDAT, 'keys'), 4, 5)
kb_cb = place(c.create(datexecuteDAT, 'keys_exec'), 5, 5)
kb_cb.par.dat = kb
kb_cb.text = '''def onTableChange(dat):
    if dat.numRows < 2:
        return
    k = str(dat[dat.numRows - 1, 'key'])
    st = str(dat[dat.numRows - 1, 'state'])
    if st not in ('1', 'True', 'down'):
        return
    e = op('engine').module.get()
    if k in ('right', 'Right', '.'):
        e.step_filter(1)
    elif k in ('left', 'Left', ','):
        e.step_filter(-1)
    return
'''
kb_cb.par.tablechange = True

print('공부각 TD 네트워크 생성 완료:', c.path)
