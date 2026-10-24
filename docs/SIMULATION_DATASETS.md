# Dataset Live: continuous synthetic culture data

Dataset Live is an opt-in local data generator. In Monitor 01 choose **Dataset
Live · otomatis berkelanjutan** (the default for new sessions), then **Mulai
Dataset Live otomatis** once. There are no individual scenario buttons in this
mode. Guided sessions retain their manual controls and render-driven clock.

## Clock and durability

- A single Python API worker advances a fixed 0.1-second wall-time quantum.
  Browser FPS, the number of viewers, tab visibility, WebGL failures and a closed
  browser cannot advance or stop this clock. 3D is a view of acknowledged server
  state. Sensor cadences and release delays still use modeled culture hours.
- At 168 culture hours, the same campaign starts another batch with a new seed,
  initial condition and catalogue case. In-memory history resets per batch;
  committed data from every batch remains in SQLite. Pause/resume and playback
  speed apply to the server clock. Automatic transfers run for their existing
  four process seconds; the guided one-third presentation setting is disabled.
- Default storage: `data/simulation/culture.sqlite3`, relative to the API working
  directory. `HEMOFORGE_DATASET_PATH` can select a different database path before
  API startup. Data is ignored by Git. Do not delete its `-wal`/`-shm` files while
  the API is running; they are SQLite's transaction files.
- Checkpoints and new records commit together approximately once per second,
  including during transfers. A completed batch and its replacement checkpoint
  commit atomically. Restarting the API restores campaigns automatically. There
  is no fabricated progress during API downtime or computer sleep. An abrupt
  process kill may lose up to the last uncommitted second; replay resumes from
  the last committed state without duplicating committed rows.
- The computer and API must remain running. The browser reconnects persistent
  campaigns automatically, with bounded backoff. Keep the original controller
  tab to retain pause/speed controls: its token uses sessionStorage only. A new
  tab/browser without that token can monitor/export but cannot control the run.
  Database checkpoints store a controller-token digest, never the raw token.
- Run the API with **one worker**. An OS writer lock rejects another writer for
  the same file. At most four campaigns can be retained; creation rejects a new
  one while another campaign is running. Existing campaigns can be reopened from
  the Monitor 01 launch screen. Dataset files are not automatically deleted.
- A shared 512 MB database/WAL limit and a 256 MB free-disk reserve stop recording
  with a visible error rather than silently dropping data or filling the disk.
  Export/copy data and arrange a fresh database before growing further.

Local API command (from the repository root):

```powershell
.\.venv\Scripts\python.exe -B -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --workers 1
```

The frontend uses the normal local Vite server on port 8443. Open `/#poc/lab`.
No paid service, GPU, external model API or instrument is involved.

## Coverage catalogue v1

Each shuffled coverage cycle includes these 20 cases. Severity, onset, duration,
initial density/media, sensor noise and response delay vary reproducibly by seed.
The catalogue is finite and extensible, not a claim to cover every real-world
biological failure.

| Case | Modeled behavior |
| --- | --- |
| Baseline | Different initial culture/media conditions |
| Acid load | Gradual pH decrease; base output increases |
| Alkaline load | Gradual pH increase; acid output increases |
| Low DO | Restricted aeration, fewer bubbles; AUTO increases O2/RPM |
| High DO | Excess oxygen delivery |
| Glucose depletion | Increased nutrient demand |
| Glutamine depletion | Latent nutrient loss, explicitly not measured by these sensors |
| Lactate accumulation | Increased metabolite load |
| High temperature | Sustained thermal load |
| Low temperature | Excess cooling |
| Core dropout | Rejected pH/DO/temperature readings |
| Trace dropout | Rejected glucose/lactate readings |
| ViaMass dropout | Rejected capacitance / missing cell estimates |
| Trace drift | Slowly increasing sensor bias |
| ViaMass drift | Slowly increasing capacitance bias |
| Acid + low DO | Combined process disturbance |
| Nutrients + low DO | Combined demand/aeration stress |
| Temperature + lactate | Combined thermal/metabolite stress |
| Slow growth | Latent reduction in modeled division |
| Nutrients + Trace dropout | Nutrient stress with missing chemistry evidence |

