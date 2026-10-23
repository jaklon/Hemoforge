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

Static pieces are merged by material. The asset has 16 meshes, about 42k
triangles, and a 1.56MB GLB. Browser reflections use the existing Three.js
RoomEnvironment locally; no HDRI or other remote texture is fetched. The
renderer caps pixel ratio at 1.5, lowers it to 1 if measured visible rendering is
below 32 FPS, and skips rendering and screen texture uploads in hidden tabs.
Measured FPS is shown in Monitor 01, not a hardware-independent guarantee.
The existing procedural vessel is a labeled fallback if loading/validation fails.

## License

Original geometry and generated textures in this folder and the exported GLB
are dedicated under **CC0 1.0 Universal**:
https://creativecommons.org/publicdomain/zero/1.0/

Reference used for the general generation and stainless holder design:
https://www.sartorius.com/en/company/newsroom/product-news/16302-16302

The reference is not redistributed as an asset. BIOSTAT and BioPAT product names
identify the equipment being illustrated; CC0 does not grant trademark rights.
