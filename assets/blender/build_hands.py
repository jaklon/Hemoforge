"""Original CC0 skinned nitrile gloves and lab sleeves, built in Blender.

Run with __file__ set to this script's absolute path in Blender Python Console.
Preserves existing scenes; no downloads, add-ons or baked process timeline.
"""
import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets' / 'blender'
OUT = ROOT / 'public' / 'virtual-lab' / 'hands'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('HemoForge | Articulated operator gloves')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.world = bpy.data.worlds.new('Glove studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
scene.view_settings.view_transform = 'AgX'

def xyz(p):
    return Vector((p[0], -p[2], p[1]))

def empty(name, parent=None):
    ob = bpy.data.objects.new(name, None)
    scene.collection.objects.link(ob)
    ob.parent = parent
    return ob

def material(name, color, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*color, 1)
    return m

glove = material('Original blue nitrile', (.035, .22, .34), .64)
coat = material('Original woven lab coat', (.73, .77, .73), .87)
root = empty('HF_Hands')
root['license'] = 'CC0-1.0'
root['purpose'] = 'Two skinned operator gloves; runtime inspection only, never a sensor or actuator command'
required = ['HF_Hands']
finger_lengths = {'Index': (.041, .025, .021), 'Middle': (.046, .029, .022),
                  'Ring': (.042, .027, .021), 'Little': (.033, .022, .019),
                  'Thumb': (.033, .026, .023)}

for side, sign in [('L', -1), ('R', 1)]:
    hand = empty('HF_Hand_' + side, root)
    required.append(hand.name.split('.')[0])
    data = bpy.data.armatures.new('Operator ' + side + ' skeleton')
    rig = bpy.data.objects.new('HF_' + side + '_Rig', data)
    scene.collection.objects.link(rig)
    rig.parent = hand
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        b = data.edit_bones.new('HF_' + side + '_' + name)
        b.head, b.tail = xyz(head), xyz(tail)
        if parent:
            b.parent = data.edit_bones['HF_' + side + '_' + parent]
        return b.name
    bone('Wrist', (0, -.13, 0), (0, 0, 0))
    bone('Palm', (0, 0, 0), (0, .105, 0), 'Wrist')
    paths = {}
    for name, x, y, radius in [('Index', -.028, .102, .0104), ('Middle', -.006, .114, .011),
                                ('Ring', .017, .105, .0103), ('Little', .037, .086, .0088),
                                ('Thumb', -.035, .026, .013)]:
        lengths = finger_lengths[name]
        direction = Vector((-.68, .73, -.07)) if name == 'Thumb' else Vector((x * .6, 1, -.045))
        direction.normalize()
        p = Vector((x, y, 0))
        points = [p.copy()]
        for length in lengths:
            p += direction * length
            points.append(p.copy())
        mirrored = [(p.x * sign, p.y, p.z) for p in points]
        paths[name] = (mirrored, radius)
        for i in range(3):
            bname = bone(name + str(i + 1), mirrored[i], mirrored[i + 1], 'Palm' if i == 0 else name + str(i))
            required.append(bname)
    bpy.ops.object.mode_set(mode='OBJECT')
    vertices, faces, weights, materials = [], [], [], []
    wrist = 'HF_' + side + '_Wrist'
    palm = 'HF_' + side + '_Palm'

    def append_loft(rings, ring_weights, mat_index=0, segments=16):
        """rings: centre, lateral direction, depth direction, two ellipse radii."""
        offset = len(vertices)
        reverse = Vector(rings[0][1]).cross(Vector(rings[0][2])).dot(Vector(rings[1][0])-Vector(rings[0][0])) < 0
        start_face = len(faces)
        for j, (centre, lateral, depth, rx, rz) in enumerate(rings):
            for k in range(segments):
                a = k * math.tau / segments
                p = Vector(centre) + Vector(lateral)*math.cos(a)*rx + Vector(depth)*math.sin(a)*rz
                vertices.append(xyz(p))
                weights.append(ring_weights[j])
        for j in range(len(rings) - 1):
            for k in range(segments):
                n = (k + 1) % segments
                faces.append((offset+j*segments+k, offset+j*segments+n, offset+(j+1)*segments+n, offset+(j+1)*segments+k))
                materials.append(mat_index)
        faces.extend([tuple(offset+k for k in reversed(range(segments))), tuple(offset+(len(rings)-1)*segments+k for k in range(segments))])
        materials.extend([mat_index, mat_index])
        if reverse:
            faces[start_face:] = [tuple(reversed(face)) for face in faces[start_face:]]

    # Anatomical palm taper: wrist, thenar width, metacarpals and knuckle arch.
    rings, ww = [], []
    for y, rx, rz in [(-.065,.029,.019), (-.035,.032,.021), (0,.037,.023), (.035,.045,.024), (.07,.046,.023), (.1,.04,.018), (.115,.031,.014)]:
        rings.append(((0,y,0), (1,0,0), (0,0,1), rx,rz))
        p = max(0, min(1, (y+.035)/.05))
        ww.append({wrist: 1-p, palm: p})
    append_loft(rings, ww, segments=24)
    # Sleeve bell, stitched hem and rolled nitrile cuff; soft ring creases.
    rings = [((0,y,0),(1,0,0),(0,0,1),rx,rz) for y,rx,rz in
             [(-.36,.057,.041),(-.28,.052,.037),(-.2,.046,.033),(-.12,.039,.027),(-.075,.033,.023),(-.065,.032,.022),(-.06,.034,.024)]]
    append_loft(rings, [{wrist:1}]*len(rings), 1, 24)
    rings = [((0,y,0),(1,0,0),(0,0,1),r,r*.69) for y,r in
             [(-.067,.033),(-.064,.035),(-.06,.035),(-.057,.032),(-.049,.032),(-.046,.033),(-.043,.031)]]
    append_loft(rings, [{wrist:1}]*len(rings), segments=24)
    for name, (points, radius) in paths.items():
        pts = list(map(Vector, points))
        lengths = finger_lengths[name]
        total = sum(lengths)
        direction = (pts[-1]-pts[0]).normalized()
        lateral = Vector((direction.y, -direction.x, 0)).normalized()
        depth = direction.cross(lateral).normalized()
        rings, ww = [], []
        samples = [0, .09, .2, .3, .4, .48, .54, .62, .69, .76, .83, .9, .95, .985, 1]
        for t in samples:
            d = t * total
            p = pts[0] + direction*d
            tip = math.sqrt(max(.001, 1-((t-.88)/.125)**2)) if t > .88 else 1
            r = radius * (1-.24*t) * tip
            # Slight folds around joints, authored as geometry, not remote textures.
            r *= 1 + .055*math.cos(t*math.pi*12)*(1-t)
            rings.append((p, lateral, depth, max(.0004,r), max(.0004,r*.86)))
            index = 0 if d < lengths[0] else 1 if d < lengths[0]+lengths[1] else 2
            w = {'HF_'+side+'_'+name+str(index+1):1}
            for j, boundary in [(0,lengths[0]),(1,lengths[0]+lengths[1])]:
                if abs(d-boundary) < .008:
                    blend = (d-boundary+.008)/.016
                    w = {'HF_'+side+'_'+name+str(j+1):1-blend, 'HF_'+side+'_'+name+str(j+2):blend}
            if t == 0:
                w = {palm:.45, 'HF_'+side+'_'+name+'1':.55}
            ww.append(w)
        append_loft(rings, ww)
    mesh = bpy.data.meshes.new('Continuous weighted glove ' + side)
    # xyz converts from Y-up with a positive determinant, so retain winding.
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ob = bpy.data.objects.new('HF_' + side + '_Glove', mesh)
    scene.collection.objects.link(ob)
    ob.parent = rig
    mesh.materials.append(glove)
    mesh.materials.append(coat)
    for poly, material_id in zip(mesh.polygons, materials):
        poly.material_index = material_id
        poly.use_smooth = True
    for name in [b.name for b in data.bones]:
        group = ob.vertex_groups.new(name=name)
        for i, w in enumerate(weights):
            if w.get(name, 0) > 0:
                group.add([i], w[name], 'REPLACE')
    mod = ob.modifiers.new('Operator finger articulation', 'ARMATURE')
    mod.object = rig
    ob['animation_contract'] = 'Runtime bone poses; no independent baked process time'
    bpy.ops.object.select_all(action='DESELECT')

bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for ob in root.children_recursive:
    ob.select_set(True)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
active_scene = {k:True for k in ('use_active_scene','export_active_scene') if k in props}
if not active_scene:
    raise RuntimeError('Active scene export is required')
dest = OUT / 'operator-hands.glb'
bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True,
                          export_extras=True, export_animations=False, export_cameras=False,
                          export_lights=False, **active_scene)
