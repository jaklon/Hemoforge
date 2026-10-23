"""Original HemoForge BIOSTAT-inspired teaching asset; no downloaded assets.

Run in Blender's Python Console with exec(compile(open(__file__).read(), __file__, 'exec'))
or: blender --background --python assets/blender/build_biostat.py
Creates a NEW scene and never removes the user's existing scenes.
Coordinates below are web Y-up; export converts Blender Z-up to glTF Y-up.
"""
import bpy
import math
import json
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'virtual-lab' / 'biostat'
SOURCE = ROOT / 'assets' / 'blender'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
(ROOT / '.cache').mkdir(exist_ok=True)
scene = bpy.data.scenes.new('HemoForge BIOSTAT | browser asset')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1200, 1400
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('HF Studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.45, 0.53, 0.6, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35

def xyz(p):
    return Vector((p[0], -p[2], p[1]))

def empty(name, pos=(0,0,0), parent=None):
    ob = bpy.data.objects.new(name, None)
    scene.collection.objects.link(ob)
    ob.location = xyz(pos)
    ob.parent = parent
    return ob

root = empty('HF_Biostat')
root['asset_version'] = 1
root['license'] = 'CC0-1.0; original HemoForge geometry and generated textures'
root['description'] = 'BIOSTAT STR Gen 2 inspired educational cutaway; not vendor CAD'
root['front_axis'] = '+Z (glTF); dimensions illustrative'
root['liquid_capacity_ml'] = 50000
static = empty('HF_Static', parent=root)
impeller = empty('HF_Impeller', parent=root)
impeller['runtime_binding'] = 'integrated stirrer_rpm; rotations around glTF Y'
liquid = empty('HF_Liquid', (0,0.48,0), root)
liquid['runtime_binding'] = 'scale.y = working_volume_ml / 50000 * 1.4'
bag_group = empty('HF_Bag', parent=root)

def material(name, color, metallic=0, rough=0.4, alpha=1):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color,1)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Alpha'].default_value = alpha
    m.diffuse_color = (*color,alpha)
    if alpha < 1:
        methods=m.bl_rna.properties['surface_render_method'].enum_items.keys()
        m.surface_render_method = 'BLENDED' if 'BLENDED' in methods else 'DITHERED'
        m.use_backface_culling = False
    return m

steel = material('HF | satin brushed stainless', (0.5,0.54,0.57), 1, 0.32)
polish = material('HF | polished clamp steel', (0.65,0.69,0.72), 1, 0.2)
white = material('HF | powder coated ivory', (0.79,0.82,0.82), 0.15, 0.38)
rubber = material('HF | EPDM rubber', (0.019,0.025,0.03), 0, 0.72)
graphite = material('HF | anodized graphite', (0.044,0.064,0.073), 0.65, 0.31)
teal = material('HF | process teal', (0.018,0.22,0.23), 0.2, 0.35)
blue = material('HF | sterile blue connector', (0.035,0.22,0.4), 0.05, 0.38)
gold = material('HF | sensor PEEK', (0.48,0.32,0.12), 0.25, 0.39)
film = material('HF | single use polymer film', (0.78,0.9,0.94), 0, 0.21, 0.16)
seam = material('HF | heat sealed film edge', (0.71,0.84,0.85), 0, 0.3, 0.46)
medium = material('HF | culture medium', (0.48,0.16,0.11), 0, 0.24, 0.55)
led = material('HF | status lens', (0.07,0.7,0.48), 0.1, 0.2)
led.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (0.05,0.5,0.3,1)
led.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.3

