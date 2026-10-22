# Virtual Lab: Stage A specification and Stage B proof

## Scope and storyboard

Monitor 1: first-person laboratory, camera station arrows, temporary gloved hands, bioreactor, sampling,
virtual Nova BioProfile FLEX2, animation-owned time and assay progress.
Monitor 2: real BioreactorGuard with released synthetic measurements, collection/release timestamps,
live clock and connection status. No manual CSV upload or duplicate Guard implementation.

Flow: create → open monitor → collect (frozen sample) → load → analyze → release to Guard →
advance culture → repeat. Guided handling pauses time; the assay advances an illustrative 4.5-minute culture
interval over five rendered seconds. These deliberate teaching simplifications are visible in the UI.
Scene geometry represents equipment, not an engineering replica or validated lab operating procedure.

## Stack and boundaries

React 19, TypeScript, existing Three.js 0.170, GLTFLoader, FastAPI, Pydantic and websockets.
Stage B uses the existing renderer directly; React Three Fiber / XState / physics are not required for this proof.
Later asset/interaction stages can introduce them after compatibility and performance evaluation.
The existing upload workspace remains independent. A dedicated live DataProvider injects published culture rows
into the existing Guard; demo experiment/marker inputs are never presented as live results.

No database migration or remote service is needed. In-memory sessions use one API worker. Restart loses runs.
Durable PostgreSQL sessions, other module adapters, biological calibration, interventions, free walking,
rigged asset animation, and headset support remain later-stage work.

## Clock and transport contract

- Only the visible 3D render loop proposes bounded animation-time deltas. No timer advances culture in Python.
- Ticks accumulate ≥250 ms, reject stalls >250 ms, and submit at most 500 ms per accepted command.
- Fixed synthetic formulas depend on culture time, not FPS. No catch-up after hiding or reconnecting.
- Backend checks strictly increasing command sequences; repeats cannot produce duplicate effects.
- A single controller authenticates in the first WebSocket message. Viewers cannot send commands.
- Allowed origins: http://localhost or 127.0.0.1 on 8443/8000; non-loopback hosts are refused independently
  of HEMOBOT_ALLOWED_HOSTS. Session creation requires a deliberate custom-header POST.
- Frames: schema_version, session_id, batch_id, revision, ack_seq, culture_hours, running, phase,
  controller_connected, sample metadata, assay progress, released measurements and content hash.
- Hidden culture state/frozen readings are never included in pending sample metadata.
- A controller disconnect pauses immediately. Missing accepted ticks for two seconds pauses via watchdog;
  that watchdog may stop a session but never advances its clock.
- Reconnect/refresh sends a full released-data snapshot. No unbounded event queues. Messages ≤2 KB,
  six viewers/session, sixteen sessions/process, one-hour inactivity expiry and 100 samples/run.

## Scientific and unit contract

The deterministic scenario is generated, uncalibrated software-test data, not BEL-A observations or real device output.
Viable cell density × declared volume yields millions of viable cells. Each reading retains both values.
pH, glucose/glutamine/lactate (mmol/L), and viability (%) are simulated. No pO2-to-DO conversion, temperature,
ammonium interpretation, donor phenotype, genotype or clinical outcome is inferred.
Collection time indexes Guard rows; availability time gates release. Later culture state cannot change an old sample.
Stage B does not model sample-volume loss or analyzer measurement uncertainty; both require the later model review.
Source metadata remains software_test_only and measurements include model_version and sample_id.

## Asset provenance and replacement plan

Downloaded 2026-10-23 from https://kenney.nl/assets/furniture-kit (free CC0; upstream License.txt retained).
Only these GLBs from the original archive are included; no texture/network dependencies:

| File | SHA-256 |
|---|---|
| chairDesk.glb | 46406619186034cbe92b19b79a5f1a8e3f442a17a70a7524ef2c0ad0f35095c6 |
| bookcaseClosedWide.glb | 55b9903e9646dc407ed5237a1c41c1f0a14f9edc22e3392bdb9a4804d846af6a |
| computerScreen.glb | 5942cbad29a2d2b956619569926e81d50a4174403d592fece6556e57632dc643 |

Temporary equipment/hands are repository-native geometry. Later GLBs should preserve bioreactor/sample-port,
analyzer/sample-inlet, and camera anchors plus semantic collect/load/analyze actions. Free material/HDRI candidates:
https://polyhaven.com/ (verify each asset license before adding). No paid or unverified assets are bundled.
References: https://www.novabiomedical.com/cell-culture-analyzers/bioprofile-flex2/
and https://fastapi.tiangolo.com/advanced/websockets/ . Vendor reference does not imply endorsement.

## Acceptance gates

- Two separate windows receive the same session/batch; real Guard starts empty.
- A collected/loaded/pending sample produces zero visible readings until assay completion.
- Released values match both screens; Guard plots collection time and exposes source/units.
- Repeat three samples at increasing times; existing results remain and can be recovered by refreshing Guard.
- Pause, background stall, controller close, API restart, and reconnect show truthful states without catch-up.
- Hidden frozen values, controller tokens, unrelated upload data, and external AI calls do not enter the stream.
- Reject wrong origins, unauthenticated/duplicate controllers, viewer writes, oversized/invalid messages,
  invalid transitions and command gaps. Preserve normal uploads, frontend build and existing numerical models.
- Automated Python engine/transport tests and TS clock/adapter tests; browser two-page walkthrough plus visual QA.

## Browser verification — 2026-10-23

Exercised the real Vite → WebSocket proxy → Python → live Guard path in two browser pages:

- A new session showed zero Guard observations, including after collect/load and before assay completion.
- Completed three collect/load/analyze cycles at approximately 0, 90.845 and 105.835 culture hours.
- Third reading: FLEX2-003, 2015.44 million viable cells, 4.031 million viable cells/mL at 500 mL;
  lactate 13.3 mmol/L. Guard retained the collection timestamp and released it at 105.910 h.
- Refreshing Guard recovered all three released observations. Both windows stayed at 105.910 h while paused.
- Changing the monitor URL to a different session reset the old monitor rather than retaining its observations.
- Refreshing the original controller recovered its sessionStorage control and paused server snapshot.
- API restart invalidated old sessions; the UI provided reconnect/new-session actions.

This verifies the two-page transport/UI flow. Physical placement on two monitors remains a user setup step;
no claim is made about a 60–90 minute soak test or a particular presentation GPU's frame rate.
