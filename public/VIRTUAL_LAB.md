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
