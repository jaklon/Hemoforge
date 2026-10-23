# HemoForge Virtual Lab — Stage E

Open http://127.0.0.1:8443/#lab. Choose a scenario/seed under **Pengaturan sesi baru**,
create a session, then click **Buka dashboard di monitor 2 ↗**.
Move the opened tab into a separate browser window on the second monitor. Keep the 3D window visible.

1. Collect the initial sample at 0 h.
2. Load it into virtual FLEX2 and start analysis.
3. Eight seconds of accepted rendered animation release the result to the actual Bioreactor Guard component.
4. Resume culture, pause at a new time, and repeat sampling. Guard appends the result at collection time.
5. Refresh Guard to recover released results. Pause, hide, or close the controller to stop culture time.
6. Try **3 mL** sampling: the volume ledger and 3D liquid level decrease; the receipt retains density × remaining volume.
7. To test QC, choose **0,1 mL** and/or uncheck **Sampel sudah dihomogenkan**, then complete another assay.
   Both windows show rejection reasons. Guard retains previous readings and receives no new numerical row.
   Restore **1 mL** and mixing for the next sample. A failed sample still consumes reactor volume.
8. Use **Unduh audit JSON** to save settings, released measurements and completed QC reports locally.
   It excludes controller tokens/hidden culture state; it cannot restore a run after restart.
9. To compare scenarios, change the new-session settings and click **Sesi baru**. The old Guard link remains tied
   to its old session; use the new session's monitor link. Scenario/seed changes never mutate a running culture.

## Apply Guard decisions to the 3D reactor

1. Start a fresh run (the previous completed 168 h run has no time left for interventions).
   **Stres metabolit** is useful for observing the simulated dilution effect of medium exchange.
2. Complete a valid FLEX2 assay. In the 3D window, click **Buat kode pairing Guard**.
   Enter its 12-character code into **Kode dari layar 3D** on Guard and click **Hubungkan kontrol Guard**.
   The code is single-use and expires after two minutes. A monitor link by itself remains read-only.
3. Review the released measurement, select **Tindakan simulasi** and enter **Alasan keputusan**.
   Choose **Pratinjau keputusan**, check the source/volume/assumptions, then **Konfirmasi & kirim ke bioreaktor**.
4. Keep the 3D window visible. The reactor camera and pump animation execute the decision automatically.
   Four accepted rendered seconds represent three culture minutes. Transfer is applied once at completion.
5. Confirm the same **Sudah diterapkan** status and volume ledger in both windows. Old measurements do not change.
6. Collect, load and analyze another FLEX2 sample to see the changed concentrations/density in Guard.
   A new QC-passed measurement is required before another action; observations older than 24 culture hours are refused.
7. Use **Batalkan tindakan yang belum selesai** in Guard to cancel before completion. Transfer is prevented;
   culture time/biology already elapsed during the animation are retained. Applied actions cannot be cancelled.
8. **Cabut izin kontrol Guard** on the 3D window revokes access and cancels unfinished actions.
   New pairing rotates the prior operator capability. Use **Pasangkan ulang kontrol** when needed.

Feed presets add 10/25 mL; exchange presets replace 25/50% at constant volume with **ideal 100% cell retention**.
Fresh medium is assumed glucose 24, glutamine 4, lactate/ammonium 0 mmol/L and no cells. Feed conserves cell
numbers while diluting density. These are teaching assumptions, not real operating instructions or validated
pump/retention performance. Working volume is capped at 550 mL; intervention audit is included in JSON export.
If hidden frames or a render stall pause execution, restore the 3D window and choose **Lanjutkan waktu**.

