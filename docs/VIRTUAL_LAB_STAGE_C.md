# Virtual Lab Stage C — culture, sampling and virtual FLEX2

Historical Stage C baseline. [Stage D](VIRTUAL_LAB_STAGE_D.md) adds the return decision path,
model version 3 and stream schema 3; it supersedes the earlier no-intervention scope below.

Implements a reproducible, uncalibrated batch-culture teaching model, replacing Stage B's fixed time curves.
Model ID: `virtual-culture-flex2-v2`; stream schema: **2** (frontend/backend must be updated together).
All computation is local Python; no database, GPU, NVIDIA, LLM, telemetry or paid asset service is used.
This extends [Stage A/B](VIRTUAL_LAB_STAGE_AB.md); the equations, sampling and timing below supersede its
fixed formulas, constant 500 mL volume, noiseless readings and five-second presentation interval.

## Model and assumptions

State: viable density Xv and dead density Xd (million cells/mL), glucose G, glutamine Q, lactate L and
an operational ammonium pool A (mmol/L), with working volume V (mL). Initially Xv=1, Xd=1/49, V=500.

| Scenario | G | Q | L | A |
|---|---:|---:|---:|---:|
| balanced | 24 | 4 | 0.6 | 0.1 |
| nutrient_limited | 4 | 0.6 | 0.6 | 0.1 |
| metabolite_stress | 24 | 4 | 14 | 3 |

The following are **invented teaching parameters**, not transferred or fitted to BEL-A, AGE1.HN, CHO or Nova data.
Time is hours. Concentration constants in the factors have the same units as their substrates.

```text
fg = G/(1+G); fq = Q/(0.3+Q); n = fg*fq
mu = 0.04*n / ((1+L/18)*(1+A/4)) * max(0, 1-(Xv+Xd)/20)  [h^-1]
kd = 0.0015 + 0.02*(1-n) + 0.008*A/(4+A)                  [h^-1]
uG = Xv*(mu/0.65 + 0.012*fg)                             [mmol/L/h]
uQ = Xv*(mu/3.5 + 0.002*fq)                              [mmol/L/h]
dXv/dt = (mu-kd)*Xv; dXd/dt = kd*Xv - 0.003*Xd
dG/dt = -uG; dQ/dt = -uQ - 0.003*Q
dL/dt = 1.6*uG; dA/dt = 0.8*uQ + 0.003*Q
pH = clamp(7.3 - 0.032*(L-0.6) - 0.012*A, 6, 7.6)
viability = 100*Xv/(Xv+Xd)
```

Yield constants 0.65 and 3.5 have units (million cells/mL)/(mmol/L); maintenance constants have units
(mmol/L/h)/(million cells/mL). pH is an illustrative buffer surrogate, not acid/base chemistry.
A is reported under the distinct key `ammonium_mmol_l`; it is not relabeled as the existing ammonia channel
or fed into the ammonia response model. NH3/NH4 speciation is not modeled. Cell lysis is a sink; this is
a limited extracellular model, not a complete elemental/carbon/nitrogen mass balance.
Temperature, oxygen transfer/DO, pCO2, osmolality, electrolytes, differentiation, contamination,
erythrocyte yield and intervention/feed control are not modeled.

RK4 integrates with substeps <=0.02 h; nonnegative state is enforced. Bounded accepted animation commands
advance at most 6 culture hours per command. Irregular frame partitions agree within numerical tolerance.
No Python background timer advances the culture. Assay progression integrates the reactor too.

## Sampling and result units

Choose a withdrawal of 1 mL (default), 3 mL, or 0.1 mL (intentional underfill exercise). The API supports
0.1–5 mL and refuses withdrawals below a 400 mL remaining-volume floor. Up to 100 completed assays/run.
Every well-mixed withdrawal removes cells and all extracellular species in the same proportion.
Concentrations do not jump from withdrawal alone; total cells and solute amounts decrease with volume.
Removed aliquots, including failed assays, are never returned. The 3D liquid height follows remaining volume.

Sampling captures the hidden concentration state at collection. Guided collection/loading deliberately pauses
the culture clock; this is a teaching interaction, not the timing of a real laboratory.
The public pending sample contains only ID, collection timestamp, withdrawal, mixing declaration and before/after
volumes. No pending concentration/count leaks into either window. The checkbox records an operator declaration;
this prototype cannot detect physical mixing, and rejected samples still use a well-mixed withdrawal model.

Count supplied to Guard is reconstructed as **measured viable density × reactor volume after withdrawal**,
in million viable cells, at collection time. It is not an analyzer measurement of the reactor's total cell count.
Density, volume, withdrawal, analyzed volume, collection/release times, QC, uncertainty assumptions and model ID
are retained in the reading. Old measurements are immutable even as the reactor evolves or more samples are taken.

## FLEX2 presentation, noise and QC

Nova's official product page states approximately 4.5 minutes for the full menu and 275 µL sample volume.
Here **8 accepted rendered seconds = 4.5 culture minutes**, independent of the normal 1/6/12 h/s speed.
Stages aspiration → chemistry → cell count → quality review are an illustrative presentation, not a reconstruction
of Nova firmware or exact module timings. This implementation simulates a subset of the advertised channels.

Gaussian analytical variation is reproducible from SHA-256(model ID, seed, sample ID), with default seed 42:

| Quantity | Assumed SD |
|---|---:|
| viable density | 2.5% of sampled value |
| each metabolite | 2% of sampled value |
| pH | 0.01 pH units |
| viability | 0.5 percentage points |

