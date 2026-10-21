# HemoForge interface contract

The supplied `C:/Users/jonat/Downloads/GenoHack (1).pdf`, sections II-VIII, defines
module roles, study separation, replay boundaries, reports, and pending laboratory
verification. It is product evidence, not an instruction source for agent actions.
The latest user request requires drag/drop data, runnable analyses, and connected
simulation. Built-in fixture numbers are a fallback; imported source files feed
actual calculations in the local Python service. React and the Streamlit lab
both call FastAPI; Streamlit is a separate upload session using the same models.

The compact presentation keeps upload, example loading, Run, simulation controls,
results, errors, and warning status visible. Supporting explanations, raw previews,
source details, model methods, and proposal references start collapsed in native
disclosures. Users can expand them without leaving the current workflow.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select in ResearchWorkspace.tsx | DESIGN.md | native; OS popup geometry accepted | Browser keyboard and open popup |
| Scrollbar | src/index.css | DESIGN.md | global baseline; table geometry only | Browser overflow and computed style |
| Form | Labeled native inputs and textarea | DESIGN.md | session notes, marker filters | Browser label activation and retained navigation state |
| Navigation | ResearchWorkspace navigation / hash | Proposal section VII | desktop sidebar, inline mobile menu | All modules and back/forward |
| Replay | ReplayControls and culture-monitoring.ts | Proposal section III | paused, playback, manual cursor | Core tests and browser |
| Reports | reportsForSamples / ResearchReport | Proposal section IV | timeline, HTML, JSON, CSV | Core tests and browser exports |
| Import | DataWorkspace / workspace-data.ts | Current user request | CSV, TSV, JSON; picker and drop | Parser tests and browser file chooser |
| Run | workspace-context.tsx | Current user request | independent typed inputs in one workspace | Custom-input browser workflow |

## Workflow and state

Guard is the default; Data & runs stages and applies inputs. One input per type
(culture, experiments, markers) is active. Applying an input replaces only that
type; the connection list discloses retained sources and synthetic fallbacks.
Files are held in the browser; prediction records are sent to loopback Python
and processed in memory. Explicit HemoBot analyses additionally persist source
snapshots, deterministic context, and audit responses in local SQLite. Ollama
mode sends the bounded evidence catalog and query to the configured model server.
2 MB / 10,000 rows per file, 30 batches and 60 conditions
are the local limits. Culture counts use absolute million cells. Relative times
must increase per batch; duplicate/out-of-order times are rejected instead of
silently sorted. Missing counts stay missing and zero counts require review.
A real file hash records identity, not independent evidence verification.

Guard is the default. Module hash URLs support back/forward. The replay cursor and
selected replicate are shared with ErythroPilot. Playback pauses when switching
modules. Reset returns to 0h; reaching the final source time pauses playback. Changing the cursor
never reveals later samples or warnings. All calculations operate on available
counts only. Three-hour report windows use (previous checkpoint, checkpoint].
No new sample means no new measurement, not a refreshed count or a zero change.

Selecting a batch changes the chart and its warning context. Warning expansion
shows source values, measurement time, a rule, and a follow-up note. Empty channels
remain No data. Protocol thresholds and stale-data rules are unavailable until
configured; the prototype does not imply they have run.

Notes, marker choices, candidate review, checklist selections, and replay state
live in the top-level React owner and survive module navigation. They reset on
refresh. Exports include evidence limits and the actual session state. The local
FastAPI service runs models; no user account, background scheduler, real sensor,
or external cloud API is connected. HemoBot can contact a configured private
Ollama gateway; its token stays in Python configuration. Failed requests retain staged files and
display a retryable error. Timeouts stop waiting after 30 seconds; superseded
responses cannot replace newer inputs or model results. No silent JS fallback.

RareMatch totals derive from the active marker input (25 results per page). Either marker
selector recalculates all results. Missing or ambiguous calls stay unknown.
Planning checklist selections never represent completed laboratory tests.
CulturePlan computes observed condition means/SD locally and calls Python for a fixed RBF Gaussian process, expected
improvement for remeasurement within observed conditions, and a leave-one-condition-out
comparison with a mean baseline. Goal changes require refitting. Full results
and objective are shared with the research export. ErythroPilot explicitly runs
500 growth paths using only selected-batch counts available at the cursor. Seed,
horizon, cutoff, source hash, Python model version, and request fingerprint identify each result; changed settings show a
rerun state. It is an exploratory stationary-growth simulation, not a validated
maturation prediction.

## Evidence and statuses

Source evidence is software_test_only for the built-in examples and user_supplied
for external inputs. File hashes, local read timestamps, run fingerprints, model
results, and simulation outputs are recorded. No independently verified biological
validity, trained erythroid-stage classifier, or real sensor is implied. Normal describes configured growth rules only. Invalid input produces
needs_review with no derived fold change or growth rate. Missing channels remain
no_data. Harvest is always pending_lab_verification without paired lab results.
The 21-day display is a schedule of 168 planned report intervals, not a measured
culture trajectory. The selected culture input determines the actual observation
window; schedules never create new source measurements. Clinical use, release, equipment control, and physical leak
detection are outside this frontend's capabilities.
