# HemoForge Virtual Lab — Stage A/B

Open http://127.0.0.1:8443/#lab. Create a session, then click **Buka Guard di monitor 2**.
Move the opened tab into a separate browser window on the second monitor. Keep the 3D window visible.

1. Collect the initial sample at 0 h.
2. Load it into virtual FLEX2 and start analysis.
3. Five seconds of rendered animation release the result to the actual Bioreactor Guard component.
4. Resume culture, pause at a new time, and repeat sampling. Guard appends the result at collection time.
5. Refresh Guard to recover released results. Pause, hide, or close the controller to stop culture time.

This is an uncalibrated synthetic teaching scenario. No physical device, NVIDIA, LLM, or remote database is called.
The five-second assay represents an illustrative 4.5-minute culture interval; it is not a device timing specification.
Guided sample handling pauses the culture clock. FLEX2 results are frozen at collection and hidden until release.
The synthetic count is viable density (millions/mL) × the declared 500 mL volume. Temperature, DO, genetic data,
and ammonium are not fabricated as instrument measurements. CulturePlan, RareMatch, and ErythroPilot live wiring
are outside Stage B. Other HemoForge workflows are unchanged.

Sessions live only in one API process, expire after an hour without accepted commands, and disappear on restart.
This prototype is limited to localhost; do not expose it as a public/multi-user service. The random session ID is
a read capability. The controller token stays in sessionStorage and the initial WebSocket message, never the URL.
One controller is allowed; refreshing that original tab resumes its control after the old socket disconnects.

## Free asset credits

Three decorative GLBs are from Kenney Furniture Kit, Creative Commons Zero (CC0):
https://kenney.nl/assets/furniture-kit . Original license: /virtual-lab/kenney/License.txt .
The bioreactor, analyzer, hands, room, and arrows are procedural temporary geometry created for this prototype.
No paid assets were bought. Equipment and hand models can be replaced later while preserving the interaction anchors.

See docs/VIRTUAL_LAB_STAGE_AB.md in the repository for the implementation contract and acceptance checklist.
