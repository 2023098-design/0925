# ─────────────────────────────────────────────────────────────
# 성신여대 주변 3D 맵 빌더 (Blender 3.6+)
#
#   블렌더 백그라운드 실행:
#     /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/build_map.py
#   또는 블렌더 Scripting 탭에서 이 파일을 열고 ▶ 실행
#
#   입력 : blender/cache/osm.json  (OpenStreetMap Overpass 결과, © OpenStreetMap contributors, ODbL)
#          data/geo.json           (추천 공간 좌표)
#   출력 : assets/map/sungshin_map.glb  (웹 3D 지도)
#          blender/sungshin_map.blend
#          images/places/<id>.jpg      (공간 카드 썸네일 — 3D 맵에서 렌더)
#          images/hero.jpg
# ─────────────────────────────────────────────────────────────
import bpy, bmesh, json, math, os, sys, random, hashlib
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OSM = os.path.join(HERE, 'cache', 'osm.json')
GEO = os.path.join(ROOT, 'data', 'geo.json')
OUT_GLB = os.path.join(ROOT, 'assets', 'map', 'sungshin_map.glb')
OUT_BLEND = os.path.join(HERE, 'sungshin_map.blend')
OUT_IMG = os.path.join(ROOT, 'images')
RENDER = '--no-render' not in sys.argv

R = 560.0                      # 섬(맵) 반지름 m
geo = json.load(open(GEO, encoding='utf-8'))
LAT0, LON0 = geo['center']['lat'], geo['center']['lng']
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110540


def xy(lat, lon):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


def hval(s, a, b):
    h = int(hashlib.md5(str(s).encode()).hexdigest()[:8], 16) / 0xffffffff
    return a + (b - a) * h


# ── 장면 초기화 ─────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'SungshinMap'
scene.unit_settings.system = 'METRIC'


def coll(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


C_GROUND, C_ROADS, C_BLD, C_NATURE, C_PINS = [coll(n) for n in ('Ground', 'Roads', 'Buildings', 'Nature', 'Pins')]


def mat(name, color, rough=0.85, metal=0.0, emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_str
    m.diffuse_color = (*color, 1)
    return m


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


M = {
    'ground':   mat('M_Ground', srgb('#e2d9d0')),
    'base':     mat('M_Base', srgb('#3b3552'), 0.6),
    'rim':      mat('M_Rim', srgb('#f6b9c9'), 0.5),
    'campus':   mat('M_Campus', srgb('#e6dcf2')),
    'green':    mat('M_Green', srgb('#cfe6c4')),
    'water':    mat('M_Water', srgb('#8fc9e8'), 0.15),
    'bank':     mat('M_Bank', srgb('#bcdcb0')),
    'road_maj': mat('M_RoadMajor', srgb('#ffffff'), 0.9),
    'road_min': mat('M_RoadMinor', srgb('#f7f2ec'), 0.9),
    'path':     mat('M_Path', srgb('#f3d7de'), 0.9),
    'bld':      mat('M_Building', srgb('#f4f1ee'), 0.8),
    'bld_tall': mat('M_BuildingTall', srgb('#dcd6ee'), 0.7),
    'bld_warm': mat('M_BuildingWarm', srgb('#f1dcd2'), 0.8),
    'bld_fill': mat('M_BuildingFill', srgb('#e9e4ef'), 0.8),
    'bld_camp': mat('M_BuildingCampus', srgb('#cbb8e8'), 0.7),
    'spot':     mat('M_Spot', srgb('#ff7aa2'), 0.5),
    'leaf':     mat('M_Leaf', srgb('#8cc48a'), 0.9),
    'trunk':    mat('M_Trunk', srgb('#a47e62'), 0.9),
    'pin_study': mat('M_PinStudy', srgb('#7b61ff'), 0.35, emit=srgb('#7b61ff'), emit_str=0.6),
    'pin_cafe':  mat('M_PinCafe', srgb('#ff6f91'), 0.35, emit=srgb('#ff6f91'), emit_str=0.6),
    'pin_dessert': mat('M_PinDessert', srgb('#ffb347'), 0.35, emit=srgb('#ffb347'), emit_str=0.6),
    'station':  mat('M_Station', srgb('#4aa3ff'), 0.3, emit=srgb('#4aa3ff'), emit_str=0.8),
}


class MeshBuf:
    """정점·면을 모아 한 번에 메쉬로 만드는 버퍼 (오브젝트 수를 줄여 웹에서 가볍게)"""
    def __init__(self):
        self.v, self.f, self.c = [], [], []
        self.has_c = False

    def add(self, verts, faces, col=None):
        o = len(self.v)
        self.v.extend(verts)
        self.f.extend([tuple(i + o for i in fc) for fc in faces])
        if col is not None:
            self.has_c = True
        self.c.extend([col or (0.0, 0.0, 0.0, 1.0)] * len(verts))

    def build(self, name, material, collection, smooth=False):
        if not self.f:
            return None
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.validate(clean_customdata=False)
        me.update()
        for p in me.polygons:
            p.use_smooth = smooth
        if self.has_c and len(me.vertices) == len(self.c):
            ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
            for i, c in enumerate(self.c):
                ca.data[i].color = c
        me.materials.append(material)
        ob = bpy.data.objects.new(name, me)
        collection.objects.link(ob)
        return ob


# ── OSM 읽기 ────────────────────────────────────────────────
osm = json.load(open(OSM, encoding='utf-8'))
nodes = {e['id']: xy(e['lat'], e['lon']) for e in osm['elements'] if e['type'] == 'node'}
ways = {e['id']: e for e in osm['elements'] if e['type'] == 'way'}
rels = [e for e in osm['elements'] if e['type'] == 'relation']
pois = [e for e in osm['elements'] if e['type'] == 'node' and 'tags' in e]


def pts_of(w):
    return [nodes[n] for n in w['nodes'] if n in nodes]


def inside(p, r=R):
    return p[0] * p[0] + p[1] * p[1] <= r * r


def area2(poly):
    return sum(poly[i][0] * poly[i - 1][1] - poly[i - 1][0] * poly[i][1] for i in range(len(poly))) / 2


def ccw(poly):
    if len(poly) > 1 and poly[0] == poly[-1]:
        poly = poly[:-1]
    return poly[::-1] if area2(poly) < 0 else poly


def centroid(poly):
    return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))


