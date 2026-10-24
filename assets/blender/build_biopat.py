"""Build original CC0 BioPAT-inspired teaching assets in the open Blender app.

Creates a new scene; preserves all existing scenes. Run with __file__ set to
this script's absolute path. No add-ons, downloads, or third-party textures.
All dimensions are illustrative; these are not manufacturer CAD replicas.
"""
import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets' / 'blender'
OUT = ROOT / 'public' / 'virtual-lab' / 'biopat'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / '.cache').mkdir(exist_ok=True)
scene = bpy.data.scenes.new('HemoForge | Trace + ViaMass')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.world = bpy.data.worlds.new('PAT soft studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.4
scene.view_settings.view_transform = 'AgX'

def xyz(p):
    return Vector((p[0], -p[2], p[1]))

def empty(name, pos=(0,0,0), parent=None):
    ob = bpy.data.objects.new(name,None)
    scene.collection.objects.link(ob)
    ob.location = xyz(pos)
    ob.parent = parent
    return ob

def material(name,color,metallic=0,rough=0.4,alpha=1):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Alpha'].default_value=alpha
    m.diffuse_color=(*color,alpha)
    if alpha<1:
        methods=m.bl_rna.properties['surface_render_method'].enum_items.keys()
        m.surface_render_method='BLENDED' if 'BLENDED' in methods else 'DITHERED'
    return m

steel=material('PAT satin stainless',(0.48,0.53,0.57),1,0.32)
polish=material('PAT polished connector',(0.66,0.69,0.72),1,0.2)
white=material('PAT ivory powder coat',(0.8,0.83,0.83),0.08,0.35)
dark=material('PAT anodized graphite',(0.027,0.041,0.052),0.5,0.32)
rubber=material('PAT strain relief EPDM',(0.014,0.019,0.023),0,0.7)
teal=material('PAT teal polymer',(0.02,0.25,0.28),0.05,0.4)
blue=material('PAT blue connector',(0.03,0.2,0.4),0.05,0.35)
red=material('PAT red connector',(0.45,0.055,0.04),0.05,0.4)
amber=material('PAT amber connector',(0.48,0.3,0.08),0.15,0.38)
silicone=material('PAT silicone tubing',(0.67,0.84,0.87),0,0.3,0.5)
glass=material('PAT reagent polymer',(0.8,0.9,0.91),0,0.18,0.3)
buffer=material('PAT buffer illustration',(0.48,0.69,0.64),0,0.33,0.6)
led=material('PAT status lens',(0.04,0.5,0.32),0,0.25)
led.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(0.02,0.3,0.17,1)
led.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=0.4
screen_mat=material('PAT virtual readout blank',(0.013,0.027,0.04),0,0.6)
grain=bpy.data.images.load(str(SOURCE/'brushed-roughness.png'),check_existing=True)
grain.colorspace_settings.name='Non-Color'
grain.pack()
tex=steel.node_tree.nodes.new('ShaderNodeTexImage')
tex.image=grain
steel.node_tree.links.new(tex.outputs['Color'],steel.node_tree.nodes['Principled BSDF'].inputs['Roughness'])

def finish(ob,name,mat,parent,smooth=True):
    ob.name=name
    ob.parent=parent
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth=smooth
    return ob

def box(name,size,pos,mat,parent,radius=0.006):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos))
    ob=bpy.context.object
    ob.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(ob,name,mat,parent,False)
    if radius:
        mod=ob.modifiers.new('Manufactured edge','BEVEL')
        mod.width,mod.segments=radius,2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob

def cyl(name,r,h,pos,mat,parent,axis=(0,1,0),verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=h,location=xyz(pos))
    ob=bpy.context.object
    ob.rotation_mode='QUATERNION'
    ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(xyz(axis).normalized())
    return finish(ob,name,mat,parent)

def ring(name,r,t,pos,mat,parent,axis=(0,0,1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=40,minor_segments=8,location=xyz(pos))
    ob=bpy.context.object
    ob.rotation_mode='QUATERNION'
    ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(xyz(axis).normalized())
    return finish(ob,name,mat,parent)

def tube(name,points,r,mat,parent):
    cu=bpy.data.curves.new(name,'CURVE')
    cu.dimensions='3D'
    cu.resolution_u=6
    cu.bevel_depth=r
    cu.bevel_resolution=2
    sp=cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points)-1)
    for bp,p in zip(sp.bezier_points,points):
        bp.co=xyz(p)
        bp.handle_left_type=bp.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cu)
    scene.collection.objects.link(ob)
    ob.parent=parent
    ob.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH')
    return ob

