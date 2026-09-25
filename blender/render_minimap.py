# ─────────────────────────────────────────────────────────────
# 걷기 모드 미니맵 — sungshin_map.blend 를 위에서 정사영으로 렌더
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b blender/sungshin_map.blend -P blender/render_minimap.py
#
#   출력 : images/minimap.webp  (1024×1024, 원점 = 이미지 중앙, 한 변 = 지름 1120m)
# ─────────────────────────────────────────────────────────────
import bpy, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
R = 560.0
scene = bpy.context.scene

for o in scene.objects:
    if o.name.startswith(('Pin_', 'Base', 'Rim', 'Trunks')) or o.type == 'CAMERA':
        o.hide_render = True

cam_d = bpy.data.cameras.new('TopCam')
cam_d.type = 'ORTHO'
cam_d.ortho_scale = R * 2
cam_d.clip_start = 1
cam_d.clip_end = 3000
cam = bpy.data.objects.new('TopCam', cam_d)
scene.collection.objects.link(cam)
cam.location = (0, 0, 1500)
cam.rotation_euler = (0, 0, 0)
scene.camera = cam

sun = scene.objects.get('Sun')
if sun:
    sun.rotation_euler = (math.radians(25), math.radians(10), math.radians(-35))
    sun.data.energy = 2.2

scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.quality = 85
scene.view_settings.view_transform = 'Standard'
scene.view_settings.exposure = -0.2
scene.render.filepath = os.path.join(ROOT, 'images', 'minimap.webp')
bpy.ops.render.render(write_still=True)
print('MINIMAP DONE')
