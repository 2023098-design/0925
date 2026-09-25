# ─────────────────────────────────────────────────────────────
# 공부각 캐릭터 빌더 (Blender 3.6+) — 3D 지도를 걸어 다니는 ‘수정이’
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/build_character.py
#
#   출력 : assets/map/character.glb   (관절마다 빈 오브젝트 피벗 → 웹에서 팔다리를 흔들어 걷기 애니메이션)
#          blender/character.blend
#          images/character.webp       (UI 초상)
#
#   피벗 이름 (three.js 에서 찾음)
#     Character > Hips > Torso · Backpack · HeadPivot > Head …
#                       ShoulderL/ShoulderR > Arm · Hand
#                       HipL/HipR > Leg · Shoe
#   블렌더 -Y 방향이 캐릭터 정면 (glTF 로 내보내면 +Z)
# ─────────────────────────────────────────────────────────────
import bpy, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_GLB = os.path.join(ROOT, 'assets', 'map', 'character.glb')
OUT_BLEND = os.path.join(HERE, 'character.blend')
OUT_IMG = os.path.join(ROOT, 'images', 'character.webp')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def mat(name, hexcol, rough=0.6, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission'].default_value = (*srgb(hexcol), 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


M = {
    'skin': mat('C_Skin', '#f7d5c4', 0.55),
    'hair': mat('C_Hair', '#3a2a2e', 0.45),
    'hoodie': mat('C_Hoodie', '#7b61ff', 0.7),
    'pants': mat('C_Pants', '#2b2d42', 0.8),
    'shoe': mat('C_Shoe', '#ffffff', 0.5),
    'sole': mat('C_Sole', '#ff6f91', 0.6),
    'bag': mat('C_Backpack', '#ff6f91', 0.6),
    'eye': mat('C_Eye', '#1b1622', 0.2),
    'cheek': mat('C_Cheek', '#ff9fb2', 0.7),
    'badge': mat('C_Badge', '#ffd166', 0.4, emit=0.4),
}


def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.08
    col.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def blob(name, parent, loc, scale, material, seg=24, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(material)
    o.parent = parent
    o.location = loc
    return o


def box(name, parent, loc, size, material, bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    mod = o.modifiers.new('bevel', 'BEVEL')
    mod.width = bevel
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier='bevel')
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(material)
    o.parent = parent
    o.location = loc
    return o


# ── 뼈대(피벗) ────────────────────────────────────────────
root = empty('Character')
hips = empty('Hips', root, (0, 0, 0.72))

# 몸통 · 가방 (큰 머리 · 짧은 다리의 귀여운 비율)
blob('Torso', hips, (0, 0, 0.25), (0.2, 0.155, 0.27), M['hoodie'])
blob('Hood', hips, (0, 0.1, 0.45), (0.17, 0.085, 0.07), M['hoodie'])
box('Backpack', hips, (0, 0.2, 0.27), (0.3, 0.14, 0.34), M['bag'], 0.05)
box('BackpackPocket', hips, (0, 0.28, 0.2), (0.2, 0.04, 0.13), M['sole'], 0.02)
blob('Badge', hips, (-0.1, -0.15, 0.34), (0.035, 0.012, 0.035), M['badge'], 12, 8)
blob('Pelvis', hips, (0, 0, 0.0), (0.175, 0.135, 0.1), M['pants'])

# 머리
head = empty('HeadPivot', hips, (0, 0, 0.5))
blob('Head', head, (0, 0, 0.21), (0.24, 0.23, 0.23), M['skin'])
blob('HairTop', head, (0, 0.02, 0.29), (0.255, 0.245, 0.19), M['hair'])
blob('HairBack', head, (0, 0.09, 0.15), (0.25, 0.165, 0.23), M['hair'])
blob('Bangs', head, (0, -0.135, 0.33), (0.2, 0.08, 0.07), M['hair'])
blob('Ponytail', head, (0, 0.26, 0.25), (0.085, 0.11, 0.14), M['hair'])
blob('EyeL', head, (-0.085, -0.214, 0.2), (0.03, 0.014, 0.042), M['eye'], 12, 8)
blob('EyeR', head, (0.085, -0.214, 0.2), (0.03, 0.014, 0.042), M['eye'], 12, 8)
blob('CheekL', head, (-0.145, -0.18, 0.13), (0.035, 0.012, 0.02), M['cheek'], 12, 8)
blob('CheekR', head, (0.145, -0.18, 0.13), (0.035, 0.012, 0.02), M['cheek'], 12, 8)

# 팔 (어깨 피벗 아래로 매달림) · 다리 (골반 피벗)
for side, sx in (('L', -1), ('R', 1)):
    sh = empty(f'Shoulder{side}', hips, (0.22 * sx, 0, 0.42))
    blob(f'Arm{side}', sh, (0.02 * sx, 0, -0.17), (0.078, 0.078, 0.2), M['hoodie'])
    blob(f'Hand{side}', sh, (0.03 * sx, 0, -0.38), (0.066, 0.066, 0.07), M['skin'])
    hp = empty(f'Hip{side}', hips, (0.095 * sx, 0, -0.03))
    blob(f'Leg{side}', hp, (0, 0, -0.3), (0.092, 0.092, 0.3), M['pants'])
    box(f'Shoe{side}', hp, (0, -0.04, -0.63), (0.15, 0.26, 0.11), M['shoe'], 0.045)
    box(f'Sole{side}', hp, (0, -0.04, -0.68), (0.155, 0.265, 0.025), M['sole'], 0.01)

# 발밑 그림자 원 (웹에서 가짜 그림자로 사용)
bpy.ops.mesh.primitive_circle_add(vertices=32, radius=0.38, fill_type='NGON')
sh = bpy.context.active_object
sh.name = 'FootShadow'
sh.location = (0, 0, 0.01)
sh.parent = root
sm = mat('C_Shadow', '#000000', 1.0)
sm.blend_method = 'BLEND'
sm.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.25
sh.data.materials.append(sm)

# ── 저장 · 내보내기 ──────────────────────────────────────
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False)
print('CHAR GLB', os.path.getsize(OUT_GLB))

# ── 초상 렌더 ─────────────────────────────────────────────
world = bpy.data.worlds.new('W')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
col.objects.link(sun)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
cam.data.lens = 60
col.objects.link(cam)
scene.camera = cam
t = Vector((0, 0, 0.9))
cam.location = Vector((1.3, -3.1, 1.5))
cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
# 인사하는 포즈
bpy.data.objects['ShoulderR'].rotation_euler = (0, math.radians(-150), 0)
bpy.data.objects['HeadPivot'].rotation_euler = (0, math.radians(8), math.radians(-10))
sh.hide_render = True
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.quality = 90
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = OUT_IMG
bpy.ops.render.render(write_still=True)
print('DONE')
