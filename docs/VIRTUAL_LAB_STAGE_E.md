# Stage E — live ErythroPilot and CulturePlan

Extends [Stage D](VIRTUAL_LAB_STAGE_D.md). The same authoritative in-memory session now supplies Guard,
ErythroPilot and CulturePlan. Stream schema 3 and culture model `virtual-culture-flex2-v3` are unchanged.
New derived adapter version: `live-modules-v1`. No asset, package, hosted inference or database is added.
Existing Kenney CC0 decorations and procedural equipment/hands are retained.

## Data and routes

- Controller: `#lab/{id}`; read-only dashboards: `#guard/live/{id}`, `#pilot/live/{id}`, `#plan/live/{id}`.
- Switching dashboard modules within a session retains its WebSocket and analysis settings. A different
  session remounts the dashboard, preventing old results or credentials from becoming its active input.
- `POST /api/v1/lab/sessions/{id}/analytics` is a local read-only operation. It requires the same local
  Host/Origin policy plus `X-HemoForge-Action: virtual-lab`. The random session ID is the existing read capability.
  It does not authorize actions on the reactor. Operator pairing remains necessary for Guard decisions.
- Body contains only `source_hash`, `horizon` (12/24/48), `target_million` (finite 1–1,000,000).
  Extra fields, counts, provider URLs and credentials are refused. A mismatching published-source hash returns 409.
- The API copies its public snapshot before CPU work in a threadpool. It reads only passed, released FLEX2
  observations; hidden culture state and frozen pending aliquots never enter fitting. Reading does not extend TTL
  or advance culture time. The existing session/assay limits bound each fit (128 paths, at most 49 hourly points).
- Response includes session/batch IDs, full published-source hash, a separate fitted-input hash, segment ID/start,
  source sample IDs, settings, status/reason, existing prediction envelope, target plan and explicit GP withholding.

The browser aborts superseded requests, debounces settings by 250 ms, times out at 15 seconds and rejects
responses for an old session/hash/segment/settings. Evidence changes, completed/cancelled actions, settings and
reconnect trigger analysis; clock/progress ticks do not repeatedly refit. Staleness/active-action holds are also
evaluated immediately from the stream. No server key or operator/controller capability is sent to analytics.

## Scientific scope

ErythroPilot reuses `backend.predictions.predict_growth` (`growth-lognormal-v2`, NumPy, seed 42): fit log-count
drift and interval residual variation to observed total viable cells (millions), then display 128 positive paths.
The forecast starts at the latest **collection** time. Publication happens later, so the UI explicitly distinguishes
forecast origin, latest release and current simulation clock. Intervals are simulated spread, not validated coverage.

Fitting requires at least three positive, ordered QC-passed observations spanning six culture hours, with the
latest collected at most 24 culture hours ago. Only observations collected at/after the latest **applied** action's
completion belong to the current segment. Active actions withhold fitting; cancelled actions preserve the segment.
This avoids fitting across the jump caused by feeding/exchange. New segments need fresh evidence. There is no
static/literature or bundled-data fallback. Numerical failures, stale results and disconnection withhold forecasts.

ErythroPilot's three-hour checkpoints reconstruct data availability separately: `available_at_hour <= checkpoint`.
A sample collected at 2.980 h but released at 3.055 h cannot enter the 3 h checkpoint. Empty checkpoints remain
empty; failed assays do not create numerical rows. History remains intact after interventions, with action IDs
as of each checkpoint. The report uses the existing monitoring summary rules, not the hidden culture trajectory.

CulturePlan uses the same fit for a **generic viable-cell count target**, without claiming mature RBC output:

- fold = target / last observed count;
- fitted doubling time = ln(2) / positive fitted drift;
- ETA from observation = ln(fold) / positive fitted drift; target hour = observation hour + ETA.

Non-growing trends have no ETA. An observed target is labelled as a historical measurement, not a current hidden
reactor count. Projected target time passing requires a new measurement to confirm; estimates beyond the session's
168 h limit are labelled. The operation ledger is current public volume accounting, not continuous chemistry sensing.
The planner does not estimate future medium demand, differentiation, enucleation, blood group or clinical blood units.

**Independent-experiment GP remains withheld.** Sequential samples from one reactor are not independent controlled
condition/response replicates. The adapter does not fabricate DOE rows, add demo experiments, or rename operational
ammonium to ammonia. A future experiment design and valid outcome contract is required before live GP ranking.

## Local verification

Run the API with one worker via `start-python.ps1`, Vite on 8443, then follow [the walkthrough](../public/VIRTUAL_LAB.md).
Use measurements around 0/6/12 culture hours at 1 h/second and keep the 3D controller visible. Dashboard module
changes do not control time. Pausing or hiding the 3D controller pauses progression as in earlier stages.

Automated tests cover released-only fitting, hidden-state independence, post-action segments, cancelled actions,
short/sparse/stale/invalid/non-growing trends, out-of-run targets, local origin/header/hash/settings restrictions,
no session mutation, checkpoint release gating, request payloads and frontend provenance invalidation.
Full offline verification blocks external sockets and skips database tests. Software evidence does not establish
biological validity or physical two-monitor performance. Sessions still expire or disappear on API restart.

Browser walkthrough: one balanced session published FLEX2-001/002/003 at 0, 23.725 and 31.636 h. All three
modules showed matching source IDs. Changing to a 48 h horizon and a 2,000-million-cell target produced a
target estimate at 62.339 h and preserved settings across module switches. A confirmed 10 mL Guard feed
changed volume 497 → 507 mL and reset fitting to a segment starting at 31.761 h. FLEX2-004 was then the
only eligible input; forecasts/ETA remained withheld until enough new samples. These are synthetic UI checks,
not a claim that the fitted target was experimentally achieved. The full regression suite passed 59 TypeScript
and 61 Python tests; 36 database tests were skipped for the offline run. Type checking and production build passed;
Vite retains the existing lazy-loaded Three.js chunk size warning.