# Small, deterministic original texture. No add-on, subscription, or remote file.
import numpy as np
rng = np.random.default_rng(42)
grain = np.clip(0.32 + rng.normal(0,0.025,(512,1)) + rng.normal(0,0.008,(512,512)),0.2,0.45)
rgba = np.ones((512,512,4), dtype=np.float32)
rgba[:,:,:3] = grain[:,:,None]
image = bpy.data.images.new('HF_original_brushed_roughness', width=512, height=512)
image.colorspace_settings.name = 'Non-Color'
image.pixels.foreach_set(rgba.ravel())
image.filepath_raw = str(SOURCE / 'brushed-roughness.png')
image.file_format = 'PNG'
image.save()
image.pack()
tex = steel.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
steel.node_tree.links.new(tex.outputs['Color'],steel.node_tree.nodes['Principled BSDF'].inputs['Roughness'])

def finish(ob, name, mat, parent=static, smooth=True):
    ob.name = name
    ob.parent = parent
    ob.data.materials.append(mat)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob

def bevel(ob, width=0.008, segments=2):
    mod = ob.modifiers.new('Manufactured edge radii','BEVEL')
    mod.width, mod.segments = width,segments
    mod.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    bpy.ops.object.modifier_apply(modifier=mod.name)

def box(name, size, pos, mat, radius=0.008, parent=static):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    ob = bpy.context.object
    ob.dimensions = (size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(ob,name,mat,parent,False)
    if radius:
        bevel(ob,radius)
    return ob

def cyl(name,radius,height,pos,mat,axis=(0,1,0),parent=static,verts=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=height,location=xyz(pos))
    ob=bpy.context.object
    ob.rotation_mode='QUATERNION'
    ob.rotation_quaternion = Vector((0,0,1)).rotation_difference(xyz(axis).normalized())
    finish(ob,name,mat,parent)
    return ob

def torus(name,radius,tube,pos,mat,axis=(0,1,0),parent=static):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=tube,major_segments=64,minor_segments=8,location=xyz(pos))
    ob=bpy.context.object
    ob.rotation_mode='QUATERNION'
    ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(xyz(axis).normalized())
    return finish(ob,name,mat,parent)

def tube(name, points, radius, mat, parent=static):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D'
    curve.resolution_u=8
    curve.bevel_depth=radius
    curve.bevel_resolution=2
    spline=curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for bp,p in zip(spline.bezier_points,points):
        bp.co=xyz(p)
        bp.handle_left_type=bp.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,curve)
    scene.collection.objects.link(ob)
    ob.parent=parent
    ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active=ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    return ob

def text(name, value, pos, size, mat=graphite):
    curve=bpy.data.curves.new(name,'FONT')
    curve.body=value
    curve.size=size
    curve.extrude=0.0003
    curve.align_x='CENTER'
    curve.align_y='CENTER'
    curve.resolution_u=4
    ob=bpy.data.objects.new(name,curve)
    scene.collection.objects.link(ob)
    ob.parent=static
    ob.location=xyz(pos)
    ob.rotation_euler=(math.pi/2,0,0)
    ob.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH')
    return ob

def shell(name,r,y0,y1,start,end,mat,wrinkle=False,parent=static):
    n=80
    rows=28 if wrinkle else 1
    vertices=[]
    for j in range(rows+1):
        t=j/rows
        for i in range(n+1):
            a=start+(end-start)*i/n
            # Heat-sealed bag tapers at its shoulders; shallow wrinkles, not glass.
            shape = (1-0.12*abs(2*t-1)**6) if wrinkle else 1
            ripples = (0.007*math.sin(a*17+t*19)+0.003*math.sin(a*31-t*13))*math.sin(math.pi*t) if wrinkle else 0
            rr=r*shape+ripples
            vertices.append(xyz((rr*math.cos(a),y0+(y1-y0)*t,rr*math.sin(a))))
    faces=[]
    for j in range(rows):
        for i in range(n):
            k=j*(n+1)+i
            faces.append((k,k+1,k+n+2,k+n+1))
    data=bpy.data.meshes.new(name)
    data.from_pydata(vertices,[],faces)
    data.update()
    ob=bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    finish(ob,name,mat,parent)
    return ob

