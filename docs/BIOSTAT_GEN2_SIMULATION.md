# BIOSTAT Gen 2 simulation contract

The default session profile is `biostat-str-gen2` (schema 4). The old schema-3 FLEX2 engine is retained only for
explicit API compatibility (`device_profile: legacy-flex2`) and regression tests. The PoC UI creates BIOSTAT sessions.
Canonical routes remain `#poc/lab/{id}` and `#poc/monitor/{id}/{dashboard|guard|pilot|plan}`.

## Plant and control

`backend/biostat.py` owns the private well-mixed STR plant and virtual instrument schedule. It reuses the legacy
nutrient/metabolite rates but adds oxygen-limited/temperature-dependent kinetics, oxygen transfer and consumption,
proportional pH/DO/temperature feedback, an illustrative phase change at 72 h and stage-dependent capacitance.
Fixed 0.01 h integration steps accumulate render fragments to preserve partition-independent sampled outputs.
Sensor schedules lie on that solver grid; private state can lag the visible clock by less than one solver step.
This is a synthetic teaching model: no identified cell-line kinetics, geometry-specific kLa calibration, biological
scale-up validation, enucleation model, real OPC connection or physical PID implementation is claimed.
Controller gains/output bounds and setpoint limits are teaching assumptions.

Volume starts at 12,500 mL; 50,000 mL maximum. Feed presets use explicit `feed_multiplier_ml=50`, transferring
500/1,250 mL. Exchange models an optional retention skid with 98% cell retention (loss proportional to exchanged
fraction). It is not claimed as a base Gen 2 accessory. Four rendered seconds apply one atomic medium transfer;
three culture minutes elapse biologically. Cancellation retains elapsed culture but prevents that transfer.

## Observation boundaries

- `sensor_readings`: device-tagged immutable receipts with original measurement/release/expiry times, QC, channels,
  volume and stage. Sources are `virtual_sensor`. Core publishes pH/DO/temperature, Trace glucose/lactate, ViaMass capacitance.
- `measurements`: backward-compatible live-module bridge of explicitly attributed `model_estimate` rows.
  Density/count derive only from released ViaMass capacitance, an assumed stage/size conversion and recorded volume.
  `source_sensor_ids`, `calibration_profile`, stage, source kind and evidence accompany every estimate.
  They are not measured RBC counts or calibrated biological uncertainty. Chemistry bundled as context is as-of release;
  Guard receives sensor charts separately via `liveSensorRows` to avoid assigning chemistry the count estimate's timestamp.
- Glutamine, ammonium, viability, osmolality, dissolved pCO2 and enucleation never cross from hidden state to observations.
- Device intervals/delays/expiry in accelerated culture hours: core 0.5/0/2, ViaMass 1/0.02/3, Trace 2/0.1/5.
  All are demo scheduling assumptions, not manufacturer performance specifications. Trace models closed dialysis without
  net sample removal. Faulted outputs have rejected QC and empty channels; recovery waits for the next scheduled output.
- `biostat-data.ts` is the shared frontend provenance boundary. Current values become unavailable on expiry/fault;
  historical passed points remain historical. Legacy input adapters remain covered by their original tests.
- `liveSensorRows` maps temperature -> temperature_c and dissolved_oxygen -> do_percent for the established Guard schema,
  preserves units/times and supplies no cell counts. Count inputs have an explicit estimate source name/cell-line label.

## Realtime, permissions and analytics

Only rendered animation advances the plant, instrument scheduler and virtual transfers. Hiding/stalling/disconnecting
Monitor 01 pauses advancement; monitor viewers cannot write commands. No wall-clock catch-up, external inference,
database call or background simulation timer is added. Controller heartbeat loss retains the established pause policy.
New control commands are bounded setpoints and a three-device fault toggle; only the controller WebSocket may issue them.
Guard keeps the existing one-time pairing, scoped operator token, user preview/confirmation, revocation and idempotency.
Fresh core, Trace and ViaMass signals are all required. A reviewed Trace-linked estimate is accepted for <=3 h; newer
telemetry does not automatically invalidate a still-fresh reviewed source. Another action needs a post-transfer source.

