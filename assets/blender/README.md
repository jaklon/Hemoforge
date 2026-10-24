# BIOSTAT Gen 2 browser asset

Original, locally authored **BIOSTAT STR Gen 2 inspired teaching cutaway**. It is
not manufacturer CAD, a dimensionally verified replica, or evidence of sensor
accuracy. No vendor models, logos, textures, paid assets, add-ons, or AI service
calls are included.

- `hemoforge-biostat-gen2.blend`: editable Blender source, generated in Blender
  5.2.2 LTS. The previously open scene is preserved as another scene.
- `build_biostat.py`: repeatable Blender Python builder; creates a new scene.
- `brushed-roughness.png`: original seeded 512px stainless steel roughness map;
  packed in the blend and exported GLB.
- `../../public/virtual-lab/biostat/biostat-gen2.glb`: self-contained browser asset.
- `../../public/virtual-lab/biostat/manifest.json`: provenance and size/mesh budget.

## Rebuild

Run with the installed Blender executable:

```text
blender --background --python assets/blender/build_biostat.py
```

Or run the script in Blender's Python Console, setting `__file__` to its absolute
path (see the builder header). Each invocation creates a separate scene and
saves the source at the explicit path above. It overwrites these generated
outputs; preserve hand edits before rebuilding. No scripts auto-execute when
opening the blend.

## Runtime contract

The GLB is Y-up and uses illustrative meter-scale coordinates matching Monitor
01. `HF_Impeller` is a neutral transform rotated around Y using the integration
of current RPM over valid rendered seconds. `HF_Liquid` has its origin at the
vessel bottom (Y=0.48) and a unit-height child; its Y scale is current volume /
50,000mL × 1.4. `HF_Bag` is independent of the fluid and impeller.

Instrument values remain runtime canvas displays populated from QC-checked
virtual sensor receipts. The Blender model produces no biological data and
includes no baked timeline that can advance the culture independently. Pause,
hidden tabs, disconnects, and stalls stop visual process motion. Camera movement
remains available while paused. The decorative arrow can pulse while paused.

Static pieces are merged by material. The asset has 20 meshes, about 42k
triangles, and a 1.56MB GLB. Browser reflections use the existing Three.js
RoomEnvironment locally; no HDRI or other remote texture is fetched. The
renderer caps pixel ratio at 1.5, lowers it to 1 if measured visible rendering is
below 32 FPS, and skips rendering and screen texture uploads in hidden tabs.
Measured FPS is shown in Monitor 01, not a hardware-independent guarantee.
The existing procedural vessel is a labeled fallback if loading/validation fails.

## BioPAT Trace and ViaMass

`hemoforge-biopat.blend` contains both original CC0 instrument models in a
side-by-side inspection scene. `build_biopat.py` creates that scene and exports
two self-contained GLBs into `public/virtual-lab/biopat/`:

| Asset | Size | Meshes | Triangles |
| --- | --- | --- | --- |
| Trace | 0.88 MB | 19 | 17,354 |
| ViaMass | 0.56 MB | 9 | 9,170 |

Trace has two peristaltic heads, silicone tubing, luer connectors, reagent
bottles, service panels and a separate virtual readout. ViaMass has a single-use
sensor disc with four electrode faces, pre-amplifier, locking tabs, shielded lead,
slim electronics housing and a separate virtual readout. The readouts are added
HemoForge teaching interfaces, not claims about built-in factory displays. No
vendor images or logos are embedded. General dimensions remain illustrative.

Rebuild with `blender --background --python assets/blender/build_biopat.py` for a
traditional Blender install, or use the open app's Python Console (also supported
for Microsoft Store installations). Set `p` to the absolute path of the builder:

```python
exec(compile(open(p, encoding='utf-8').read(), p, 'exec'), {'__file__': p})
```

Trace exports `HF_Trace_Display` (UV-mapped surface), `HF_Trace_PumpA` and
`HF_Trace_PumpB` (local Z pivots), and `HF_Trace_Status`. ViaMass exports
`HF_ViaMass_Display` and `HF_ViaMass_Status`. GLB origins are neutral; inspection
scene offsets are applied only after export. Export normalizes Blender suffixes
without renaming objects in other scenes. Only the active scene and selected
model are exported; older selected objects in preserved scenes are excluded.

The instrument presentation function gates both canvas textures and accessible
overlays using released, fresh, passed receipts. A device fault, stale data,
invalid channels or disconnection displays dashes and HOLD; pause retains valid
last values and explicitly labels them PAUSED. Conductivity, viability and RBC
count are not fabricated. Trace pump and tubing motion is qualitative, advances
only with valid rendered time, and holds during pause/fault/disconnection. ViaMass
has no rotating mechanical part; its LED briefly brightens when a new passed
receipt is published. LED motion also freezes while paused.

The BIOSTAT model keeps its former ViaMass placeholder in the separately named
`HF_ViaMass_Legacy` group. It is hidden after the dedicated ViaMass loads, so
geometry does not overlap; the placeholder remains if that asset fails to load.
Each equipment model reports load/fallback status in Monitor 01.