def pip(pt, poly):
    x, y = pt
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi):
            c = not c
        j = i
    return c


_CLIP = [(math.cos(k * 2 * math.pi / 160) * R, math.sin(k * 2 * math.pi / 160) * R) for k in range(160)]


def clip_poly_circle(poly, r=R):
    """Sutherland–Hodgman — 원(160각형) 안쪽만 남기기 (지면 폴리곤용)"""
    out = ccw(list(poly))
    clip = _CLIP
    for i in range(len(clip)):
        a, b = clip[i], clip[(i + 1) % len(clip)]
        inp, out = out, []
        if not inp:
            break

        def side(p):
            return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0

        def inter(p, q):
            x1, y1, x2, y2 = p[0], p[1], q[0], q[1]
            x3, y3, x4, y4 = a[0], a[1], b[0], b[1]
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4) or 1e-12
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
        for j in range(len(inp)):
            cur, prv = inp[j], inp[j - 1]
            if side(cur):
                if not side(prv):
                    out.append(inter(prv, cur))
                out.append(cur)
            elif side(prv):
                out.append(inter(prv, cur))
    return out


def clip_line_circle(pts, r=R):
    """폴리라인을 원 안쪽 조각들로 나누기"""
    pieces, cur = [], []
    for i, p in enumerate(pts):
        if inside(p, r):
            if not cur and i > 0:
                cur.append(_cross(pts[i - 1], p, r))
            cur.append(p)
        else:
            if cur:
                cur.append(_cross(cur[-1], p, r))
                pieces.append(cur)
                cur = []
    if len(cur) > 1:
        pieces.append(cur)
    return [c for c in pieces if len(c) > 1]


def _cross(a, b, r):
    # a 안, b 밖 (또는 반대) — 선분과 원의 교점
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    A = dx * dx + dy * dy
    B = 2 * (ax * dx + ay * dy)
    Cc = ax * ax + ay * ay - r * r
    disc = max(0, B * B - 4 * A * Cc)
    ts = [(-B + math.sqrt(disc)) / (2 * A), (-B - math.sqrt(disc)) / (2 * A)] if A else [0]
    ts = [t for t in ts if -1e-6 <= t <= 1 + 1e-6] or [0]
    t = ts[0]
    return (ax + dx * t, ay + dy * t)