Pilot/Plan fit only published estimated counts in a rolling 24 h window, spaced >=2 h. Material user events (setpoint,
transfer, phase) define fit segments; routine AUTO actuator changes do not reset fitting. >=3 points and >=6 h span
are required. QC/staleness/active interventions/differentiation withhold predictions. Forecast horizons and target ETAs cannot cross the assumed 72 h phase boundary; target-reached status is labelled
`estimated_target_reached`. The forecast distribution remains an uncalibrated teaching extrapolation. GP DOE stays
withheld without independent controlled experiments. Three-hour checkpoint reports use publication-time availability.

## Scene, assets and validation

`BiostatScene.tsx` loads an original Blender GLB for the bag-holder cutaway and impellers, with a procedural fallback.
Three.js adds optical probe representations,
gas sparger, instanced bubbles/cell markers, controller tower, peristaltic rotors, Trace dialysis/return paths, ViaMass
probe/electronics/display, optional retention skid, gloved hands and selectable camera views. Screen PVs come from
released sensor receipts; actuator displays use controller outputs. Flow and rotation freeze with the culture clock.
Existing local Kenney CC0 furniture is reused. No dependencies, paid assets or model downloads are added.

Run TypeScript tests, tsc, Vite build and the offline Python suite. `test_biostat.py` covers device release order/latency,
private-state exclusion, deterministic seeded signals/frame partitions, bounded time, setpoints, faults/recovery,
rolling/stage-aware forecasting, nonideal mass balances, intervention idempotency/cancellation and two-monitor transport.
`biostat-data.test.ts` covers provenance groups, unavailable/future/faulted/stale readings, separate sensor timestamps,
Guard volume/source gates and material segmentation. Legacy tests explicitly select their compatibility profile.

Scientific/device references and the step-by-step local walkthrough are in public/VIRTUAL_LAB.md.

Research workspace sign-in and the latest main chart layout are preserved. PoC routes do not mount the account loader,
and live DataProvider instances do not read or write account notifications/state. This keeps the local simulation independent
of database credentials; control still requires the original controller capability or explicitly paired Guard operator.

Virtual noise metadata records per-device core/Trace/ViaMass settings and explicitly states that calibration and biological
uncertainty are unvalidated. Schema 4 omits the legacy manual-assay protocol rather than exporting FLEX2 timing.
## Blender vessel upgrade

Monitor 01 loads the locally authored CC0 model at
`/virtual-lab/biostat/biostat-gen2.glb`. Editable source, original generated
stainless texture, rebuild instructions, and the runtime node contract are in
`assets/blender/README.md`. The model is illustrative, not vendor CAD.

The named impeller and liquid nodes bind to controller RPM and recorded volume.
Motion integrates valid rendered seconds; changing RPM does not jump the shaft
angle. Pause, hidden tabs, disconnect, and stalls do not advance process motion.
Sensor readings, QC, estimates, culture kinetics, and intervention semantics
remain in the existing simulation; none are baked into the asset. A labeled
procedural fallback remains available if the GLB cannot load.

Rendering uses local environment reflections, material-merged geometry,
instanced particles, capped pixel ratio and an automatic lower-resolution mode
below 32 measured FPS. The visible FPS meter reports the current device, not a
promised performance on all browsers. No new runtime dependency or paid asset
is required.

## BioPAT instrument assets and displays

Dedicated original CC0 Trace and ViaMass GLBs load from `/virtual-lab/biopat/`.
`assets/blender/build_biopat.py` builds both in Blender, preserving existing scenes.
The extra display surfaces are explicit HemoForge virtual readouts; ViaMass is
modeled as disc/pre-amplifier/electronics, not as a device measuring RBC count.