def text(name,value,pos,size,mat,parent):
    cu=bpy.data.curves.new(name,'FONT')
    cu.body=value
    cu.size=size
    cu.align_x=cu.align_y='CENTER'
    cu.extrude=0.0002
    cu.resolution_u=3
    ob=bpy.data.objects.new(name,cu)
    scene.collection.objects.link(ob)
    ob.parent=parent
    ob.location=xyz(pos)
    ob.rotation_euler=(math.pi/2,0,0)
    cu.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH')
    return ob

def display(name,width,height,pos,parent):
    data=bpy.data.meshes.new(name)
    data.from_pydata([xyz((-width/2,-height/2,0)),xyz((width/2,-height/2,0)),xyz((width/2,height/2,0)),xyz((-width/2,height/2,0))],[],[(0,1,2,3)])
    uv=data.uv_layers.new()
    for loop,co in zip(data.loops,[(0,0),(1,0),(1,1),(0,1)]):
        uv.data[loop.index].uv=co
    ob=bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    ob.location=xyz(pos)
    finish(ob,name,screen_mat,parent,False)
    ob['runtime_binding']='HemoForge virtual readout; QC-gated released sensor receipts only'
    return ob

trace=empty('HF_Trace')
trace['description']='BioPAT Trace inspired analyzer with two pumps; virtual display is an added HemoForge teaching interface'
trace_static=empty('HF_Trace_Static',parent=trace)
# Analyzer body with separate housing, gasket, faceplate and ventilation slots.
box('Ivory analyzer housing',(.69,.66,.69),(.26,.4,0),white,trace_static,.025)
box('Lower service tray',(.72,.07,.72),(.26,.1,0),dark,trace_static,.014)
box('Front gasket',(.62,.57,.025),(.26,.4,.35),rubber,trace_static,.012)
box('Front service panel',(.59,.54,.016),(.26,.4,.371),white,trace_static,.011)
box('Rear brushed panel',(.61,.55,.018),(.26,.4,-.351),steel,trace_static)
text('Trace identity','BioPAT Trace',(.26,.62,.386),.047,dark,trace_static)
text('Trace specimen note','ONLINE  /  GLUCOSE + LACTATE',(.26,.576,.386),.017,dark,trace_static)
for x in (-.015,.535):
    for y in (.16,.64):
        cyl('Captive panel screw',.011,.009,(x,y,.386),polish,trace_static,(0,0,1),12)
for x in (.05,.18,.31,.44):
    box('Rear vent slot',(.065,.008,.003),(x,.55,-.363),dark,trace_static,.002)
for x in (-.01,.52):
    for z in (-.25,.25):
        cyl('Rubber instrument foot',.034,.05,(x,.045,z),rubber,trace_static)

pump_groups=[]
for i,x in enumerate((.10,.43)):
    ring('Peristaltic head surround',.11,.012,(x,.43,.404),polish,trace_static)
    cyl('Pump backing',.103,.02,(x,.43,.401),dark,trace_static,(0,0,1))
    group=empty('HF_Trace_PumpA' if i==0 else 'HF_Trace_PumpB',(x,.43,.42),trace)
    cyl('Rotor hub',.035,.035,(0,0,0),steel,group,(0,0,1))
    for k in range(3):
        a=k*math.tau/3
        xx,yy=.061*math.cos(a),.061*math.sin(a)
        spoke=box('Rotor arm',(.075,.018,.014),(xx/2,yy/2,.015),polish,group,.004)
        spoke.rotation_euler.y=-a
        cyl('Compression roller',.021,.035,(xx,yy,.026),white,group,(0,0,1),20)
        cyl('Roller axle',.006,.04,(xx,yy,.03),polish,group,(0,0,1),12)
    pump_groups.append(group)
    points=[(x+.09*math.cos(a),.43+.09*math.sin(a),.45) for a in [math.pi*j/8 for j in range(9)]]
    tube('Pump head silicone arc',points,.008,silicone,trace_static)
    tube('Pump inlet',[(x-.09,.43,.45),(x-.1,.33,.44),(x-.07,.24,.4)],.007,silicone,trace_static)
    tube('Pump outlet',[(x+.09,.43,.45),(x+.1,.32,.44),(x+.065,.24,.4)],.007,silicone,trace_static)
    text('Pump label','P'+str(i+1),(x,.285,.39),.027,dark,trace_static)
for i,x in enumerate((.08,.265,.45)):
    color=(blue,red,teal)[i]
    cyl('Fluid port bulkhead',.029,.027,(x,.18,.39),polish,trace_static,(0,0,1))
    cyl('Color coded luer',.019,.047,(x,.18,.418),color,trace_static,(0,0,1),20)
    cyl('Fluid port tip',.011,.023,(x,.18,.45),white,trace_static,(0,0,1),16)
    text('Fluid port label',('INLET','BUFFER','RETURN')[i],(x,.135,.391),.016,dark,trace_static)