def ribbon(buf, pts, width, z):
    """폴리라인 → 평평한 띠 (도로·하천)"""
    n = len(pts)
    if n < 2:
        return
    hw = width / 2
    L, Rt = [], []
    for i in range(n):
        p = Vector((*pts[i], 0))
        if i == 0:
            d = Vector((*pts[1], 0)) - p
        elif i == n - 1:
            d = p - Vector((*pts[i - 1], 0))
        else:
            d1 = (p - Vector((*pts[i - 1], 0))).normalized()
            d2 = (Vector((*pts[i + 1], 0)) - p).normalized()
            d = d1 + d2
            if d.length < 1e-6:
                d = d1
        if d.length < 1e-6:
            d = Vector((1, 0, 0))
        d.normalize()
        nrm = Vector((-d.y, d.x, 0))
        scale = 1.0
        if 0 < i < n - 1:
            d1 = (p - Vector((*pts[i - 1], 0))).normalized()
            nr1 = Vector((-d1.y, d1.x, 0))
            cosang = max(0.35, nrm.dot(nr1))
            scale = min(1 / cosang, 2.2)
        L.append((p.x + nrm.x * hw * scale, p.y + nrm.y * hw * scale, z))
        Rt.append((p.x - nrm.x * hw * scale, p.y - nrm.y * hw * scale, z))
    verts = L + Rt
    faces = [(i, n + i, n + i + 1, i + 1) for i in range(n - 1)]
    buf.add(verts, faces)
    # 이음새 원형 캡 (각진 틈을 메움)
    for i in (0, n - 1) if width > 3 else ():
        cx, cy = pts[i]
        seg = 10
        ring = [(cx + math.cos(a) * hw, cy + math.sin(a) * hw, z) for a in [k * 2 * math.pi / seg for k in range(seg)]]
        buf.add(ring, [tuple(range(seg))])


def flat_poly(buf, poly, z):
    poly = ccw(poly)
    if len(poly) < 3:
        return
    buf.add([(x, y, z) for x, y in poly], [tuple(range(len(poly)))])


def prism(buf, poly, h, z0=0.0, seed=None):
    poly = ccw(poly)
    n = len(poly)
    if n < 3:
        return
    verts = [(x, y, z0) for x, y in poly] + [(x, y, z0 + h) for x, y in poly]
    faces = [tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    # 건물마다 무작위 값(R) · 높이(G) 를 정점 색으로 — 웹 클레이 필터가 건물별 색을 고를 때 씀
    rnd = hval(seed if seed is not None else (round(poly[0][0], 1), round(poly[0][1], 1)), 0, 1)
    buf.add(verts, faces, (rnd, min(1.0, h / 60.0), 0.0, 1.0))


# ── 지면 · 받침 ─────────────────────────────────────────────
def disc(name, r, z, material, collection, seg=128):
    b = MeshBuf()
    b.add([(math.cos(a) * r, math.sin(a) * r, z) for a in [k * 2 * math.pi / seg for k in range(seg)]], [tuple(range(seg))])
    return b.build(name, material, collection)


disc('Ground', R, 0.0, M['ground'], C_GROUND)
# 받침(섬 두께)
bb = MeshBuf()
seg = 128
top = [(math.cos(k * 2 * math.pi / seg) * (R - 0.4), math.sin(k * 2 * math.pi / seg) * (R - 0.4), -3.0) for k in range(seg)]
bot = [(math.cos(k * 2 * math.pi / seg) * (R - 22), math.sin(k * 2 * math.pi / seg) * (R - 22), -46) for k in range(seg)]
bb.add(top + bot, [(i, seg + i, seg + (i + 1) % seg, (i + 1) % seg) for i in range(seg)] + [tuple(range(2 * seg - 1, seg - 1, -1))])
base_ob = bb.build('Base', M['base'], C_GROUND, smooth=True)
rim = MeshBuf()
ri = [(math.cos(k * 2 * math.pi / seg) * R, math.sin(k * 2 * math.pi / seg) * R, 0.0) for k in range(seg)]
ro = [(math.cos(k * 2 * math.pi / seg) * R, math.sin(k * 2 * math.pi / seg) * R, -3.2) for k in range(seg)]
rim.add(ri + ro, [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)])
rim_ob = rim.build('Rim', M['rim'], C_GROUND, smooth=True)
for _o in (base_ob, rim_ob):
    _o.visible_shadow = False
