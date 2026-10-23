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