Device references, used only for visual interpretation:

- https://shop.sartorius.com/ww/p/biopat-trace/BioPAT_Trace
- https://www.sartorius.com/download/1223770/biopat-viamass-datasheet-en-b-sll2010-sartorius-pdf-8982--data.pdf

## Laboratory and supporting equipment

`hemoforge-laboratory.blend` is the editable original room scene.
`build_lab.py` creates it in a separate scene and exports
`public/virtual-lab/laboratory/laboratory.glb`. Rebuild in Blender's Python
Console with the same `exec(compile(...), {'__file__': p})` workflow above,
setting `p` to the absolute path of `build_lab.py`.

The room includes wall joints and coved skirting, observation glazing, a service
door with lever and kick plate, recessed LED panels and HVAC louvers. Supporting
equipment includes sage laminate casework, phenolic worktops, a wash basin and
gooseneck tap, pipettes and reagent bottles, a clean work enclosure, centrifuge,
balance, tube rack, incubator, secured gas bank, Trace table, trolley and stool.
The wash basin is an illustrative shallow recess, not a plumbing simulation.
Equipment dimensions and layout are illustrative; no cleanroom certification
or real equipment control is implied.

All room geometry is static and merged by material: **14 meshes, 38,040 triangles,
2.33MB** including embedded textures. The 512px epoxy texture is original seeded
pixel data generated locally; steel uses the existing original roughness map.
There are no downloaded materials, HDRIs, extra dependencies, exported lights,
cameras, or baked animations. Background screens and gauge needles are scenery,
not readings; only the separate BIOSTAT/Trace/ViaMass interfaces show live data.

Monitor 01 loads the room independently and hides the simple procedural room,
gas cylinders and Trace table only after validation succeeds. A load failure
keeps that fallback visible and labels it. Optional Kenney room props are no
longer loaded by the BIOSTAT scene. The environment adds no shadow map and uses
the existing local reflection environment, dynamic process shadows and adaptive
pixel ratio. Renderer resources are disposed on unmount, including late loads.

Choose **Ruangan** and **Perluas 3D** to inspect the room across Monitor 01.
**Kembali ke kontrol** or Escape restores the control panel. The canvas stays
mounted during this layout change, preserving process animation and session
state. Five asset statuses report laboratory/equipment/operator loading independently.

## Articulated operator gloves

`hemoforge-operator-hands.blend` and `build_hands.py` contain original CC0 blue
nitrile gloves, tapered palms, individual fingers/thumbs, rolled cuffs and lab
coat sleeves. Two armatures skin the geometry with blended weights around the
finger joints. The source contains editable `HF_L_Inspection_pose_study` and
`HF_R_Inspection_pose_study` actions over frames 1–144. Rebuild in Blender's
Console using the same workflow above with `p` pointing to `build_hands.py`.

`public/virtual-lab/hands/operator-hands.glb` is about **185KB**, with two skins,
two meshes, four material primitives and **6,752 triangles**. It contains all
30 named finger joints; the source-only pose study is not exported as an
independent timeline. Materials are original local constants, with no downloads,
motion capture, textures, add-ons or paid services. The prior simple hands remain
a labeled fallback. Skeleton textures and loaded geometry are disposed on exit.

In Monitor 01 choose BIOSTAT, Trace or ViaMass, run the culture until that device
has fresh passed sensor data, then choose **Periksa layar** (or click its readout).
The camera approaches the selected readout; the right index extends while other
fingers curl, touches an inspection point in front of the display, then retracts.
The camera distance adapts to viewport width. This is visual inspection only:
the gesture cannot send actuator commands, confirm Guard decisions, fabricate
measurements or advance culture time. Existing Monitor 02 decisions remain the
process control path. An active process intervention blocks inspection.

Motion advances in valid rendered seconds only and freezes for pause, hidden
tabs, stalls, disconnection or unavailable/faulted device data. It resumes at the
same gesture time when valid again. Changing camera station cancels the gesture.
**Kurangi gerakan** disables idle sway and inspection motion (and defaults to the
browser's reduced-motion preference); it does not stop the simulated culture.

Monitor 01 also supports **Jalan FPS · WASD** using these same free assets.
The player can walk to a display, aim at it within 1.2m and press E to inspect.
FPS inspection keeps the player's camera position; no automated approach crosses
equipment. `src/lab-navigation.ts` contains conservative collision footprints
matching this room/equipment layout; update them if repositioning Blender assets.
Pointer lock is requested on click, with drag-look fallback where unsupported.

## License

Original geometry and generated textures in this folder and the exported GLB
are dedicated under **CC0 1.0 Universal**:
https://creativecommons.org/publicdomain/zero/1.0/

Reference used for the general generation and stainless holder design:
https://www.sartorius.com/en/company/newsroom/product-news/16302-16302

The reference is not redistributed as an asset. BIOSTAT and BioPAT product names
identify the equipment being illustrated; CC0 does not grant trademark rights.