for _m in (M['base'], M['rim']):
    _m.shadow_method = 'NONE'

# ── 토지 이용 (캠퍼스 · 공원 · 물) ─────────────────────────
b_campus, b_green, b_water = MeshBuf(), MeshBuf(), MeshBuf()
campus_polys = []
for w in ways.values():
    t = w.get('tags', {})
    pts = pts_of(w)
    if len(pts) < 4 or pts[0] != pts[-1]:
        continue
    if not any(inside(p, R + 150) for p in pts):
        continue
    poly = clip_poly_circle(pts[:-1])
    if t.get('amenity') in ('university', 'college', 'school') or t.get('landuse') in ('university', 'school'):
        flat_poly(b_campus, poly, 0.04)
        if '성신' in t.get('name', ''):
            campus_polys.append(pts[:-1])
    elif t.get('leisure') in ('park', 'garden', 'pitch', 'playground') or t.get('landuse') in ('grass', 'forest', 'recreation_ground') or t.get('natural') in ('wood', 'scrub'):
        flat_poly(b_green, poly, 0.07)
    elif t.get('natural') == 'water':
        flat_poly(b_water, poly, 0.1)

# ── 도로 · 하천 ─────────────────────────────────────────────
b_maj, b_min, b_path, b_bank = MeshBuf(), MeshBuf(), MeshBuf(), MeshBuf()
W_MAJ = {'primary': 15, 'primary_link': 8, 'secondary': 12, 'secondary_link': 7, 'tertiary': 10, 'tertiary_link': 6, 'busway': 7}
W_MIN = {'residential': 6.0, 'unclassified': 6.0, 'living_street': 5.0, 'service': 4.0, 'track': 3.0}
W_PATH = {'footway': 2.4, 'pedestrian': 4.0, 'path': 2.2, 'steps': 2.4, 'cycleway': 2.4}
river_lines = []
for w in ways.values():
    t = w.get('tags', {})
    pts = pts_of(w)
    if t.get('tunnel') in ('yes', 'building_passage') or t.get('layer', '0').startswith('-'):
        continue
    hw = t.get('highway')
    if hw or t.get('waterway'):
        for piece in clip_line_circle(pts):
            if t.get('waterway') in ('river', 'stream', 'canal'):
                river_lines.append(piece)
                ribbon(b_bank, piece, 30, 0.06)
                ribbon(b_water, piece, 13, 0.12)
            elif hw in W_MAJ:
                ribbon(b_maj, piece, W_MAJ[hw], 0.22)
            elif hw in W_MIN:
                ribbon(b_min, piece, W_MIN[hw], 0.16)
            elif hw in W_PATH:
                ribbon(b_path, piece, W_PATH[hw], 0.28)

b_campus.build('Campus', M['campus'], C_GROUND)
b_green.build('Green', M['green'], C_NATURE)
b_bank.build('RiverBank', M['bank'], C_NATURE)
b_water.build('Water', M['water'], C_NATURE)
b_maj.build('Road_Major', M['road_maj'], C_ROADS)
b_min.build('Road_Minor', M['road_min'], C_ROADS)
b_path.build('Road_Path', M['path'], C_ROADS)

# ── 건물 ───────────────────────────────────────────────────
places = geo['places']
place_xy = {p['id']: xy(p['lat'], p['lng']) for p in places}
cats = {}
try:
    for p in json.load(open(os.path.join(ROOT, 'seed', 'places.json'), encoding='utf-8')):
        cats[p['id']] = p['category']
except Exception:
    pass


