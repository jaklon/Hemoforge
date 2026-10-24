# Stage D — Guard decisions return to the virtual reactor

Historical Stage D increment. [Stage E](VIRTUAL_LAB_STAGE_E.md) adds live ErythroPilot and CulturePlan adapters;
the intervention contract below still applies.

Extends the [Stage C culture engine](VIRTUAL_LAB_STAGE_C.md) with a user-confirmed intervention loop.
Model ID `virtual-culture-flex2-v3`; stream schema **3**. Update frontend and backend together.
The culture equations/noise assumptions are unchanged; the model version changes seeded assay draws.
The loop is: sample → release FLEX2 → review in Guard → preview/confirm decision → 3D execution →
apply medium transfer → collect a new sample to measure the effect.

This is a local, synthetic teaching environment. No real pump, physical reactor, clinical decision,
external AI inference, paid service or database is controlled.

## Actions and finite-volume mixing

Fresh medium is assumed cell-free with glucose=24, glutamine=4, lactate=0 and ammonium=0 mmol/L.
The following are explicit software assumptions, not operating recommendations or validated equipment protocols.

| Action | Presets | Volume effect | Cell effect |
|---|---|---|---|
| Feed fresh medium | 10 or 25 mL | Vafter=Vbefore+F; maximum 550 mL | Cell numbers conserved; densities diluted |
| Medium exchange | 25% or 50% | Equal removal/replacement; V unchanged | Ideal 100% cell retention |

For feed, extracellular concentration Cafter=(Cbefore*Vbefore+Cfresh*F)/(Vbefore+F).
Viable and dead densities multiply by Vbefore/(Vbefore+F); neither cell population is discarded.
For exchange fraction f, Cafter=(1-f)*Cbefore+f*Cfresh; cell densities and volume stay unchanged.
The ideal retention assumption is visible in both monitors. It does not model imperfect filtration,
centrifugation, shear damage, settling, viability loss, pump dynamics or a particular retention device.
pH follows the existing illustrative metabolite surrogate; no real acid/base titration is simulated.

Sampling remains a separate, well-mixed removal of both cells and solutes. The ledger now exposes
working, sampled, added and exchanged volumes. Exchanged volume is cumulative turnover, not net volume loss.
V=500+added-sampled remains true; exchange leaves V unchanged. Closed-loop actions change subsequent
culture integration; the original fixed Stage B time curves are not used.

## Time, authority and execution

Guard submits one confirmed decision. The backend queues it and pauses ordinary culture progression.
The visible controller acknowledges it on a rendered frame, starts an **illustrative four-second pump
animation representing three culture minutes**, and integrates normal culture biology over that interval.
Transfer occurs atomically once, at animation completion. Medium composition and cell dilution do not
partially change during the presentation. Rendered particles/pump indicator show progress, not live sensors.
The camera moves to the reactor when execution begins; procedural supply/waste bottles, hoses and flow
particles provide feedback. All are free repository-native geometry; Kenney CC0 assets are retained.

The existing frame accumulation, bounded deltas, one-controller sequencing, hidden-frame pause,
disconnect pause and heartbeat watchdog still govern time. Guard cannot advance the clock.
A hidden/stalled controller leaves a decision queued or pauses a partially executed action. Restore the
3D window and use **Lanjutkan waktu** if execution is paused. No catch-up is performed.
The same sequence cannot execute twice. HTTP request IDs separately deduplicate decision retries:
same ID/same content returns the existing status; same ID/different content is rejected.

Cancel from Guard before completion prevents the transfer, whether queued or partially animated.
Biology/time already advanced during partial execution remain; cancellation does not rewind them.
Cancellation is idempotent. Applied transfers cannot be undone by cancelling; inspect and remeasure instead.
Revoking Guard access from the 3D controller also cancels any unfinished action.

## Local operator pairing

A random session link continues to grant **read-only** monitoring. Viewer WebSockets remain read-only.
To enable decisions, the session creator uses **Buat kode pairing Guard** in the 3D window, then enters that
code into Guard. The controller capability authorizes code generation in a custom request header.

- 12 random hex characters, one use, 120-second validity, at most ten attempts per issued code.
- Exchange returns a random 32-byte operator capability stored only in that Guard tab's sessionStorage.
- A new successful pairing rotates/revokes the old operator capability. Use **Pasangkan ulang kontrol**
  if another Guard tab replaced your authorization.
- All decision/cancellation requests require the operator header and same local Host/Origin/custom-action
  checks. Controller and operator capabilities are scoped to a single session and different permissions.
- **Cabut izin kontrol Guard** invalidates operator capability and outstanding pairing code.
- Credentials/codes are never in monitor URLs, public WebSocket snapshots, decision records or audit exports.
  This remains a localhost capability prototype, not user identity, production authorization or multi-tenant isolation.