raw = dest.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+length])
for node in doc['nodes']:
    if node.get('name','').startswith('HF_'):
        node['name'] = node['name'].split('.')[0]
encoded = json.dumps(doc,separators=(',',':')).encode()
encoded += b' '*((-len(encoded))%4)
tail = raw[20+length:]
dest.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
manifest = {'license':'CC0-1.0','author':'HemoForge project contributors','blender':bpy.app.version_string,
            'source':'assets/blender/build_hands.py','file':'operator-hands.glb','bytes':dest.stat().st_size,
            'skins':len(doc.get('skins',[])),'meshes':len(doc['meshes']),
            'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),
            'required_nodes':required,'materials':'Original local blue nitrile and woven coat; no downloads',
            'runtime_notice':'Inspection gesture is visual only. No sensor or actuator writes; poses advance only with valid rendered simulation time.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(ROOT/'.cache'/'hands-build-result.json').write_text(json.dumps(manifest),encoding='utf-8')
# Inspection poses in source only: exported skins above remain neutral.
for side, x in [('L',-.09),('R',.09)]:
    hand = next(ob for ob in root.children if ob.name.split('.')[0] == 'HF_Hand_'+side)
    hand.location = xyz((x,0,0))
    rig = next(ob for ob in hand.children if ob.type == 'ARMATURE')
    # Editable Blender-only pose study. Export above deliberately omits it;
    # browser motion is gated by actual visible simulation time and sensor QC.
    for frame, reach in [(1,0),(24,0),(54,1),(84,1),(114,0),(144,0)]:
        for name in finger_lengths:
            for joint in (1,2,3):
                pose = rig.pose.bones['HF_'+side+'_'+name+str(joint)]
                pose.rotation_mode = 'XYZ'
                rest = (.18 if name == 'Thumb' else .22) + (.12 if joint == 2 else 0)
                point = .015 if name == 'Index' else .38 if name == 'Thumb' else .7 + (.22 if joint == 2 else 0)
                pose.rotation_euler.x = -(rest+(point-rest)*reach*(1 if side == 'R' else .16))
                pose.keyframe_insert(data_path='rotation_euler',frame=frame,group=name)
    if rig.animation_data and rig.animation_data.action:
        rig.animation_data.action.name = 'HF_'+side+'_Inspection_pose_study'
scene.frame_start, scene.frame_end = 1,144
scene.frame_set(1)
camera_data = bpy.data.cameras.new('Glove inspection')
camera = bpy.data.objects.new('Glove inspection',camera_data)
scene.collection.objects.link(camera)
camera.location = xyz((.2,.15,.8))
camera.rotation_euler=(xyz((0,-.02,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type, camera_data.ortho_scale = 'ORTHO', .65
scene.camera = camera
for name,pos,power in [('Key',(-1,1,2),180),('Fill',(1,.5,1),90)]:
    data = bpy.data.lights.new('Glove '+name,'AREA')
    data.energy, data.size = power, 2
    light = bpy.data.objects.new('Glove '+name,data)
    scene.collection.objects.link(light)
    light.location = xyz(pos)
    light.rotation_euler = (-light.location).to_track_quat('-Z','Y').to_euler()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.region_3d.view_distance = .8
            space.region_3d.view_location = xyz((0,-.03,0))
            space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
            space.shading.type = 'MATERIAL'
            space.overlay.show_overlays = False
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'hemoforge-operator-hands.blend'))
print('HEMOFORGE_HANDS_READY',json.dumps(manifest))