def height_of(t, poly, wid):
    if 'height' in t:
        try:
            return max(3.0, float(str(t['height']).replace('m', '').strip()))
        except ValueError:
            pass
    if 'building:levels' in t:
        try:
            return max(3.0, float(t['building:levels']) * 3.3)
        except ValueError:
            pass
    a = abs(area2(poly))
    kind = t.get('building')
    if kind in ('apartments',):
        return hval(wid, 28, 48)
    if kind in ('university', 'school', 'college'):
        return hval(wid, 14, 24)
    if kind in ('house', 'detached', 'garage', 'shed'):
        return hval(wid, 5, 8)
    if a > 1500:
        return hval(wid, 16, 30)
    if a > 400:
        return hval(wid, 10, 20)
    return hval(wid, 6, 13)


footprints = []
for w in ways.values():
    t = w.get('tags', {})
    if 'building' not in t or t.get('building') in ('roof',):
        continue
    pts = pts_of(w)
    if len(pts) < 4:
        continue
    poly = pts[:-1] if pts[0] == pts[-1] else pts
    c = centroid(poly)
    if not inside(c, R - 6) or not all(inside(p, R - 1) for p in poly):
        continue
    footprints.append((w['id'], t, poly, c))
for rel in rels:
    t = rel.get('tags', {})
    if 'building' not in t:
        continue
    for m in rel.get('members', []):
        if m.get('role') == 'outer' and m['type'] == 'way' and m['ref'] in ways:
            pts = pts_of(ways[m['ref']])
            if len(pts) >= 4:
                poly = pts[:-1]
                c = centroid(poly)
                if inside(c, R - 6):
                    footprints.append((m['ref'], t, poly, c))

# 추천 공간이 들어 있는 건물 찾기
spot_of = {}
for pid, pxy in place_xy.items():
    best, bd = None, 1e9
    for i, (wid, t, poly, c) in enumerate(footprints):
        if pip(pxy, poly):
            best, bd = i, 0
            break
        d = math.dist(pxy, c)
        if d < bd:
            best, bd = i, d
    if best is not None and bd < 30:
        spot_of[best] = pid

b_bld, b_tall, b_camp = MeshBuf(), MeshBuf(), MeshBuf()
b_bld2, b_fill = MeshBuf(), MeshBuf()

# ── 빈 블록 채우기: OSM에 건물이 없는 골목 블록에 작은 상가 건물을 절차적으로 배치 ──
CELL = 4.0
N = int(2 * R / CELL) + 1
occ = bytearray(N * N)           # 0 빈칸 · 1 도로 · 2 건물/녹지/물
road_ang = {}


def cell(x, y):
    return int((x + R) / CELL), int((y + R) / CELL)


def mark_disc(x, y, rad, val, ang=None):
    cx, cy = cell(x, y)
    rr = int(rad / CELL) + 1
    for i in range(cx - rr, cx + rr + 1):
        for j in range(cy - rr, cy + rr + 1):
            if 0 <= i < N and 0 <= j < N:
                px, py = i * CELL - R + CELL / 2, j * CELL - R + CELL / 2
                if (px - x) ** 2 + (py - y) ** 2 <= rad * rad:
                    k = j * N + i
                    if occ[k] < val or val == 1 and occ[k] == 0:
                        occ[k] = max(occ[k], val)
                    if ang is not None and k not in road_ang:
                        road_ang[k] = ang


for w in ways.values():
    t = w.get('tags', {})
    hw = t.get('highway')
    if not hw and not t.get('waterway'):
        continue
    wd = W_MAJ.get(hw) or W_MIN.get(hw) or W_PATH.get(hw) or (30 if t.get('waterway') else 0)
    if not wd:
        continue
    pts = pts_of(w)
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        for k in range(int(L / 2) + 1):
            tt = k * 2 / max(L, 1e-6)
            x, y = a[0] + (b[0] - a[0]) * min(1, tt), a[1] + (b[1] - a[1]) * min(1, tt)
            if inside((x, y), R + 10):
                mark_disc(x, y, wd / 2 + 2.5, 1, ang if hw in W_MIN or hw in W_MAJ else None)