`biopat-instrument.ts` is the shared presentation boundary for 3D canvas textures
and accessible overlays. It reads only device-specific released receipts and
gates numeric values on QC, expiry, finite channels, explicit device fault state
and connection. Pauses preserve valid last values with a PAUSED label. Invalid
states display dashes and HOLD; no plant state or estimated channel is substituted.
The two Trace rotor nodes integrate rendered time without a restart jump. ViaMass
LED brightening follows a newly published passed receipt. Flow/LED animation holds
on pause, hidden tabs, stalls and disconnect; sensor faults hold the affected device.

Each model independently validates required named transforms and reports a labeled
fallback if loading fails. The former ViaMass geometry is isolated inside the
BIOSTAT GLB so the dedicated module can replace it without overlapping meshes.
Instrument asset tests check neutral roots, display UVs, rotor pivots, size/mesh
budgets and embedded resources. Presentation tests exercise device identity,
future releases, fault/stale/invalid/offline data, pause and recovery.

## Blender laboratory environment

An original CC0 room now replaces the initial grid floor, box casework, simple
gas cylinders and Trace table after independent GLB validation. It is generated
by `assets/blender/build_lab.py` and editable in `hemoforge-laboratory.blend`.
The 2.33MB GLB embeds original epoxy and steel textures, with 14 material-merged
meshes and 38,040 triangles. No remote assets, additional lights or baked
animations are loaded. The existing procedural room remains a labeled fallback.

Supporting workstations, incubator, centrifuge, balance, gas bank and utility
equipment are static illustration. Gauge needles and standby labels are not
sensor values; the room cannot alter kinetics, QC, estimates or decisions.
Runtime controller screens, Trace pumps, ViaMass indicators and process circuits
retain their existing simulation bindings. Adaptive rendering and hidden-tab
pause remain active. Background scenery receives shadows but does not add
shadow-caster submissions or a separate shadow map.

The `Perluas 3D` layout control uses the same mounted canvas and session;
`Kembali ke kontrol` or Escape restores the panel. The room overview camera
adapts to aspect ratio; close-up instrument camera targets remain unchanged.
An asset contract test checks GLB scene isolation, actual primitive/triangle
budgets, embedded resources, named room groups and the absence of animations,
cameras and punctual lights.

## Operator animation

Two original Blender-authored skinned gloves replace the simple first-person
hands, with 30 named finger joints and four material primitives (6,752 triangles,
185KB). The editable blend contains a pose study; the exported GLB has no baked
animation. `operator-hands.ts` gates inspection on a running connected session,
fresh passed finite device channels and no active intervention. Inspection is a
read-only visual action; it cannot enqueue a command or synthesize a sensor value.

An explicit button or readout click starts the bounded approach/reach/tap/read/
retract sequence. Joint curl and fingertip alignment use the same valid rendered
seconds as process animation. Pauses, device QC holds, disconnects, hidden tabs
and long frame gaps do not advance the gesture. Device recovery resumes its
existing time. Camera station changes cancel it. Reduced motion cancels the
gesture and removes idle sway; it does not pause the process or its measurements.
The hand asset validates required joints and skins independently, preserving
the old hands as a labeled fallback. GPU skeleton textures are disposed on exit.

## FPS navigation

`lab-navigation.ts` owns the 0.22m player radius, fixed 1.65m eye height, 1.6m/s
walk speed, room bounds and conservative XZ equipment footprints matching the
current Blender lab. Swept 0.04m substeps and per-axis collision allow wall
sliding without tunnelling. Diagonal input is normalized, vertical movement is
absent, and invalid/long frame deltas cause no movement. Update footprints when
moving or replacing equipment in the Blender builders.

The scene accepts WASD only while its canvas is focused or owns pointer lock.
Pointer lock is requested only on a user canvas click; rejection switches to a
documented drag-look fallback. Mouse yaw covers a full turn; pitch is bounded.
Blur, visibility loss, Escape, pointer lock changes and pointer cancellation clear
held keys. Listeners and capture are released on unmount. Navigation is independent
of culture pause and cannot send process commands.