# Four-caster welded sanitary trolley.
box('Trolley welded tray',(1.52,0.1,1.34),(0,0.24,0),steel,0.025)
box('Recessed graphite plinth',(1.24,0.08,1.08),(0,0.305,0),graphite,0.025)
for x in (-0.59,0.59):
    for z in (-0.49,0.49):
        cyl('Caster swivel',0.047,0.09,(x,0.155,z),polish)
        box('Caster fork',(0.1,0.1,0.12),(x,0.105,z),steel,0.012)
        cyl('Rubber caster',0.082,0.07,(x,0.085,z),rubber,(1,0,0),verts=24)
        cyl('Axle cap',0.025,0.076,(x,0.085,z),polish,(1,0,0),verts=16)
        box('Foot brake',(0.11,0.018,0.06),(x,0.14,z+0.055),graphite,0.006)
for x in (-0.64,0.64):
    for z in (-0.44,0.1):
        cyl('Upright frame',0.033,1.7,(x,1.19,z),steel)
        torus('Weld bead',0.034,0.003,(x,0.36,z),polish)
    tube('Sanitary handle',[(x,1.65,-0.4),(x,2.12,-0.4),(x,2.15,0.12),(x,1.9,0.16)],0.026,polish)
    box('Lower brace',(0.065,0.04,1.02),(x,0.42,-0.12),steel)

# Holder is deliberately open at the front for an educational cutaway.
shell('Rear double wall heating jacket',0.704,0.48,1.93,math.pi-0.13,2*math.pi+0.13,steel)
shell('Rear dark insulation liner',0.687,0.48,1.93,math.pi-0.13,2*math.pi+0.13,graphite)
cyl('Jacket base dish',0.704,0.065,(0,0.455,0),steel)
for y in (0.49,1.94):
    torus('Rolled jacket lip',0.704,0.023,(0,y,0),polish)
for x in (-0.7,0.7):
    box('Cutaway edge trim',(0.027,1.42,0.03),(x,1.21,0.075),polish,0.01)
    for y in (0.63,1.15,1.74):
        box('Jacket latch',(0.065,0.1,0.065),(x, y,0.1),steel,0.01)
        cyl('Latch fastener',0.016,0.008,(x,y,0.138),graphite,(0,0,1),verts=12)
        box('Latch grip',(0.025,0.058,0.035),(x,y,0.165),rubber,0.008)

# Flexible single-use polymer bag with welded seams and restrained wrinkles.
shell('Wrinkled polymer bag',0.642,0.49,1.92,0,2*math.pi,film,True,bag_group)
for a in (-0.36,math.pi+0.36):
    tube('Heat sealed side seam',[(0.63*math.cos(a),y,0.63*math.sin(a)) for y in (0.52,0.7,1.2,1.7,1.89)],0.007,seam,bag_group)
for y in (0.51,1.9):
    torus('Bag weld ring',0.575,0.009,(0,y,0),seam,parent=bag_group)
cyl('Culture liquid',0.613,1,(0,0.5,0),medium,parent=liquid,verts=80)
torus('Liquid meniscus',0.605,0.009,(0,0.992,0),medium,parent=liquid)
liquid.scale.z=0.35 # Blender Z becomes glTF Y; preview initial 12.5 L.

# Shaft and two pitched impellers; a separate named runtime-controlled group.
cyl('Impeller drive shaft',0.021,1.49,(0,1.2,0),polish,parent=impeller)
for y in (0.68,1.24):
    cyl('Moulded impeller hub',0.068,0.08,(0,y,0),white,parent=impeller)
    for i in range(3):
        a=i*2*math.pi/3
        wing=box('Pitched impeller blade',(0.31,0.027,0.105),(0.2*math.cos(a),y,0.2*math.sin(a)),white,0.011,impeller)
        wing.rotation_euler=(0.32*math.cos(a),0.32*math.sin(a),-a)
torus('Sparger ring',0.29,0.014,(0,0.54,0),blue)
for i in range(20):
    a=i*math.tau/20
    cyl('Sparger aperture',0.003,0.005,(0.29*math.cos(a),0.555,0.29*math.sin(a)),graphite,verts=8)