def mark_poly(poly, val):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    i0, j0 = cell(min(xs) - 3, min(ys) - 3)
    i1, j1 = cell(max(xs) + 3, max(ys) + 3)
    for i in range(max(0, i0), min(N, i1 + 1)):
        for j in range(max(0, j0), min(N, j1 + 1)):
            px, py = i * CELL - R + CELL / 2, j * CELL - R + CELL / 2
            if pip((px, py), poly) or min((px - x) ** 2 + (py - y) ** 2 for x, y in poly) < 9:
                occ[j * N + i] = 2


for (wid, t, poly, c) in footprints:
    mark_poly(poly, 2)
for w in ways.values():
    t = w.get('tags', {})
    pts = pts_of(w)
    if len(pts) >= 4 and pts[0] == pts[-1] and (t.get('leisure') or t.get('natural') or t.get('landuse') in ('grass', 'forest')
                                                 or t.get('amenity') in ('university', 'school', 'college')):
        mark_poly(pts[:-1], 2)


def nearest_ang(i, j):
    for rr in range(1, 8):
        for di in range(-rr, rr + 1):
            for dj in (-rr, rr) if abs(di) != rr else range(-rr, rr + 1):
                k = (j + dj) * N + (i + di)
                if k in road_ang:
                    return road_ang[k]
    return None


random.seed(2023)
fill_count = 0
STEP = 4                      # 16 m 간격
for i in range(1, N - 3, STEP):
    for j in range(1, N - 3, STEP):
        ii, jj = i + random.randint(0, 1), j + random.randint(0, 1)
        block = [occ[(jj + dj) * N + (ii + di)] for di in range(3) for dj in range(3) if 0 <= ii + di < N and 0 <= jj + dj < N]
        if len(block) < 9 or any(block) or random.random() < 0.3:
            continue
        cx, cy = ii * CELL - R + CELL * 1.5, jj * CELL - R + CELL * 1.5
        if not inside((cx, cy), R - 14):
            continue
        ang = nearest_ang(ii + 1, jj + 1)
        if ang is None:
            continue
        w2 = random.uniform(3.6, 5.2)
        d2 = random.uniform(3.8, 5.4)
        ca, sa = math.cos(ang), math.sin(ang)
        poly = [(cx + ca * x - sa * y, cy + sa * x + ca * y) for x, y in ((-w2, -d2), (w2, -d2), (w2, d2), (-w2, d2))]
        h = random.choice([6, 7, 9, 9, 10, 12, 13, 15]) * random.uniform(0.9, 1.1)
        prism(b_fill if random.random() < 0.5 else b_bld2, poly, h)
        fill_count += 1
print('fill buildings', fill_count)
roof_of = {}
for i, (wid, t, poly, c) in enumerate(footprints):
    h = height_of(t, poly, wid)
    if i in spot_of:
        pid = spot_of[i]
        h = max(h, 12)
        sb = MeshBuf()
        prism(sb, poly, h)
        cat = cats.get(pid, '카페')
        sm = M['pin_study'] if cat == '스터디카페' else (M['pin_dessert'] if cat == '디저트카페' else M['spot'])
        ob = sb.build(f'Spot_{pid}', sm, C_BLD)
        roof_of[pid] = h
        continue
    in_campus = any(pip(c, cp) for cp in campus_polys)
    target = b_camp if in_campus else (b_tall if h > 24 else (b_bld2 if hval(wid, 0, 1) > 0.55 else b_bld))
    prism(target, poly, h)
b_bld.build('Buildings', M['bld'], C_BLD)
b_bld2.build('Buildings_Warm', M['bld_warm'], C_BLD)
b_fill.build('Buildings_Fill', M['bld_fill'], C_BLD)
b_tall.build('Buildings_Tall', M['bld_tall'], C_BLD)
b_camp.build('Buildings_Campus', M['bld_camp'], C_BLD)

# ── 나무 (성북천 · 녹지) ───────────────────────────────────
random.seed(925)
b_leaf, b_trunk = MeshBuf(), MeshBuf()


