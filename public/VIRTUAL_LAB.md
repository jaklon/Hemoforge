# BIOSTAT STR Gen 2 virtual lab — local walkthrough

Open http://127.0.0.1:8443/#poc/lab. The main HemoForge workspace remains separate.

If the services are stopped, run these in two PowerShell terminals from the repository root:

```powershell
.\.venv\Scripts\python.exe -B -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --workers 1
```

```powershell
npm run dev -- --host 127.0.0.1 --port 8443
```

## Two monitors

1. Choose a scenario and seed, then **Buat sesi BIOSTAT →**. New sessions use BIOSTAT STR 50 Gen 2 + BioPAT Trace + ViaMass.
2. Click **Buka dashboard di monitor 2 ↗**. Move that new browser window to the second monitor.
   Keep both windows visible: hiding/minimizing the 3D tab pauses culture. A second tab in the same window is insufficient.
3. Click **Mulai / lanjutkan** on Monitor 01. The default speed is 0.25 culture hours per rendered second.
   Core sensors publish first; Trace becomes available at 0.1 culture hours; the first Trace-linked cell estimate appears at 1.02 h.
4. Use the four camera views to inspect the bag cutaway/impellers, bubbles, probes, controller screen, Trace fluid loop,
   ViaMass display, feed/retention lines, pump rotors and gloved hands. Drag to look around; the arrow toggles play/pause.
5. Dashboard on Monitor 02 distinguishes **VIRTUAL SENSOR**, **MODEL ESTIMATE**, and **NOT MEASURED**.
   Charts use each source's own measurement/release times. Missing channels are never filled from hidden plant state.
6. Switch to Guard, ErythroPilot or CulturePlan with the same session. Counts in these modules are attributed as ViaMass-derived estimates.
   Guard's sensor charts preserve original sensor timestamps separately from count estimates.
7. Change pH/DO/temperature virtual setpoints on Monitor 01 and watch later readings respond. Old readings remain immutable.
8. Use **Jadwal sensor & uji gangguan** to toggle a device fault. Its next scheduled output fails QC and has no numeric values.
   Guard decisions and forecasts wait for fresh passed readings. Recovery also waits for the device's next scheduled reading.
9. Export **Unduh bukti sesi** for public source receipts, estimates, quality, setpoints and the operation ledger.
   Controller/operator credentials, pairing codes and private plant state are excluded.

## Apply Guard decisions

1. After a Trace-linked estimate is available, pause culture to review comfortably.
2. In Monitor 01 generate **Buat kode pairing Guard**. In Monitor 02 / Guard enter the single-use 12-character code.
   The code expires in two minutes. Viewer links alone cannot operate the reactor.
3. Choose a 500/1250 mL feed or 25/50% medium exchange, enter a reason, preview, then confirm.
   Decision sources must be recent (<=3 culture hours), and core/Trace/ViaMass must all be fresh and passed.
4. The visible 3D controller accepts the queued action automatically. Four rendered seconds represent three culture minutes;
   the bounded virtual transfer applies exactly once on completion. It is deliberately an atomic teaching transfer.
5. Check matching applied status and volume in both windows. Resume culture for post-action sensor readings before another decision.
6. Cancel unfinished transfers from Guard, or revoke operator access in Monitor 01. Applied transfers cannot be undone.

The optional retention skid assumes 98% cell retention, not perfect retention and not a base Gen 2 feature.
Feed amounts are profile-specific: the API retains preset codes 10/25 with an explicit multiplier of 50 mL.
The audit records the multiplier and actual transferred volume. Working volume starts at 12.5 L and is capped at 50 L.
Trace uses an illustrative closed dialysis loop with no net withdrawal in this model.

## Data and analysis limits

- Sensor signals: core pH, DO (% air saturation), temperature (C); Trace glucose/lactate (mmol/L);
  ViaMass capacitance (pF/cm). All are **virtual**, not a physical instrument feed.
- Estimates: viable-cell density and count from released ViaMass capacitance, an explicitly assumed stage/size conversion,
  and recorded reactor volume. These are uncalibrated estimates, not direct counts, viability, enucleation or mature RBC yield.
- Unmeasured: glutamine, ammonium (NH4), viability percentage, osmolality, dissolved pCO2 and enucleation.
  Gas oxygen fraction/controller output is not a measurement of dissolved pCO2.