# Drive support, service ports, sterile connector collars and filters.
for x in (-0.53,0.53):
    cyl('Motor support rail',0.026,0.41,(x,2.07,-0.28),steel)
box('Drive cross member',(1.14,0.075,0.23),(0,2.275,-0.28),steel,0.012)
cyl('Magnetic drive housing',0.108,0.27,(0,2.12,0),graphite)
cyl('Drive cap',0.114,0.04,(0,2.275,0),steel)
for i in range(12):
    a=i*math.tau/12
    box('Drive cooling fin',(0.012,0.16,0.017),(0.108*math.cos(a),2.12,0.108*math.sin(a)),graphite,0.003)
torus('Drive coupling flange',0.1,0.012,(0,1.98,0),polish)
for i,(x,z) in enumerate(((-0.37,0.1),(-0.17,0.29),(0.25,0.2),(0.4,-0.14))):
    cyl('Bag port neck',0.027,0.13,(x,1.96,z),white)
    cyl('Sterile clamp',0.047,0.025,(x,2,z),polish)
    cyl('Connector collar',0.039,0.04,(x,2.04,z),blue if i<2 else teal)
    cyl('Hose nipple',0.018,0.09,(x,2.1,z),white)
    tube('Port tubing',[(x,2.1,z),(x,2.31,z),(x+0.14,2.38,z-0.18),(x+0.24,2.32,z-0.28)],0.012,film)
    if i in (0,3):
        cyl('Sterile vent filter',0.052,0.14,(x+0.24,2.38,z-0.28),white)
        for yy in (2.32,2.44):
            torus('Filter cap seal',0.053,0.004,(x+0.24,yy,z-0.28),blue)

# Side-entry PAT probes and electronics. Display is populated by the app.
for i,(x,y,z) in enumerate(((0.58,0.8,0.29),(-0.56,0.9,0.29),(-0.43,0.65,0.4))):
    cyl('Probe sanitary clamp',0.065,0.04,(x,y,z),polish,(1,0,0))
    cyl('Probe body',0.034,0.19,(x+0.055,y,z),gold if i==0 else white,(1,0,0))
    cyl('Probe coupling',0.048,0.04,(x+0.15,y,z),graphite,(1,0,0))
box('ViaMass transmitter enclosure',(0.29,0.35,0.2),(0.83,1.14,0.12),graphite,0.022)
box('ViaMass face surround',(0.34,0.25,0.022),(0.83,1.16,0.23),rubber,0.012)
cyl('Status lens',0.009,0.008,(0.96,1.28,0.247),led,(0,0,1),verts=12)
tube('ViaMass probe lead',[(0.75,0.8,0.29),(0.98,0.81,0.15),(1,1.04,0.1),(0.85,1.05,0.1)],0.012,rubber)
tube('Temperature jacket hose',[(-0.65,0.54,-0.17),(-0.91,0.52,-0.18),(-0.95,0.39,-0.35),(-0.89,0.3,-0.45)],0.024,rubber)

# Legible small labels and etched volume scale, all original artwork.
box('Nameplate',(0.69,0.12,0.022),(0,0.38,0.61),graphite,0.008)
text('Nameplate type','BIOSTAT  STR  50',(0,0.4,0.624),0.045,white)
text('Nameplate subtitle','GEN 2  /  VIRTUAL CULTURE',(0,0.36,0.624),0.018,white)
box('Safety label',(0.15,0.11,0.013),(-0.57,1.57,0.25),gold,0.003)
text('Safety icon','!',(-0.57,1.57,0.26),0.065,graphite)
for i in range(11):
    y=0.48+1.4*i/10
    box('Volume scale tick',(0.043 if i%2==0 else 0.026,0.004,0.01),(-0.57,y,0.33),white,0)
    if i%2==0:
        text('Volume scale value',str(i*5),(-0.62,y,0.341),0.022,white)