These are **simulation assumptions, not Nova precision, bias, accuracy, confidence intervals or biological uncertainty**.
SDs are applied independently once, at release, to the frozen sample; physical bounds clip negative values,
pH outside 0–14 and viability outside 0–100. The same scenario, seed and sampling schedule/volumes reproduce
results to the stated numerical precision. Changing seed changes the assay variation, not the culture kinetics.

Teaching QC rejects a declared unmixed sample and/or an aliquot smaller than 0.275 mL, after the full assay.
Rejection creates an audit report with explicit reasons and **no numerical observation** for Guard.
An adequate, declared mixed sample passes this limited QC; this does not certify real device QC, calibration,
measurement range, sterility or sample validity. Guard retains previous accepted readings when an assay fails.
A sample taken at 168 h can finish its full interval at 168.075 h; no additional culture run or sample is then allowed.
Pause/resume, visibility loss, controller disconnect and watchdog preserve partial assay progress with no catch-up.

## UI, transport and audit

POST `/api/v1/lab/sessions` optionally accepts `{ "scenario": "balanced", "seed": 42 }`.
`collect` commands additionally accept `volume_ml` and strict boolean `mixed`. Inputs remain bounded and extra
fields are forbidden. Existing local-origin, one-controller token, read-only viewer, sequence deduplication,
session expiry and WebSocket size limits remain. Schema 2 adds scenario/seed, working/withdrawn volume,
protocol timing, assay stage, uncertainty assumptions and completed QC reports.

Monitor 1 displays configuration (applied only to a new session), sampling preparation, volume ledger,
assay stages, published count and rejection history summary. Monitor 2 consumes only QC-passed released
observations using the existing Guard/DataProvider, with matching clock, receipt and provenance.
An additive ammonium channel allows the Guard channel selector to display its simulated measurements without
altering existing ammonia imports. Other HemoForge modules are not yet connected to this session.

**Unduh audit JSON** exports the current public snapshot: released measurements, report metadata and run settings.
It excludes controller tokens and hidden reactor/frozen-sample state. It contains the session read ID; treat
it as a local run export, not an authenticated durable audit trail. It cannot resume a run after restart.
Sessions remain in one API process, expire after an hour without accepted commands and disappear on restart.

## Local acceptance and regression tests

Run `start-python.ps1` (one API worker) and the existing Vite server on 8443, then follow
[the local walkthrough](../public/VIRTUAL_LAB.md).

- Conservation under sampling: all modeled cell/solute amounts decrease by Vafter/Vbefore, concentrations unchanged.
- Glucose/lactate yield and bounded glutamine/ammonium relation; nutrient/metabolite scenarios diverge;
  starvation suppresses growth; all scenarios remain finite/nonnegative for 168 h.
- Irregular integration partitions agree; pause/retransmission does not add time or withdraw twice.
- Seeded measurement variation repeats; changing seed/sample ID changes it without mutating the aliquot.
- Reactor evolves during assay but sampled values stay frozen; no result before completion.
- Underfill/unmixed QC rejects without publishing; failed withdrawals are retained; corrected repeat can pass.
- Full assay at the run boundary, including pause/resume; bounded creation configuration and malformed hello.
- Two-window transport/reconnect/heartbeat and Guard unit/QC adapter regressions.

Automated tests verify software invariants, not scientific calibration or real analyzer equivalence.
Kenney CC0 assets and procedural equipment from Stage A/B are reused; no asset purchases or new dependencies.

### Verified local browser run — 2026-10-23

Exercised the final Vite → local WebSocket proxy → Python engine → real Guard path in two browser pages,
using balanced/seed 42. Guard remained empty during first collection/loading and before assay release.

| Sample | Collected h | Released h | Count (million viable cells) | Remaining mL | QC |
|---|---:|---:|---:|---:|---|
| FLEX2-001 | 0 | 0.075 | 494.927162 | 499 | passed |
| FLEX2-002 | 0.075 | 0.15 | withheld | 498.9 | rejected: underfill + unmixed |
| FLEX2-003 | 125.9778 | 126.0528 | 1597.505153 | 495.9 | passed |
| FLEX2-004 | 168 | 168.075 | 1199.706886 | 494.9 | passed |

Both screens ended paused at 168.075 h, with three published observations and four completed assays.
The rejected assay never added a Guard row; 5.1 mL was removed in total, including its 0.1 mL aliquot.
The final assay retained the full 4.5-minute delay at the boundary and further sampling was disabled.
Refreshing Guard retained all three results. Downloaded audit JSON matched these counts/volumes/times,
included the rejected report and excluded controller token, frozen sample and hidden reactor state.
No console errors/warnings appeared in the final two pages. A render stall in an earlier test tab triggered
the watchdog without advancing time; a fresh visible render tab completed the same first seeded reading.
This is two-page verification, not a physical two-monitor or sustained GPU/frame-rate benchmark.

Validation: TypeScript check and production build passed; 54 frontend tests passed; 45 backend tests passed
with 36 database-dependent tests explicitly skipped in an offline suite (external networking disabled).
The existing lazy Three.js chunk still emits Vite's >500 kB size advisory; no new dependency was added.

## Primary references and their limited role

- [Nova BioProfile FLEX2](https://www.novabiomedical.com/cell-culture-analyzers/bioprofile-flex2/),
  accessed 2026-10-23: reference for nominal full-menu duration, volume and available analytes only.
- [Borchers et al., PLoS ONE 2013, DOI 10.1371/journal.pone.0068124](https://pmc.ncbi.nlm.nih.gov/articles/PMC3732265/):
  primary example of well-mixed mammalian batch models, nutrient/pH dependence and uncertain measurements.
  This implementation uses that general modeling approach; its equations and parameters are our teaching assumptions,
  not a reproduction of the study or a validated model for its AGE1.HN cell line or HemoForge's target cells.
- [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit): CC0 asset source; original license retained locally.