Physical loads settle with an illustrative 0.75-culture-hour first-order response,
without instantly overwriting sensor measurements. Timed maintenance restores
faults/bias/loads after the planned exposure. This is explicitly labeled scheduled
maintenance, not a sensor-detected diagnosis. Drift without a reference assay is
not automatically declared a detected calibration error. No contamination,
hemolysis, enucleation or real RBC-yield measurement is fabricated.

## Automatic response and comparison data

Three out of four batches use an explicitly labeled **sensor_rules_v1** policy;
one quarter per coverage cycle is **observe_only**, preserving untreated comparison data.
Untreated cases rotate across cycles, so scenario identity is not permanently tied to one policy. Disturbances also vary between expansion and differentiation phases. The policy is rule-based software, not OpenBioLLM/Evo2 inference or a validated
control policy. It sees released, fresh, QC-passed sensor receipts and attributed
cell estimates; hidden plant chemistry never enters its decision function.

After a seeded response delay, observed pH/DO/temperature alarms can restore the
corresponding virtual supply/load. Glucose below the recovery threshold prompts
a reviewed-in-software 1,250 mL feed; lactate above 6 mmol/L or repeated estimated
count declines can prompt medium exchange. Volume, maximum action count, fresh
post-transfer evidence and source checks still apply. The causal prescription
is recorded as a synthetic policy action, not as a proven correct clinical or
biological label. In particular, a cell-count decline does not identify its
cause. Supply restoration or acknowledgement never clears an alarm; only a new
valid recovery observation can do that. Missing evidence blocks chemical dosing.

Additional teaching alarm thresholds: high pH >7.55 (critical >7.7, recovery
<=7.45), high DO >65% (critical >80%, recovery <=60%), low temperature <36 C
(critical <35.5, recovery >=36.8), high temperature >38 C (critical >39, recovery
<=37.4), lactate >6 mmol/L (critical >10, recovery <=5.5). The existing low pH,
low DO and low glucose thresholds remain. All are assumptions, not specifications.

## Exports and training use

Both monitors have **Dataset Live** download controls. CSV exports stream an
already committed database snapshot, so collection can continue. Counts are
receipt/row counts; long-form sensor CSV may have several channel rows per receipt.

| Table | Purpose |
| --- | --- |
| `sensors.csv` | Long-form actual virtual sensor outputs, QC, units via manifest, measured/released/expiry time; rejected outputs have empty values |
| `estimates.csv` | ViaMass-derived density/count, source receipt IDs and uncalibrated conversion provenance |
| `controls.csv` | Actuator commands, setpoints and active transfer state |
| `events.csv` | Disturbances, alarms, maintenance, decisions and applied outcomes, with actor/source IDs |
| `truth.csv` | Hidden model state and active disturbance labels, for target/evaluation construction only |
| `runs.csv` | Batch seed, catalogue case, parameters, policy, split and completion status |
| `manifest` | Format/catalogue versions, units, assumptions and training caveats |

For Guard risk prediction, construct future event labels separately and limit
input features to records whose **available_at_hour <= prediction time**. For
ErythroPilot/CulturePlan, fit trajectories using past released estimates, stage,
recorded volume and available chemistry. Keep source IDs to avoid counting an
old Trace value attached to several cell estimates as a new measurement.

Never feed truth, scenario identity, planned events, future actions or future
sensor results into predictors. Split/group entire batches (and duplicate seeded
replicates), not neighboring rows. Seed-derived train/validation/test assignments
are stable; their proportions converge over many batches rather than being
promised for a small sample. Data carries `synthetic_unvalidated` evidence.
These data support pipeline development and model testing; predictive performance
on this generator does not establish real-world biological accuracy. Independent
experimental validation and calibration are still needed.

## Sound

Click **Aktifkan suara lab** once to satisfy browser audio permission, or use
**Uji suara bip-bip** on a connected session. The output meter verifies that the
page generates a signal; OS/speaker/tab mute is outside that meter.

- Normal running culture with valid sensors: two short beeps every **4 seconds**.
- Active warning or sensor/QC fault: every **0.5 second**.
- Active critical alarm: every **0.3 second**.
- Acknowledgement does not slow the warning rhythm while the condition persists.
- Paused normal culture has no normal-process beep. Hidden/offline pages are
  silent; the dataset itself continues on its server clock.

Volume/mute are available. All audio is generated locally with Web Audio, using
one reused context/buffer and bounded oscillators; no recording or paid asset.