Pairing endpoints: POST `/api/v1/lab/sessions/{id}/pairing`, `/pair`, `/revoke-operator`.
Decisions: POST `/api/v1/lab/sessions/{id}/interventions` and `/interventions/{request_id}/cancel`.
The existing controller WebSocket accepts `execute` with an intervention ID; viewers cannot submit it.
No browser storage is shared implicitly across windows; a newly opened Guard tab needs pairing.

## Decision gates and audit

The server validates every decision, independently of UI controls:

- One active queued/executing action; no concurrent sample handling or assay.
- A connected 3D controller and enough time to complete before 168 h.
- The latest released, QC-passed sample must be explicitly referenced and no older than 24 culture hours.
  This is a teaching freshness policy, not a biological sampling standard.
- After an applied action, a new valid FLEX2 measurement is required before another action. A rejected assay
  does not satisfy this requirement; a cancelled action does not consume the observation.
- Fixed supported presets, valid idempotency ID, bounded reason text, 550 mL upper volume, forty decisions/run.
- Capacity for another assay and sufficient remaining volume to sample after exchange.

The decision audit records preset, amount, user reason, source sample/time, requested/started/completed culture
times, status/progress, cancellation reason and applied volume outcome. Both monitors receive the same history.
Guard's old observations remain immutable and their hash does not change just because an action completed.
Only a new completed FLEX2 assay adds evidence. No hidden reactor chemistry is streamed as a measured result.
The monitor explains the source, modeled transfer assumptions and the need to remeasure.

**Unduh audit JSON** includes the public decision history and volume ledger, excluding tokens, pairing codes,
hidden reactor state and pending frozen sample. As before, it contains a session read ID, is a local export,
cannot resume a run, and is not a tamper-proof or durable production audit system.
Sessions use one API worker, expire after an hour without accepted activity and are lost on restart.

## Verification

Offline tests cover cell/solute mixing conservation, ideal retention, future kinetic effects, volume ceiling,
no transfer before animation completion, pause/resume, cancellation without time rollback, exact-once retries,
new-evidence/freshness gates, controller disconnect, assay/run limits, pairing expiry/one-use/attempt bounds,
cross-session token refusal, revocation and two-window transport/reconnect.
Frontend tests cover decision eligibility, source consumption after application and credential-free URLs/bodies.
Software invariants are tested; biological and physical equipment equivalence is not claimed.

### Local browser proof — 2026-10-23

Tested the real Vite → local API → two WebSocket monitors path using metabolite_stress/seed 42:

- Initial FLEX2 at 0 h, released 0.075 h: lactate 13.702 mmol/L, working volume 499 mL.
- Generated a controller-authorized code and paired the separate Guard tab. Read-only mode changed to control mode.
- Previewed and confirmed 50% medium exchange, referencing FLEX2-001. Both monitors showed queued → executing →
  applied; 249.5 mL was exchanged at constant 499 mL, completing at 0.125 h. Old observations were retained.
- New FLEX2-002 at 0.125 h, released 0.200 h: lactate 7.071 mmol/L, volume 498 mL after sampling.
- Confirmed a 25 mL feed referencing FLEX2-002. It completed at 0.250 h, raising volume 498 → 523 mL.
- FLEX2-003 at 0.250 h, released 0.325 h: lactate 6.624 mmol/L, volume 522 mL. A subsequent 10 mL feed
  completed at 0.375 h, raising volume to 532 mL. Cancellation was unavailable after that transfer completed.
- FLEX2-004 at 0.375 h, released 0.450 h: lactate 6.529 mmol/L, volume 531 mL.
- Sent another 10 mL feed and cancelled before completion. Both monitors showed cancelled; partial elapsed
  culture time was retained (approximately 0.453 h) and volume stayed 531 mL with no additional feed.
- Refreshing Guard recovered all four measurements and four decisions, including the cancelled entry, and
  restored its tab-scoped operator capability. Revoking access from 3D returned Guard to read-only mode.
- Final ledger: 500 + 35 added - 4 sampled = 531 mL; 249.5 mL exchanged is recorded separately.
- Downloaded Stage D audit JSON retained the four measurements and four decision records (three applied,
  one cancelled), with the same volume ledger and no tokens, pairing code or hidden reactor/frozen sample.
  Both final browser pages had no console errors/warnings.

The browser visibility control did not simulate document-hidden suspension reliably in this environment;
therefore no browser claim is made for that condition. Frame/hidden-time exclusion and partial pause/resume
are covered by automated tests. Physical monitor placement and sustained GPU/FPS performance were not benchmarked.

Validation: TypeScript and production build passed; 56 frontend tests passed. Offline Python suite: 54 passed,
36 database-dependent tests explicitly skipped, with external networking disabled. The existing lazy Three.js
chunk size advisory remains; no dependency or paid asset was added.