Display raycasts update at most every 150ms during walking, with a 1.225m far
plane. Interaction requires an aimed screen hit within 1.2m, no nearer opaque
scene obstruction and the existing sensor/connection/run-state gates. Camera
gloves and transparent process illustration are excluded as occluders. E and
readout clicks are rechecked at activation. FPS inspection retains player camera
position and orientation instead of moving through colliders; locomotion and
mouse look hold until the gesture finishes or is cancelled. Reset/preset/exit
cancel gestures and clear held keys without altering a session.

## Command-driven process motion

`process-animation.ts` derives the same state for the 3D view and the accessible
**Jalur proses** panel. It reads controller outputs, active intervention status
and released PAT receipts; it never reads private plant chemistry or writes a
measurement. All movement uses valid rendered seconds, holds on pause, lost
controller/connection, hidden tabs and long frame gaps, and resumes its previous
phase without jumping. **Kurangi gerakan** also freezes these visual motions;
the visible culture clock and measurements continue normally.

| Unit / route | Activity source |
| --- | --- |
| Impeller and cell circulation | Finite bounded commanded RPM; no default 100 RPM without controller data |
| O2/N2 valves → mixer → sparger | Virtual oxygen blend fraction and its nitrogen complement; AIR stays reserve |
| Trace outgoing / return hoses and pump heads | Valid or awaiting Trace release; fault, expired and invalid receipts hold this circuit |
| Medium bag → DCU feed head → dosing port | Only a valid executing feed or medium-exchange intervention |
| Culture → optional retention skid → filtrate/waste, with culture return | Only executing medium exchange; feed alone keeps this circuit closed |
| Base/acid reservoirs → corresponding DCU heads → dosing ports | Respective base/acid controller output percentages |
| Virtual thermal ring | Signed thermal output (positive heating, negative cooling); a visual field, not a modeled hydraulic loop |
| Trace/ViaMass cables → DCU | Brief packets when a new fresh QC-passed device receipt arrives; no liquid in electrical leads |

Direction arrows show qualitative command activity. Blend percentage is not
gas flow, dosing percentage is not mL/min, and arrow speed is not a flow sensor.
Three extra dosing connectors, the manifold, chemical reservoirs and retention
skid are illustrative virtual service geometry rather than manufacturer CAD.
Medium progress comes from the intervention; recorded liquid height changes
only when the backend applies its final audited volume. Reagents and ancillary
lab equipment remain standby because their protocols are not modeled. Core
sensor QC faults do not invent an actuator safety interlock: existing AUTO
commands keep driving the virtual equipment, while the sensor overlay shows QC.

Hoses/cables remain fixed while contents move in their correct direction. Each
route uses one eight-instance marker mesh and a precomputed 97-point arc-length
and orientation table. No per-frame tube rebuild, curve evaluation, marker
allocation, extra shadow map, external asset request or runtime dependency is
needed. Pump rotation integrates its current command rather than using elapsed
time multiplied by a newly changed rate.

## Lighting and shading

The room uses ACES tone mapping with explicit sRGB output, a locally generated
PMREM studio environment for PBR reflections, a warm-neutral directional key
inside the room, neutral/cool fill and a cool rim. This keeps the original
Blender roughness/material maps and unlit live displays while separating steel,
plastic and translucent culture geometry. No external HDRI is loaded.

Only the key casts real-time PCF-soft shadows. Its bounded 9.6m shadow frustum,
near/far range and small normal bias keep equipment shadows local and reduce
surface acne/detachment. Shadow resolution is capped at 2048 and drops to 1024
with the existing automatic Balanced mode. Paused camera navigation reuses the
shadow map; asset loading and process motion invalidate it. Transparent fluid,
thermal overlays and first-person hands do not cast opaque shadows. Nine static
floor contact decals share one locally generated 128px radial texture to ground
the equipment and supporting furniture without a screen-space AO/postprocessing
pass. They approximate contact occlusion; dynamic shadows still come from the
moving physical meshes.
