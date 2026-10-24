"""Original CC0 bioprocess laboratory, authored in Blender for Monitor 01.

Run in Blender's Python Console with __file__ set to this file's absolute path.
Creates a separate scene; existing scenes are preserved. No downloads/add-ons.
All supporting equipment is static scenery, never a simulated sensor source.
"""
import bpy
import json
import math
import random
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets' / 'blender'
OUT = ROOT / 'public' / 'virtual-lab' / 'laboratory'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('HemoForge | Bioprocess laboratory')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.world = bpy.data.worlds.new('Laboratory daylight')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
scene.view_settings.view_transform = 'AgX'

def xyz(p):
    return Vector((p[0], -p[2], p[1]))

def empty(name, parent=None, pos=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = xyz(pos)
    return ob

root = empty('HF_Laboratory')
root['license'] = 'CC0-1.0'
root['purpose'] = 'Static laboratory scenery; no measurements, control logic or baked simulation'
static = empty('HF_Lab_Static', root)
for name, pos in [('Casework', (-4.4, 1, -3.1)), ('Washstation', (-4.9, 1, -3.1)),
                  ('CleanBench', (3.6, 1, -3.1)), ('Incubator', (5.1, 1, -1.3)),
                  ('Centrifuge', (2.8, 1, -3.1)), ('GasRack', (-3.4, 0, -1.85)),
                  ('TraceTable', (2.05, 0, -1.5)), ('HVAC', (0, 4, -2))]:
    marker = empty('HF_Lab_' + name, root, pos)
    marker['scenery_only'] = True

def material(name, color, metal=0, rough=.5, emission=0):
    mat = bpy.data.materials.new('Lab ' + name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    mat.diffuse_color = (*color, 1)
    if emission:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emission
    return mat

ivory = material('warm powder coat', (.75, .79, .77), .06, .4)
wall = material('mineral white wall', (.67, .72, .7), 0, .83)
sage = material('sage cabinet laminate', (.25, .38, .36), .08, .43)
dark = material('graphite phenolic', (.028, .044, .049), .1, .36)
rubber = material('EPDM and castors', (.012, .02, .022), 0, .78)
steel = material('satin stainless', (.44, .5, .53), 1, .34)
silver = material('anodized aluminium', (.55, .59, .6), .85, .36)
glass = material('frosted observation glazing', (.28, .48, .52), .32, .25)
blue = material('blue polypropylene', (.035, .23, .39), .05, .4)
teal = material('teal polypropylene', (.018, .3, .29), .05, .4)
amber = material('amber reagent polymer', (.38, .18, .045), .1, .3)
paper = material('matte label', (.84, .86, .8), 0, .7)
light = material('LED diffuser', (.8, .92, .93), 0, .38, 1.5)
floor_mat = material('seamless speckled epoxy', (.36, .43, .41), .08, .55)
grain = bpy.data.images.load(str(SOURCE / 'brushed-roughness.png'), check_existing=True)
grain.colorspace_settings.name = 'Non-Color'
grain.pack()
tex = steel.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = grain
steel.node_tree.links.new(tex.outputs['Color'], steel.node_tree.nodes['Principled BSDF'].inputs['Roughness'])

# Original, seeded seamless epoxy texture; all 512px pixels generated locally.
rng = random.Random(411)
size = 512
pixels = []
for i in range(size * size):
    v = rng.uniform(-.026, .026)
    fleck = rng.random()
    if fleck < .017:
        v += .11
    elif fleck > .988:
        v -= .08
    pixels.extend((.36 + v, .43 + v, .41 + v, 1))
image = bpy.data.images.new('Original seeded epoxy 512', width=size, height=size)
image.pixels.foreach_set(pixels)
image.filepath_raw = str(SOURCE / 'lab-epoxy.png')
image.file_format = 'PNG'
image.save()
image.pack()
tex = floor_mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
floor_mat.node_tree.links.new(tex.outputs['Color'], floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

def finish(ob, name, mat, smooth=False):
    ob.name = name
    ob.parent = static
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = smooth
    return ob

def box(name, size, pos, mat, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    ob = bpy.context.object
    ob.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(ob, name, mat)
    if bevel:
        mod = ob.modifiers.new('Soft manufactured edge', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = ob.modifiers.new('Face weighted normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob

def cyl(name, radius, height, pos, mat, axis=(0, 1, 0), verts=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=height, location=xyz(pos))
    ob = bpy.context.object
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(xyz(axis).normalized())
    return finish(ob, name, mat, True)

def tube(name, points, radius, mat):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u, cu.bevel_depth, cu.bevel_resolution = 5, radius, 1
    spline = cu.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for bp, p in zip(spline.bezier_points, points):
        bp.co = xyz(p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    ob.parent = static
    cu.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    return ob

def text(value, pos, size=.08, mat=paper):
    cu = bpy.data.curves.new('Lab lettering', 'FONT')
    cu.body, cu.size, cu.align_x, cu.align_y = value, size, 'CENTER', 'CENTER'
    cu.extrude, cu.resolution_u = .0001, 2
    ob = bpy.data.objects.new(value, cu)
    scene.collection.objects.link(ob)
    ob.parent, ob.location, ob.rotation_euler = static, xyz(pos), (math.pi / 2, 0, 0)
    cu.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    return ob

def sign(value, pos, width, height=.19, size=.085):
    box('Engraved room signage', (width, height, .025), pos, dark, .006)
    text(value, (pos[0], pos[1], pos[2] + .014), size)

# Open front cutaway keeps all existing camera stations unobstructed.
floor = box('HF_Lab_Floor', (12, .16, 13), (0, -.085, 2.3), floor_mat, .015)
for uv in floor.data.uv_layers.active.data:
    uv.uv *= 12
box('Rear insulated wall', (12, 4.2, .16), (0, 2.1, -4.25), wall)
for x in (-6, 6):
    box('Side insulated wall', (.16, 4.2, 9.3), (x, 2.1, .32), wall)
    box('Hygienic coved skirting', (.09, .16, 9.2), (x * .986, .08, .32), silver, .035)
    box('Wall rail', (.08, .08, 8.9), (x * .985, 1.12, .32), sage)
box('Rear coved skirting', (11.9, .16, .09), (0, .08, -4.13), silver, .035)
for x in (-4, -2, 0, 2, 4):
    box('Rear wall panel joint', (.012, 4.05, .012), (x, 2.1, -4.163), silver, .001)
box('Ceiling acoustic plane', (12, .12, 8), (0, 4.25, -.15), ivory)
for x in (-4, 0, 4):
    for z in (-2.8, 1.4):
        box('Recessed LED frame', (1.3, .07, .7), (x, 4.15, z), silver)
        box('Opal LED panel', (1.2, .018, .6), (x, 4.105, z), light)
for x in (-2.2, 2.2):
    box('HVAC return bezel', (.8, .055, 1.15), (x, 4.1, -1.2), silver)
    box('HVAC return shadow', (.69, .02, 1.04), (x, 4.065, -1.2), dark)
    for z in range(13):
        box('HVAC louver', (.7, .015, .027), (x, 4.04, -1.68 + z * .08), ivory, .002)

# Back observation glazing, dark gaskets, mullions and a restrained wall identity.
box('Observation frame', (3.3, 1.45, .055), (-3.9, 2.55, -4.12), silver)
box('Observation EPDM seal', (3.2, 1.35, .025), (-3.9, 2.55, -4.08), rubber)
box('Frosted observation pane', (3.12, 1.27, .025), (-3.9, 2.55, -4.06), glass)
for x in (-4.44, -3.36):
    box('Window mullion', (.036, 1.3, .06), (x, 2.55, -4.025), silver)
box('Identity inset', (4.2, .95, .045), (.15, 2.9, -4.11), sage)
text('HEMOFORGE', (.15, 3.01, -4.08), .3)
text('BIOPROCESS LABORATORY', (.15, 2.68, -4.08), .092)
sign('01  /  CULTURE SUITE', (3.9, 3.55, -4.1), 2.5, .26, .11)
# Flush service door, vision panel and lever.
box('Door reveal', (1.42, 2.64, .075), (4.5, 1.32, -4.12), silver)
box('Door gasket', (1.32, 2.55, .04), (4.5, 1.3, -4.06), rubber)
box('Service door', (1.26, 2.49, .04), (4.5, 1.3, -4.03), ivory)
box('Door vision frame', (.48, .82, .03), (4.5, 1.8, -4), silver)
box('Door vision panel', (.4, .74, .015), (4.5, 1.8, -3.98), glass)
cyl('Lever escutcheon', .045, .035, (4.93, 1.09, -3.98), steel, (0, 0, 1))
tube('Door lever', [(4.93, 1.09, -3.95), (4.93, 1.09, -3.88), (4.73, 1.09, -3.88)], .014, steel)
box('Kick plate', (1.15, .3, .015), (4.5, .23, -3.996), steel)

def bench(cx, width, z=-3.05):
    box('Recessed cabinet plinth', (width - .09, .11, .86), (cx, .06, z), dark)
    box('Casework carcass', (width, .78, 1), (cx, .5, z), ivory)
    box('Phenolic worktop', (width + .08, .075, 1.1), (cx, .935, z), dark, .014)
    box('Worktop backsplash', (width + .05, .13, .05), (cx, 1.02, z - .52), dark)
    n = max(1, round(width / .65))
    w = (width - .06) / n
    for i in range(n):
        x = cx - width / 2 + .03 + w * (i + .5)
        box('Inset cabinet front', (w - .022, .68, .027), (x, .51, z + .515), sage, .004)
        for y in (.34, .57):
            box('Drawer reveal', (w - .04, .008, .008), (x, y, z + .534), dark, .001)
        for y in (.45, .68):
            tube('Brushed pull handle', [(x - .09, y, z + .545), (x - .09, y, z + .57), (x + .09, y, z + .57), (x + .09, y, z + .545)], .008, steel)
bench(-4.4, 2.8)
bench(1.9, 2.55)
sign('PREPARATION / WASH', (-4.4, 1.62, -4.1), 2.7, .2, .085)
sign('CULTURE SUPPORT', (1.9, 1.62, -4.1), 2.5, .2, .085)

# Inset stainless wash basin with a genuine recess assembled from thin surfaces.
box('Sink rim', (.65, .025, .51), (-4.95, .987, -3.05), steel, .015)
box('Sink recessed well', (.55, .008, .4), (-4.95, .998, -3.05), dark)
for x in (-5.23, -4.67):
    box('Basin side', (.025, .065, .41), (x, 1.02, -3.05), steel, .012)
for z in (-3.255, -2.845):
    box('Basin lip', (.58, .025, .025), (-4.95, 1.025, z), steel, .01)
cyl('Drain flange', .035, .008, (-4.95, 1.005, -3.05), silver)
tube('Gooseneck faucet', [(-4.95, .98, -3.39), (-4.95, 1.27, -3.39), (-4.95, 1.37, -3.15), (-4.95, 1.25, -3.06)], .018, steel)
cyl('Mixer base', .045, .035, (-4.95, 1, -3.39), steel)
box('Wall dispenser', (.16, .29, .11), (-5.45, 1.44, -4.04), ivory)
box('Paper towel housing', (.34, .25, .14), (-4.92, 1.48, -4.025), silver)
box('Paper towel tail', (.22, .12, .008), (-4.92, 1.3, -3.95), paper, .001)

def bottle(x, z, h=.22, cap=teal):
    cyl('Reagent bottle', .052, h, (x, .982 + h/2, z), amber)
    cyl('Bottle shoulder', .045, .025, (x, .992 + h, z), amber)
    cyl('Screw cap', .038, .035, (x, 1.02 + h, z), cap)
    box('Reagent label', (.069, .07, .004), (x, 1 + h/2, z + .051), paper, .001)
for i in range(4):
    bottle(-3.96 + i * .16, -3.3, .17 + .025*(i % 2), blue if i % 2 else teal)
box('Tip box base', (.2, .075, .14), (-3.7, 1.01, -2.83), blue)
box('Tip box lid', (.21, .018, .15), (-3.7, 1.058, -2.83), ivory)
box('Pipette stand base', (.24, .025, .2), (-3.24, .987, -3.1), steel)
box('Pipette stand upright', (.025, .35, .03), (-3.24, 1.16, -3.18), steel)
box('Pipette fork', (.26, .025, .06), (-3.24, 1.33, -3.16), steel)
for x, col in [(-3.32, blue), (-3.22, teal), (-3.12, ivory)]:
    cyl('Pipette body', .018, .18, (x, 1.29, -3.115), ivory)
    cyl('Pipette cone', .008, .15, (x, 1.12, -3.115), col)
    cyl('Pipette plunger', .012, .055, (x, 1.4, -3.115), col)

# Benchtop centrifuge, analytical balance and racks: no live values on scenery.
box('Centrifuge lower shell', (.58, .24, .51), (2.62, 1.1, -3.1), ivory, .04)
box('Centrifuge lid gasket', (.57, .023, .5), (2.62, 1.23, -3.1), rubber, .025)
box('Centrifuge lid', (.57, .055, .5), (2.62, 1.268, -3.1), ivory, .025)
box('Centrifuge front insert', (.39, .09, .014), (2.62, 1.09, -2.837), dark)
text('STANDBY', (2.56, 1.09, -2.825), .027)
cyl('Centrifuge control', .025, .025, (2.79, 1.09, -2.82), steel, (0, 0, 1))
box('Balance body', (.36, .07, .31), (1.43, 1.005, -2.97), ivory)
cyl('Stainless weighing pan', .115, .018, (1.43, 1.055, -3.02), steel, verts=32)
box('Balance inactive face', (.2, .027, .008), (1.43, 1.01, -2.81), dark)
box('Tube rack', (.32, .06, .16), (.94, 1.005, -3.3), blue)
for x in range(5):
    for z in range(2):
        cyl('Capped sterile tube', .012, .085, (.82 + x*.06, 1.075, -3.34 + z*.075), ivory, verts=12)
        cyl('Tube cap', .015, .016, (.82 + x*.06, 1.126, -3.34 + z*.075), teal, verts=12)

# Upright culture-support cabinet. Window is opaque frosted glazing: cheap to render.
box('Incubator chassis', (.93, 1.82, .9), (5.12, 1.01, -1.8), ivory, .035)
box('Incubator base shadow', (.85, .11, .8), (5.12, .11, -1.8), rubber)
box('Incubator door gasket', (.82, 1.38, .045), (5.12, 1.01, -1.32), rubber)
box('Incubator door', (.78, 1.34, .045), (5.12, 1.01, -1.285), silver)
box('Incubator observation inset', (.51, .9, .025), (5.08, 1.07, -1.25), glass)
tube('Incubator handle', [(5.46, .8, -1.25), (5.46, .8, -1.19), (5.46, 1.28, -1.19), (5.46, 1.28, -1.25)], .014, steel)
box('Incubator control fascia', (.72, .16, .025), (5.12, 1.82, -1.33), dark)
text('CULTURE SUPPORT', (5.12, 1.82, -1.31), .045)
for i in range(9):
    box('Lower ventilation slot', (.045, .045, .012), (4.83 + i*.072, .21, -1.332), dark, .003)

# A compact clean work enclosure on the left: steel work deck, sash and HEPA grille.
box('Clean enclosure base', (1.23, .1, .82), (-1.55, .94, -3.28), steel)
for x in (-2.12, -.98):
    box('Clean enclosure leg', (.065, .88, .63), (x, .46, -3.28), silver)
    box('Enclosure upright', (.07, 1.05, .72), (x, 1.5, -3.28), ivory)
box('Enclosure rear', (1.18, 1.03, .045), (-1.55, 1.5, -3.66), ivory)
box('Enclosure upper canopy', (1.23, .25, .83), (-1.55, 2, -3.28), ivory, .018)
box('HEPA grille backing', (1.08, .015, .56), (-1.55, 1.855, -3.28), dark)
for i in range(17):
    box('HEPA grille slat', (.018, .018, .54), (-2.04 + i*.06, 1.835, -3.28), silver, .001)
box('Work enclosure light', (.87, .015, .075), (-1.55, 1.82, -3.02), light)
box('Sash bottom rail', (1.12, .035, .035), (-1.55, 1.51, -2.88), silver)
box('Raised frosted sash', (1.07, .29, .012), (-1.55, 1.68, -2.885), glass)
text('CLEAN WORK ENCLOSURE', (-1.55, 2.01, -2.85), .058, dark)

# Trace support table matches the live instrument's existing placement precisely.
box('Trace phenolic worktop', (1.7, .08, 1.13), (2.05, .98, -1.5), dark, .014)
for x in (1.33, 2.77):
    for z in (-1.97, -1.03):
        box('Trace table steel leg', (.04, .88, .04), (x, .47, z), steel)
        cyl('Trace table levelling foot', .036, .04, (x, .03, z), rubber)
box('Trace table under shelf', (1.5, .035, .96), (2.05, .23, -1.5), silver)
for x in (1.55, 1.95):
    box('Wrapped consumables', (.28, .16, .35), (x, .33, -1.5), ivory)
    box('Consumables seal', (.05, .165, .35), (x, .33, -1.5), teal)

# Gas bank retains the existing path's origin and clearly separated regulators.
box('Gas rack tray', (1.12, .06, .48), (-3.38, .04, -1.85), dark)
for x in (-3.91, -2.85):
    box('Gas rack upright', (.035, 1.45, .035), (x, .75, -2.05), steel)
box('Gas restraint crossbar', (1.09, .045, .04), (-3.38, 1.03, -2.05), steel)
for i, col in enumerate((silver, blue, dark)):
    x = -3.7 + i*.32
    cyl('Gas cylinder body', .125, 1.16, (x, .67, -1.85), col, verts=28)
    cyl('Cylinder shoulder', .09, .1, (x, 1.29, -1.85), col)
    cyl('Cylinder neck', .025, .1, (x, 1.38, -1.85), steel)
    cyl('Regulator block', .035, .1, (x, 1.43, -1.8), steel, (0, 0, 1))
    cyl('Pressure gauge bezel', .055, .025, (x, 1.48, -1.73), steel, (0, 0, 1), 28)
    cyl('Gauge blank face', .045, .005, (x, 1.48, -1.712), paper, (0, 0, 1), 28)
    box('Static gauge needle', (.004, .029, .004), (x, 1.49, -1.707), dark, .001)
    cyl('Valve handwheel', .046, .018, (x, 1.46, -1.85), blue)
    box('Cylinder identification', (.09, .2, .008), (x, .89, -1.723), paper, .001)
    text(('AIR', 'O2', 'N2')[i], (x, .89, -1.715), .045, dark)
tube('Gas restraint', [(-3.94, 1.02, -2.04), (-3.89, 1.02, -1.68), (-3.35, 1.02, -1.66), (-2.84, 1.02, -1.7), (-2.82, 1.02, -2.04)], .012, steel)

# Mobile utility trolley and lab stool, away from all reactor/service paths.
for y in (.28, .76):
    box('Trolley tray', (.66, .04, .43), (4.35, y, .65), steel)
for x in (4.05, 4.65):
    for z in (.47, .83):
        cyl('Trolley upright', .016, .74, (x, .5, z), steel)
        cyl('Trolley castor', .04, .028, (x, .07, z), rubber, (1, 0, 0), 16)
tube('Trolley push bar', [(4.65, .75, .47), (4.65, .92, .47), (4.65, .92, .83), (4.65, .75, .83)], .015, steel)
box('Trolley sterile packs', (.4, .12, .25), (4.28, .84, .65), ivory)
cyl('Stool padded seat', .22, .07, (-4.75, .65, .8), dark, verts=32)
cyl('Stool gas lift', .025, .51, (-4.75, .35, .8), steel)
for i in range(5):
    a = i * math.tau / 5
    x, z = -4.75 + math.cos(a)*.25, .8 + math.sin(a)*.25
    tube('Stool foot spider', [(-4.75, .15, .8), (x, .09, z)], .016, steel)
    cyl('Stool castor', .032, .026, (x, .045, z), rubber, (1, 0, 0), 12)

# Merge scenery by material: original detail with a bounded number of draw calls.
groups = {}
for ob in list(static.children):
    if ob.type == 'MESH':
        groups.setdefault(ob.data.materials[0].name, []).append(ob)
for name, objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    bpy.context.object.name = 'HF_Lab_' + name.replace('Lab ', '').replace(' ', '_')

bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for ob in root.children_recursive:
    ob.select_set(True)
dest = OUT / 'laboratory.glb'
properties = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
active_scene = {key: True for key in ('use_active_scene', 'export_active_scene') if key in properties}
if not active_scene:
    raise RuntimeError('An active-scene glTF export option is required')
bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True,
                          export_extras=True, export_animations=False, export_cameras=False,
                          export_lights=False, **active_scene)
raw = dest.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+length])
for node in doc['nodes']:
    if node.get('name', '').startswith('HF_'):
        node['name'] = node['name'].split('.')[0]
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
tail = raw[20+length:]
dest.write_bytes(struct.pack('<III', 0x46546c67, 2, 20+len(encoded)+len(tail)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
meshes = [ob for ob in root.children_recursive if ob.type == 'MESH']
manifest = {'license': 'CC0-1.0', 'author': 'HemoForge project contributors',
            'blender': bpy.app.version_string, 'source': 'assets/blender/build_lab.py',
            'file': 'laboratory.glb', 'bytes': dest.stat().st_size, 'meshes': len(meshes),
            'triangles': sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in meshes),
            'required_nodes': ['HF_Laboratory', 'HF_Lab_Static', 'HF_Lab_Casework', 'HF_Lab_Washstation', 'HF_Lab_CleanBench', 'HF_Lab_Incubator', 'HF_Lab_Centrifuge', 'HF_Lab_GasRack', 'HF_Lab_TraceTable', 'HF_Lab_HVAC'],
            'textures': 'Original local 512px epoxy and brushed roughness, embedded; no network resources',
            'runtime_notice': 'Static scenery only. No measurement values, baked animation, lights or cameras are exported. Equipment dimensions and layout are illustrative.'}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
(ROOT / '.cache' / 'laboratory-build-result.json').write_text(json.dumps(manifest), encoding='utf-8')

# Source preview: saved camera is deliberately inside the open-front cutaway.
for name, pos, power, size in [('Window', (-4, 3.6, 2), 1000, 5), ('Ceiling', (1, 4, 0), 1400, 5), ('Fill', (4, 3, 3), 650, 4)]:
    data = bpy.data.lights.new('Lab ' + name, 'AREA')
    data.energy, data.size = power, size
    ob = bpy.data.objects.new('Lab ' + name, data)
    scene.collection.objects.link(ob)
    ob.location = xyz(pos)
    ob.rotation_euler = (xyz((0, .8, -1))-ob.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Laboratory inspection')
camera = bpy.data.objects.new('Laboratory inspection', data)
scene.collection.objects.link(camera)
camera.location = xyz((.5, 2.65, 7.5))
camera.rotation_euler = (xyz((0, 1.7, -1.5))-camera.location).to_track_quat('-Z', 'Y').to_euler()
data.lens = 24
scene.camera = camera
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.region_3d.view_distance = 10
            space.region_3d.view_location = xyz((0, 1.7, -1))
            space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
            space.shading.type = 'MATERIAL'
            space.overlay.show_overlays = False
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'hemoforge-laboratory.blend'))
print('HEMOFORGE_LAB_READY', json.dumps(manifest))