def tree(x, y, s):
    # 낮은 폴리 나무: 팔면체 잎 + 사각 기둥
    hgt = 3.2 * s
    tw = 0.35 * s
    b_trunk.add([(x - tw, y - tw, 0), (x + tw, y - tw, 0), (x + tw, y + tw, 0), (x - tw, y + tw, 0),
                 (x - tw, y - tw, hgt), (x + tw, y - tw, hgt), (x + tw, y + tw, hgt), (x - tw, y + tw, hgt)],
                [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    r = 2.6 * s
    cz = hgt + r * 0.9
    k = 6
    ring = [(x + math.cos(a) * r, y + math.sin(a) * r, cz) for a in [j * 2 * math.pi / k + s for j in range(k)]]
    verts = ring + [(x, y, cz + r * 1.25), (x, y, cz - r * 0.8)]
    faces = [(j, (j + 1) % k, k) for j in range(k)] + [((j + 1) % k, j, k + 1) for j in range(k)]
    b_leaf.add(verts, faces)


for line in river_lines:
    for a, b in zip(line, line[1:]):
        L = math.dist(a, b)
        steps = int(L / 11)
        for sgn in (-1, 1):
            for k in range(steps):
                t = (k + random.random() * 0.4) / max(1, steps)
                x = a[0] + (b[0] - a[0]) * t
                y = a[1] + (b[1] - a[1]) * t
                dx, dy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
                off = 11 + random.random() * 3
                px, py = x - dy * off * sgn, y + dx * off * sgn
                if inside((px, py), R - 4):
                    tree(px, py, 0.8 + random.random() * 0.5)
for w in ways.values():
    t = w.get('tags', {})
    if t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'forest') or t.get('natural') == 'wood':
        pts = pts_of(w)
        if len(pts) < 4:
            continue
        poly = pts[:-1]
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        area = abs(area2(poly))
        n = min(60, int(area / 180))
        for _ in range(n):
            px, py = random.uniform(min(xs), max(xs)), random.uniform(min(ys), max(ys))
            if pip((px, py), poly) and inside((px, py), R - 4):
                tree(px, py, 0.8 + random.random() * 0.6)
b_leaf.build('Trees', M['leaf'], C_NATURE)
b_trunk.build('Trunks', M['trunk'], C_NATURE)

# ── 추천 공간 핀 · 역 ──────────────────────────────────────
def pin(name, x, y, z, material, scale=1.0):
    b = MeshBuf()
    r = 4.2 * scale
    k = 20
    # 물방울 모양: 아래로 뾰족한 원뿔 + 구
    ring = [(math.cos(j * 2 * math.pi / k) * r, math.sin(j * 2 * math.pi / k) * r, r * 1.6) for j in range(k)]
    b.add(ring + [(0, 0, 0)], [(j, (j + 1) % k, k) for j in range(k)][::-1])
    # 구 (위 반구)
    rings = 8
    vs = []
    for ri in range(rings + 1):
        th = (ri / rings) * math.pi / 2
        for j in range(k):
            a = j * 2 * math.pi / k
            vs.append((math.cos(a) * r * math.cos(th), math.sin(a) * r * math.cos(th), r * 1.6 + r * math.sin(th)))
    fs = []
    for ri in range(rings):
        for j in range(k):
            a0 = ri * k + j
            a1 = ri * k + (j + 1) % k
            fs.append((a0, a1, a1 + k, a0 + k))
    b.add(vs, fs)
    ob = b.build(name, material, C_PINS, smooth=True)
    ob.location = (x, y, z)
    return ob


for p in places:
    x, y = place_xy[p['id']]
    cat = cats.get(p['id'], '카페')
    m = M['pin_study'] if cat == '스터디카페' else (M['pin_dessert'] if cat == '디저트카페' else M['pin_cafe'])
    pin(f"Pin_{p['id']}", x, y, roof_of.get(p['id'], 12) + 6, m)
    e = bpy.data.objects.new(f"Anchor_{p['id']}", None)
    e.location = (x, y, roof_of.get(p['id'], 12))
    C_PINS.objects.link(e)

sb = MeshBuf()
for e in pois:
    if e['tags'].get('railway') == 'subway_entrance':
        x, y = nodes[e['id']]
        if inside((x, y), R - 5):
            prism(sb, [(x - 1.6, y - 1.6), (x + 1.6, y - 1.6), (x + 1.6, y + 1.6), (x - 1.6, y + 1.6)], 3.2, 0.2)
sb.build('Station_Entrances', M['station'], C_PINS)
for lm in geo['landmarks']:
    e = bpy.data.objects.new(f"Label_{lm['key']}", None)
    x, y = xy(lm['lat'], lm['lng'])
    e.location = (x, y, 2)
    C_PINS.objects.link(e)

# ── 조명 · 카메라 · 월드 ──────────────────────────────────
world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (*srgb('#fbe9ef'), 1)
bg.inputs['Strength'].default_value = 0.7

sun_d = bpy.data.lights.new('Sun', 'SUN')
sun_d.energy = 2.6
sun_d.angle = math.radians(6)
sun_d.shadow_cascade_max_distance = 3500
sun_d.shadow_cascade_count = 4
sun_d.shadow_cascade_fade = 0.1
sun = bpy.data.objects.new('Sun', sun_d)
sun.rotation_euler = (math.radians(48), math.radians(12), math.radians(-35))
scene.collection.objects.link(sun)

cam_d = bpy.data.cameras.new('Camera')
cam_d.lens = 50
cam = bpy.data.objects.new('Camera', cam_d)
scene.collection.objects.link(cam)
scene.camera = cam


def look(cam, target, dist, elev, azim):
    t = Vector(target)
    d = Vector((math.cos(math.radians(elev)) * math.sin(math.radians(azim)),
                -math.cos(math.radians(elev)) * math.cos(math.radians(azim)),
                math.sin(math.radians(elev))))
    cam.location = t + d * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()


look(cam, (0, 0, 0), 1650, 42, 20)
cam_d.clip_end = 8000
cam_d.clip_start = 4

# ── 저장 · 내보내기 ─────────────────────────────────────────
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format='GLB', export_apply=True, export_yup=True,
    export_cameras=False, export_lights=False, export_extras=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_normal_quantization=8,
)
print('GLB', os.path.getsize(OUT_GLB), 'bytes · buildings', len(footprints), '· spots', sorted(spot_of.values()))