This is an uncalibrated synthetic teaching scenario. No physical device, NVIDIA, LLM, or remote database is called.
The eight-second presentation compresses a 4.5-minute culture interval, using Nova's nominal full-menu time
as reference. The virtual stages are illustrative, not a reconstruction of Nova firmware or laboratory SOPs.
Guided sample handling pauses the culture clock. FLEX2 results are frozen at collection and hidden until release.
The reactor itself keeps evolving during the assay. The initial volume is 500 mL, with a 400 mL minimum
remaining volume and 100 completed-assay cap. Viable cells, glucose/glutamine and lactate/ammonium evolve
together using a well-mixed batch model. pH is an illustrative buffer surrogate.
The count is measured viable density (millions/mL) × reactor volume after withdrawal, not a directly measured total.
The virtual assay analyzes 0.275 mL from the removed aliquot; no part is returned to the reactor.
Analytical SD assumptions: density 2.5%, metabolite channels 2%, pH 0.01 and viability 0.5 percentage points.
These are synthetic variation settings, not Nova accuracy specifications or biological uncertainty bounds.
Scenario, seed and matching sample times/volumes reproduce results. Scenarios are not calibrated for BEL-A.
Temperature, DO, genetic data and other unavailable measurements remain absent. RareMatch, independent
experiment GP, real instrument integration and biological validation remain later work.

## Live ErythroPilot and CulturePlan on monitor 2

1. Use **Bioreactor Guard / ErythroPilot / CulturePlan** tabs in the same live dashboard. They share
   the session, clock, sample IDs and source hash. Normal workspace routes remain separate input workspaces.
2. Complete an initial valid assay. Run the 3D clock at **1 h / detik**, pause around 6 h, sample/analyze,
   then repeat around 12 h. Aim for at least three observations spanning six hours in the same intervention segment.
   FLEX2 takes eight accepted rendered seconds; keep monitor 1 visible throughout.
3. ErythroPilot fits the existing local Python log-growth engine and shows 128 seeded paths with a selectable
   12/24/48-hour horizon. The origin is the last sample's collection time, not the current simulation clock.
   Checkpoints appear every three culture hours and include only results already released at that checkpoint.
4. CulturePlan uses the same measured trend for a **viable-cell target in millions**, fold expansion, fitted doubling
   time and estimated target hour. Change **Target sel viabel (juta)** to recompute. The volume ledger follows
   actual sampling/feed/exchange operations. A declining trend has no target ETA; a target beyond 168 h is labelled.
5. Apply a Guard action. Old results remain in history, but fitting resets after the completed action. Collect
   three new samples spanning six hours to fit the new segment. Cancelled actions do not reset fitting.
6. A sample older than 24 culture hours, disconnected stream, unfinished intervention, invalid settings or
   insufficient observations withholds the prediction. No demo curve or literature rate fills the gap.
7. **Unduh analisis & checkpoint** and **Unduh rencana live** export source IDs/hashes, settings, local engine
   metadata and public derived results. They exclude controller/operator credentials and hidden reactor state.

CulturePlan's GP experiment ranking is deliberately unavailable in this live mode. Serial samples from one reactor
are not independent experiments with controlled conditions and outcomes. Ammonium is not renamed to ammonia;
no synthetic DOE replicates are manufactured. This planner does not predict mature RBC yield, enucleation,
blood group, or clinical production. The growth fit and its intervals are uncalibrated teaching projections.

Sessions live only in one API process, expire after an hour without accepted commands, and disappear on restart.
This prototype is limited to localhost; do not expose it as a public/multi-user service. The random session ID is
a read capability. The controller token stays in sessionStorage and the initial WebSocket message, never the URL.
One controller is allowed; refreshing that original tab resumes its control after the old socket disconnects.

## Free asset credits

Three decorative GLBs are from Kenney Furniture Kit, Creative Commons Zero (CC0):
https://kenney.nl/assets/furniture-kit . Original license: /virtual-lab/kenney/License.txt .
The bioreactor, analyzer, hands, room, and arrows are procedural temporary geometry created for this prototype.
No paid assets were bought. Equipment and hand models can be replaced later while preserving the interaction anchors.

See docs/VIRTUAL_LAB_STAGE_C.md in the repository for equations, units, assumptions, references and tests;
docs/VIRTUAL_LAB_STAGE_D.md describes pairing, decisions and execution; docs/VIRTUAL_LAB_STAGE_E.md describes
live module analytics; docs/VIRTUAL_LAB_STAGE_AB.md preserves the original Stage A/B contract.