# Merge static pieces by material to avoid hundreds of browser draw calls.
def merge_by_material(parent):
    objects=[o for o in parent.children if o.type=='MESH']
    groups={}
    for ob in objects:
        groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for name,items in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in items:
            ob.select_set(True)
        bpy.context.view_layer.objects.active=items[0]
        if len(items)>1:
            bpy.ops.object.join()
        bpy.context.object.name='HF_Static_'+name.split('|')[-1].strip().replace(' ','_')
merge_by_material(static)
merge_by_material(impeller)
merge_by_material(bag_group)

# Keep GLB dynamics at neutral scale; set the initial volume in the Blender preview afterwards.
liquid.scale.z=1
bpy.ops.object.select_all(action='DESELECT')
for ob in root.children_recursive:
    ob.select_set(True)
root.select_set(True)
gltf_path=OUT/'biostat-gen2.glb'
bpy.ops.export_scene.gltf(filepath=str(gltf_path),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
# Blender names are global across scenes. Rebuilds can add .001 suffixes; keep
# the exported runtime contract stable without renaming existing user objects.
raw=gltf_path.read_bytes()
json_length=struct.unpack_from('<I',raw,12)[0]
document=json.loads(raw[20:20+json_length])
bindings={'HF_Biostat','HF_Static','HF_Impeller','HF_Liquid','HF_Bag'}
for node in document['nodes']:
    base=node.get('name','').split('.')[0]
    if base in bindings:
        node['name']=base
encoded=json.dumps(document,separators=(',',':')).encode('utf-8')
encoded+=b' '*((-len(encoded))%4)
tail=raw[20+json_length:]
gltf_path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
liquid.scale.z=0.35

# Presentation setup stays in .blend only; no web runtime dependence on Blender lights.
def area(name,pos,power,size,color):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    data.color=color
    ob=bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    ob.location=xyz(pos)
    ob.rotation_euler=(xyz((0,1.2,0))-ob.location).to_track_quat('-Z','Y').to_euler()
area('HF Softbox key',(-3,4,3),650,4,(0.85,0.92,1))
area('HF Softbox rim',(2,3,-2),850,3,(1,0.9,0.75))
area('HF Softbox fill',(3,2,3),400,3,(0.8,0.93,1))
camera_data=bpy.data.cameras.new('HF Camera')
camera=bpy.data.objects.new('HF Camera',camera_data)
scene.collection.objects.link(camera)
camera.location=xyz((3.4,2.5,5.6))
camera.rotation_euler=(xyz((0,1.2,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=3.3
scene.camera=camera
scene.render.film_transparent=True
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
bpy.context.view_layer.objects.active=root
# Prepare the Layout workspace for inspection when opened in Blender.
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=4.3
            ar.spaces.active.region_3d.view_location=xyz((0,1.2,0))
            ar.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            ar.spaces.active.shading.type='MATERIAL'
            ar.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'hemoforge-biostat-gen2.blend'))
meshes=[o for o in root.children_recursive if o.type=='MESH']
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
manifest={
    'name':'HemoForge BIOSTAT STR Gen 2 inspired cutaway','version':1,
    'license':'CC0-1.0','author':'HemoForge project contributors',
    'source':'assets/blender/build_biostat.py','blender':bpy.app.version_string,
    'glb_bytes':gltf_path.stat().st_size,'meshes':len(meshes),'triangles':triangles,
    'runtime_nodes':['HF_Impeller','HF_Liquid','HF_Bag'],
    'units':'meters; illustrative proportions, not manufacturer CAD',
    'textures':[{'name':'HF_original_brushed_roughness','size':[512,512],'license':'CC0-1.0','source':'Original seeded numerical grain, generated locally'}],
    'reference':'https://www.sartorius.com/en/company/newsroom/product-news/16302-16302',
    'reference_usage':'Visual reference only. No vendor mesh, texture, logo or CAD redistributed.'
}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(ROOT/'.cache'/'blender-build-result.json').write_text(json.dumps(manifest),encoding='utf-8')
print('HEMOFORGE_ASSET_READY',json.dumps(manifest))