# Reagent bottles with caps, dip tubes, labels, liquid, and a steel bottle rack.
box('Reagent rack',(.65,.045,.25),(-.28,.1,-.19),steel,trace_static,.01)
for i,x in enumerate((-.48,-.27,-.06)):
    cyl('Reagent bottle',.076,.43,(x,.34,-.19),glass,trace_static)
    cyl('Reagent fluid',.068,.28,(x,.265,-.19),buffer,trace_static)
    cyl('Reagent shoulder',.055,.055,(x,.582,-.19),glass,trace_static)
    cyl('Reagent screw cap',.058,.035,(x,.63,-.19),blue,trace_static)
    cyl('Reagent dip tube',.006,.46,(x,.39,-.19),white,trace_static)
    box('Reagent label',(.105,.14,.009),(x,.38,-.114),white,trace_static,.003)
    text('Reagent label type',('BUF','STD','RINSE')[i],(x,.39,-.107),.025,dark,trace_static)
    rear_x=.08+i*.185
    cyl('Rear reagent connector',.018,.04,(rear_x,.22,-.374),polish,trace_static,(0,0,1),20)
    tube('Reagent cap tubing',[(x,.66,-.19),(x,.8,-.16),(x+.13,.82,-.36),(rear_x,.22,-.4)],.007,silicone,trace_static)
# Separate virtual HemoForge readout: not a claim about the factory analyzer UI.
box('Virtual screen stand',(.085,.42,.075),(-.48,.38,.17),steel,trace_static)
box('Virtual screen bezel',(.56,.36,.06),(-.44,.62,.35),dark,trace_static,.016)
display('HF_Trace_Display',.51,.305,(-.44,.62,.383),trace)
text('Virtual readout identification','HEMOFORGE / VIRTUAL READOUT',(-.44,.41,.39),.019,teal,trace_static)
trace_status=empty('HF_Trace_Status',(.53,.68,.39),trace)
cyl('Trace status lens',.014,.012,(0,0,0),led,trace_status,(0,0,1),16)

# ViaMass single-use disc and four electrode faces, pre-amplifier and electronics.
# Local anchor corresponds to the reactor's side port, not an in-line fluid tube.
via=empty('HF_ViaMass')
via['description']='Single-use sensor disc, pre-amplifier, lead and electronics; extra display is virtual HemoForge UI'
via_static=empty('HF_ViaMass_Static',parent=via)
cyl('Welded sensor disc',.073,.018,(0,0,0),white,via_static,(1,0,0),48)
ring('Disc polymer weld',.074,.008,(0,0,0),silicone,via_static,(1,0,0))
for y in (-.026,.026):
    for z in (-.026,.026):
        cyl('Platinum electrode',.012,.006,(-.012,y,z),polish,via_static,(1,0,0),20)
cyl('Locking preamplifier ring',.065,.045,(.04,0,0),dark,via_static,(1,0,0))
cyl('Preamplifier sleeve',.045,.105,(.11,0,0),white,via_static,(1,0,0))
for y in (-.048,.048):
    box('Preamp clamping tab',(.045,.022,.04),(.05,y,0),teal,via_static,.005)
cyl('Preamp cable gland',.019,.045,(.18,0,0),rubber,via_static,(1,0,0))
tube('Shielded probe lead',[(.2,0,0),(.36,.02,-.01),(.39,.17,-.12),(.28,.32,-.16)],.012,rubber,via_static)
# Bracket offset from the bag on the holder's right upright.
box('Clamp mounting bracket',(.24,.055,.1),(.24,.29,-.15),steel,via_static,.008)
ring('Holder tube clamp',.04,.009,(.11,.29,-.17),polish,via_static,(0,1,0))
box('Slim electronics enclosure',(.4,.125,.21),(.3,.36,-.15),white,via_static,.016)
box('Electronics cover gasket',(.37,.092,.012),(.3,.36,-.038),rubber,via_static,.008)
box('Electronics label panel',(.35,.075,.009),(.3,.36,-.03),steel,via_static,.005)
text('ViaMass identity','BioPAT ViaMass',(.3,.37,-.023),.034,dark,via_static)
text('ViaMass module label','CAPACITANCE / SINGLE USE',(.3,.337,-.023),.014,dark,via_static)
for x in (.16,.44):
    cyl('Electronics lid screw',.008,.006,(x,.36,-.018),polish,via_static,(0,0,1),12)