- Illustrative schedules: core every 0.5 h; ViaMass every 1 h with 0.02 h delay; Trace every 2 h with 0.1 h delay.
  Freshness limits are 2/3/5 h respectively. These compressed culture-time settings and noise are not vendor accuracy/cadence claims.
- The private well-mixed model includes nutrient/metabolite dependence, oxygen transfer/demand, pH and thermal feedback,
  and an illustrative expansion-to-differentiation transition at 72 h. It is not a validated protocol or scale-up result.
- Paper br-58-s1-s46 is a review, not a BIOSTAT protocol. The STR studies at smaller scales do not validate this 50 L scenario.
  The assumed stage transition, size conversion, controller gains, synthetic noise and retention require real calibration.
- Local CPU growth analytics uses a rolling 24 h window with at least 2 h between fitting points, >=3 points and >=6 h span.
  Material transfers, user setpoint changes and phase changes start a new segment; routine AUTO corrections do not reset it.
  Growth forecasts/ETA are withheld during differentiation, sensor faults/staleness, active actions or insufficient data.
  Horizons/target ETAs cannot cross the assumed 72 h phase boundary.
- Independent-experiment GP remains withheld: samples from one reactor are not independent DOE replicates.
  RareMatch still requires genotype/phenotype data, not process telemetry. No clinical product release is simulated.

## Local security and cost

Only localhost API access is supported. One controller and up to six viewers, scoped/revocable control tokens,
Origin/Host/action-header checks, bounded commands and idempotent transfers are retained.
Sessions are in one worker's memory, expire after an hour without activity and disappear on restart.
No physical instrument, remote database, NVIDIA, Ollama, hosted LLM, paid asset or cloud resource is called by the simulation.

## Free assets and references

Room props: Kenney Furniture Kit, CC0, https://kenney.nl/assets/furniture-kit . License: /virtual-lab/kenney/License.txt .
BIOSTAT/Trace/ViaMass representations, lab fittings, hands, particles and screens are original procedural geometry.
They are illustrative cutaways, not certified CAD replicas or Sartorius firmware reproductions.

- Gen 2 operating manual: https://www.sartorius.co.kr/wp-content/uploads/2020/12/Manual_BIOSTAT_STR2_SBT6049-e191105-199.pdf
- BioPAT Trace: https://shop.sartorius.com/gb/p/biopat-trace/BioPAT_Trace
- ViaMass manual: https://www.sartorius.co.kr/wp-content/uploads/2021/01/Manual_BioPAT_ViaMass_SBI6015-e_211.pdf
- Kweon et al. 2023, Current status of red blood cell manufacturing in 3D culture and bioreactors: https://doi.org/10.5045/br.2023.2023008
- Gallego-Murillo et al. 2022, Expansion and differentiation of ex vivo cultured erythroblasts in scalable stirred bioreactors: https://doi.org/10.1002/bit.28193

See docs/BIOSTAT_GEN2_SIMULATION.md for the implementation contract. Stage A–E documents preserve the historical FLEX2 design.
# Blender model in Monitor 01

The BIOSTAT vessel now loads an original CC0 Blender model with a brushed steel
holder, polymer bag, impellers, connectors and instrument housing. Its source is
`assets/blender/hemoforge-biostat-gen2.blend`; rebuild and license details are in
`assets/blender/README.md`. Trace and ViaMass also load dedicated original
Blender models from `/virtual-lab/biopat/`. Their editable source is
`assets/blender/hemoforge-biopat.blend`.

Select **BIOSTAT STR** in the camera controls for the vessel view. The model
badge confirms **BLENDER LAB + OPERATOR 5/5** after loading. A labeled procedural fallback
appears if the GLB is unavailable. The legend shows measured FPS and current
render quality. Lower-resolution Balanced mode is selected automatically if
rendering falls below 32 FPS. RPM controls the shaft speed; recorded volume
controls the liquid level. Pause/hidden tabs/disconnect stop process animation.

