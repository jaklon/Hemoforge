# Dedicated PoC / simulation workspace

The simulation has a separate opt-in entry at `#poc`. The main research routes (`#dashboard`, `#guard`,
`#pilot`, `#plan`) keep their existing imports, replay and analysis behavior. The main sidebar's optional
**PoC & Simulation ↗** opens the launcher in a separate tab; it does not silently replace research inputs.

## Entry and navigation

| Route | Purpose |
|---|---|
| `#poc` | Launcher; no session creation or simulation clock |
| `#poc/lab` | Monitor 01 setup; session creation requires an explicit button |
| `#poc/lab/{32-hex-id}` | 3D controller for that session (original tab capability required) |
| `#poc/monitor/{32-hex-id}/dashboard` | Monitor 02 process overview |
| `#poc/monitor/{32-hex-id}/guard` | Existing Bioreactor Guard plus paired decision controls |
| `#poc/monitor/{32-hex-id}/pilot` | Live growth projection and released-only checkpoint reports |
| `#poc/monitor/{32-hex-id}/plan` | Live viable-cell target and operation ledger |

Old `#lab`, `#lab/{id}` and `#{module}/live/{id}` remain valid aliases. Generated navigation uses the PoC
namespace. Invalid/incomplete PoC links show the launcher with an error instead of falling back to a normal
demo module. Session IDs and module names are validated before links are constructed. Joining from an ID or
URL only extracts a session reference and opens the local monitor; it does not fetch the pasted URL.

Monitor 02 adopts the main product's navy sidebar, workspace header, white panels, metrics, chart controls
and typography through existing workspace CSS and UI primitives. Its four module links retain the same session
and stream. Changing sessions remounts the monitor. Main HemoForge opens separately through an explicit link.
Mobile menu, desktop pin/hover/focus behavior and skip-to-content remain available.

## Data boundaries and behavior

The current default is BIOSTAT STR Gen 2 + BioPAT Trace + ViaMass (schema 4). See
[BIOSTAT contract](BIOSTAT_GEN2_SIMULATION.md) and [walkthrough](../public/VIRTUAL_LAB.md).
Dashboard separates virtual sensors (pH, DO, temperature, glucose, lactate, capacitance), model-derived cell density/count,
and unavailable glutamine/ammonium/viability/osmolality/pCO2/enucleation assays. Sensor channels retain their own
measurement/release times; no hidden reactor values fill missing channels. Guard gets separate sensor rows and cell estimates.
Pilot/Plan use rolling, thinned, stage-aware estimate fits. Faults, staleness, active actions and differentiation withhold predictions.
Material events start new fit segments; routine AUTO corrections do not reset them. Independent-experiment GP stays withheld.
Dashboard links to Guard for explicit pairing/review/confirmation. Only the visible 3D controller advances culture time.

This is UI/navigation and source-state separation, not a separate deployment, authentication system or tenant
boundary. Backend localhost/Origin/header checks, read capabilities, scoped control tokens, TTL and one-worker
memory semantics are unchanged. Restart still loses sessions. No production deployment or relaxed network
access is part of this change. Assets remain existing free CC0/procedural geometry; launcher illustrations are CSS.

## Verification

Route tests cover all four main/PoC module pairs, legacy links and invalid path rejection. Dashboard adapter
tests cover QC/publication gating, missing channels, units, source IDs and empty-input behavior. Existing analytics
and controller tests continue to cover intervention resets, capability checks and rendered-time progression.
Use `node --experimental-strip-types --test src/*.test.ts`, the TypeScript check, production build, and the
offline Python suite. Manually verify the launcher, both monitors, module switches and main-workspace isolation.
