"""Normalize a CC0 reference scan in Blender and export self-contained runtime LODs."""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

root = Path(sys.argv[sys.argv.index('--') + 1])
source = root / 'artifacts/rock-scan-source/rock_09_2k.gltf'
target = root / 'outputs/geo-sim/assets/scanned'
target.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if len(meshes) != 1:
    raise RuntimeError(f'Expected one reference mesh, got {len(meshes)}')
obj = meshes[0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
world = obj.matrix_world.copy()
obj.parent = None
obj.matrix_world = world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
points = [v.co.copy() for v in obj.data.vertices]
low = Vector(tuple(min(p[axis] for p in points) for axis in range(3)))
high = Vector(tuple(max(p[axis] for p in points) for axis in range(3)))
center = (low + high) * 0.5
extent = max(high - low)
for v in obj.data.vertices:
    v.co = (v.co - center) / extent
obj.name = 'Rock09_CC0_Normalized'
obj.data.validate(verbose=True)
obj.data.update()
obj['source'] = 'https://polyhaven.com/a/rock_09'
obj['license'] = 'CC0-1.0'
obj['source_dimensions_m'] = list(high - low)
original = obj.data.copy()
report = {'source':obj['source'], 'license':'CC0-1.0', 'sourceDimensionsM':list(high-low), 'lods':[]}
for label, ratio in [('detail',1.0),('distant',0.22)]:
    obj.data = original.copy()
    if ratio < 1:
        modifier = obj.modifiers.new('Surface-preserving LOD', 'DECIMATE')
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.calc_loop_triangles()
    filename = f'rock-09-{label}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target / filename), export_format='GLB',
        use_selection=True, export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials='EXPORT' if label == 'detail' else 'NONE', export_image_format='AUTO', export_extras=True,
        export_cameras=False, export_lights=False)
    report['lods'].append({'file':filename, 'triangles':len(obj.data.loop_triangles), 'bytes':(target / filename).stat().st_size})
(target / 'rock-09.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