Select **BioPAT Trace** or **ViaMass** for close-up camera views. Both displays
are labeled HemoForge virtual readouts and use the same released sensor receipts
as Monitor 02. Trace shows glucose/lactate in mmol/L; ViaMass shows capacitance
in pF/cm, not an RBC count. The overlay includes receipt ID, acquisition/release
time and QC state. The Trace heads and circuit motion hold on pause or device
fault. ViaMass has a publication indicator, not a mechanical pump.

Expand **Jadwal sensor & uji gangguan**, toggle a Trace or ViaMass fault, and
inspect the red HOLD state and hidden numeric values. Restore the device, run
until a new passed receipt is released, then pause. The instrument display and
Monitor 02 must agree on the receipt and values. Missing, future, stale, invalid
and disconnected data never become new live values on the virtual screens.

The room and supporting equipment load an original CC0 Blender scene from
`/virtual-lab/laboratory/laboratory.glb`. Editable source:
`assets/blender/hemoforge-laboratory.blend`. It includes casework, washstation,
clean work enclosure, centrifuge, balance, incubator, gas bank, trolley, stool,
ceiling lights and ventilation. Locally generated epoxy and steel textures are
embedded; the room requires no external material or HDRI request. Supporting
screens and gauges are static scenery, separate from the live instrument data.
Process circuits retain their existing free visuals; hands use a dedicated
original CC0 Blender skin and rig.

Choose **Ruangan**, then **Perluas 3D** for a wider inspection view. Drag to look
around. **Kembali ke kontrol** or Escape restores the control panel; resizing
does not reset the session or recreate the canvas. Keep Monitor 01 visible
alongside Monitor 02 while running. The room adds 14 meshes and 38,040 triangles
in a self-contained 2.33MB GLB; existing adaptive resolution remains enabled.
If the room fails to load, its simple procedural fallback remains visible and
the asset badge identifies `laboratory` as a fallback.

## Operator hands and inspection

Choose **BIOSTAT STR**, **BioPAT Trace** or **ViaMass**, run the culture until
fresh passed readings are available, then click **Periksa layar** or the readout
surface. The operator approaches the screen, extends an articulated index finger,
inspects it and retracts. The gesture is visual only: no actuator or Guard
approval is sent by touching a display. Process changes remain in Monitor 02.

Pause freezes the gesture and camera approach. Resume continues from that pose.
Sensor faults, stale readings, connection loss and hidden/stalled frames also
hold interaction. Active interventions block inspection. Changing camera station
cancels it. **Kurangi gerakan** cancels inspection and removes hand sway while
the culture and its measurements continue normally.

The original 185KB glove GLB has two skins, four material submissions and 6,752
triangles. Editable source and Blender-only pose study:
`assets/blender/hemoforge-operator-hands.blend` (frames 1–144).

## Walk through the laboratory

Click **Jalan FPS · WASD**, then click inside the 3D room to focus the keyboard
and request mouse capture. W/S move forward/back; A/D strafe. Move the mouse to
look around. Escape releases capture so dashboard/control buttons are accessible.
If mouse capture is unavailable (including the embedded preview browser), the
status changes to **Mouse: tahan dan drag untuk melihat**: hold the mouse button
and drag instead. WASD continues to work while the 3D canvas has keyboard focus.

Approach a virtual display and aim the centre dot at it. Within 1.2m and with
an unobstructed view, the dot turns gold and the device name appears. Press E,
click the aimed screen, or use **Periksa layar**. Inspection still requires the
culture to be running with valid device data and no active process intervention.
Walking cannot issue feed, setpoint or Guard commands. Unlike preset inspection,
FPS inspection keeps the camera at the user's position; movement and look hold
while the gesture runs. Resume the culture to finish a paused gesture, or use
**Reset posisi**, a preset camera or **Keluar mode FPS** to cancel it.

Walking works while the culture is paused; it does not start or advance the
process clock. Move freely at a fixed eye height (1.65m) and speed (1.6m/s).
Conservative collision footprints prevent walking through walls, the reactor,
tables, gas bank and supporting equipment. There is no jumping or vertical flight.
Focus loss, Escape, hidden tabs and pointer cancellation clear held keys; long
frame gaps do not cause movement catch-up. Typing in dashboard controls is not
captured. **Reset posisi** returns to the clear aisle without changing the batch.
Preset camera buttons exit FPS mode. Existing Blender assets/materials are reused
without downloads, new dependencies, paid assets or extra shadow maps.