# ── 썸네일 렌더 ─────────────────────────────────────────────
if RENDER:
    os.makedirs(os.path.join(OUT_IMG, 'places'), exist_ok=True)
    scene.render.engine = 'BLENDER_EEVEE'
    try:
        ee = scene.eevee
        ee.use_gtao = True
        ee.gtao_distance = 6
        ee.use_soft_shadows = True
        ee.shadow_cascade_size = '2048'
        ee.taa_render_samples = 32
    except Exception:
        pass
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = -0.35
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 86

    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    look(cam, (0, -20, 0), 2000, 52, 16)
    scene.render.filepath = os.path.join(OUT_IMG, 'hero.jpg')
    bpy.ops.render.render(write_still=True)
    # 배경 투명 버전 (웹 히어로 카드 — CSS 그라데이션이 비쳐 보이게)
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 88
    scene.render.filepath = os.path.join(OUT_IMG, 'hero.webp')
    bpy.ops.render.render(write_still=True)
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.quality = 86

    scene.render.resolution_x, scene.render.resolution_y = 800, 600
    cam_d.lens = 45
    for p in places:
        x, y = place_xy[p['id']]
        for o in bpy.data.objects:
            if o.name.startswith('Pin_'):
                o.hide_render = o.name != f"Pin_{p['id']}"
        tgt = Vector((x, y, roof_of.get(p['id'], 10) * 0.6))
        best_az = 30 + p['id'] * 23
        dg = bpy.context.evaluated_depsgraph_get()
        for k in range(12):
            az = (30 + p['id'] * 23 + k * 30) % 360
            look(cam, tgt, 230, 50, az)
            d = (tgt - cam.location)
            hit, loc, nrm, idx, obj, mat_ = scene.ray_cast(dg, cam.location, d.normalized(), distance=d.length + 5)
            if hit and (obj.name.startswith('Spot_') or obj.name.startswith('Pin_') or (loc - tgt).length < 14):
                best_az = az
                break
        look(cam, tgt, 230, 50, best_az)
        scene.render.filepath = os.path.join(OUT_IMG, 'places', f"{p['id']}.jpg")
        bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        o.hide_render = False
    look(cam, (0, 0, 0), 1650, 42, 20)
    cam_d.lens = 50
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
print('DONE')