for x in (.18,.43):
    cyl('Data connector barrel',.021,.045,(x,.36,-.275),polish,via_static,(0,0,1),20)
    ring('Data connector grip',.023,.003,(x,.36,-.29),rubber,via_static)
tube('Controller data lead',[(.43,.36,-.3),(.54,.41,-.31),(.53,.67,-.39),(.39,.73,-.43)],.01,rubber,via_static)
# Frame for the app's live display; no conductivity value is invented.
box('Virtual readout arm',(.035,.25,.035),(.24,.55,-.16),steel,via_static)
box('Virtual readout bezel',(.56,.34,.045),(.29,.67,-.075),dark,via_static,.014)
display('HF_ViaMass_Display',.51,.285,(.29,.67,-.049),via)
text('Virtual readout identity','HEMOFORGE / VIRTUAL READOUT',(.29,.46,-.044),.018,teal,via_static)
via_status=empty('HF_ViaMass_Status',(.51,.405,-.023),via)
cyl('ViaMass status lens',.012,.012,(0,0,0),led,via_status,(0,0,1),16)

def merge(parent):
    groups={}
    for ob in parent.children:
        if ob.type=='MESH':
            groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for name,items in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in items:
            ob.select_set(True)
        bpy.context.view_layer.objects.active=items[0]
        if len(items)>1:
            bpy.ops.object.join()
        bpy.context.object.name=parent.name.split('.')[0]+'_'+name.replace(' ','_').split('.')[0]
for parent in (trace_static,via_static,*pump_groups):
    merge(parent)

def export_asset(root,filename,required,reference):
    root['license']='CC0-1.0'
    root['asset_version']=1
    root['not_vendor_CAD']=True
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for ob in root.children_recursive:
        ob.select_set(True)
    dest=OUT/filename
    properties=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    active_scene={key:True for key in ('use_active_scene','export_active_scene') if key in properties}
    if not active_scene:
        raise RuntimeError('An active-scene glTF export option is required')
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False,**active_scene)
    raw=dest.read_bytes()
    length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length])
    for node in doc['nodes']:
        if node.get('name','').startswith('HF_'):
            node['name']=node['name'].split('.')[0]
    encoded=json.dumps(doc,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    tail=raw[20+length:]
    dest.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    return {'file':filename,'bytes':dest.stat().st_size,'meshes':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'required_nodes':required,'reference':reference}

models=[export_asset(trace,'biopat-trace.glb',['HF_Trace_Display','HF_Trace_PumpA','HF_Trace_PumpB','HF_Trace_Status'],'https://shop.sartorius.com/ww/p/biopat-trace/BioPAT_Trace'),
        export_asset(via,'biopat-viamass.glb',['HF_ViaMass_Display','HF_ViaMass_Status'],'https://www.sartorius.com/download/1223770/biopat-viamass-datasheet-en-b-sll2010-sartorius-pdf-8982--data.pdf')]
manifest={'license':'CC0-1.0','author':'HemoForge project contributors','blender':bpy.app.version_string,'source':'assets/blender/build_biopat.py','models':models,'textures':'Original local brushed-roughness.png, packed; no remote dependencies','display_notice':'Both screens are added HemoForge virtual readouts, not factory display replicas. Sensor data is bound at runtime, never baked.','reference_notice':'References only; no manufacturer mesh, logo, image or texture redistributed.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(ROOT/'.cache'/'biopat-build-result.json').write_text(json.dumps(manifest),encoding='utf-8')
# A side-by-side inspection scene. Exported GLBs above keep local origins.
trace.location=xyz((-.65,0,0))
via.location=xyz((.55,.15,0))
for name,pos,power,size in [('Key',(-2,3,3),500,3),('Rim',(3,3,-2),600,2),('Fill',(2,1.5,3),250,2)]:
    data=bpy.data.lights.new('PAT '+name,'AREA')
    data.energy=power
    data.size=size
    ob=bpy.data.objects.new('PAT '+name,data)
    scene.collection.objects.link(ob)
    ob.location=xyz(pos)
    ob.rotation_euler=(xyz((0,.5,0))-ob.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('PAT inspection camera')
camera=bpy.data.objects.new('PAT inspection camera',data)
scene.collection.objects.link(camera)
camera.location=xyz((2,1.6,4))
camera.rotation_euler=(xyz((0,.5,0))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'
data.ortho_scale=2.4
scene.camera=camera
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=3.5
            area.spaces.active.region_3d.view_location=xyz((0,.5,0))
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'hemoforge-biopat.blend'))
print('HEMOFORGE_PAT_READY',json.dumps(manifest))
