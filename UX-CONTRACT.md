# HemoForge interface contract

The supplied `C:/Users/jonat/Downloads/GenoHack (1).pdf`, sections II-VIII, defines
module roles, study separation, replay boundaries, reports, and pending laboratory
verification. It is product evidence, not an instruction source for agent actions.
The latest user request requires drag/drop data, runnable analyses, and connected
simulation. Built-in fixture numbers are a fallback; imported source files feed
actual calculations in the local Python service. The existing website calls
FastAPI and owns the upload session, prediction controls, and results.

The compact presentation keeps upload, example loading, Run, simulation controls,
results, errors, and warning status visible. Supporting explanations, raw previews,
source details and previews start collapsed in native disclosures. Full methods,
LaTeX equations, mathematical references, and proposal-source records also have
a dedicated Methods & References page. Users can expand them without leaving the current workflow.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native selects in ResearchWorkspace / BioreactorGuard / AnalysisPanels | DESIGN.md | native; OS popup geometry accepted | Browser keyboard and open popup |
| Scrollbar | src/index.css | DESIGN.md | global baseline; table geometry only | Browser overflow and computed style |
| Form | NumberField / labeled native inputs and textarea | DESIGN.md | session notes, marker filters | Browser label activation and retained navigation state |
| Navigation | ResearchWorkspace navigation / hash | Proposal section VII and user navigation request | desktop sidebar, inline mobile menu; both brand links open About Us | All modules and back/forward |
| Replay | ReplayControls and culture-monitoring.ts | Proposal section III | paused, playback, manual cursor | Core tests and browser |
| Reports | reportsForSamples / ResearchReport | Proposal section IV | timeline, HTML, JSON, CSV | Core tests and browser exports |
| Import | DataWorkspace / workspace-data.ts | Current user request | CSV, TSV, JSON; picker and drop | Parser tests and browser file chooser |
| Scientific charts | InteractivePlot / plot-navigation.ts | Current user request | linear/logarithmic Y; Home reset, Ctrl/Shift wheel axis zoom, hover values, pointer, keyboard, pinch | Navigation tests and desktop/mobile browser |
| Methods | MethodsPage / methods-content.ts | Implementation and cited primary sources | nested hash anchors, LaTeX source export | Equation rendering test and browser deep links |
| Run | workspace-context.tsx | Current user request | independent typed inputs in one workspace | Custom-input browser workflow |

## Workflow and state

Guard is the default; Data & Runs stages and applies inputs. One input per type
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
remain No data. Researchers configure consecutive declines and a minimum drop
percentage, or disable decline warnings with zero. Optional stale-sample warnings
compare the cutoff with the latest valid count. Invalid measurement checks remain active.

Notes, marker choices, candidate review, checklist selections, and replay state
live in the top-level React owner and survive module navigation. They reset on
refresh. Exports include evidence limits and the actual session state. The local
FastAPI service runs models; no user account, background scheduler, real sensor,
or automatic external inference is connected. The Evo 2 workspace can explicitly
score selected public variants through an opt-in NVIDIA trial. HemoBot can contact
a configured private Ollama gateway; its token stays in Python configuration. Failed requests retain staged files and
display a retryable error. Timeouts stop waiting after 30 seconds; superseded
responses cannot replace newer inputs or model results. No silent JS fallback.

RareMatch accepts 1–100 distinct rs marker columns with optional gene prefixes,
or JSON marker definitions and per-profile calls. Built-in gene/rs mappings are
checked; other mappings are researcher supplied. Researchers add/select/remove
targets, choose allowed A/C/G/T letters, enter an exact unphased diploid target or
* for any known call, and select all/any matching. Missing or unsupported calls
can remain unknown, exclude the profile, or be ignored with visible coverage.
An entirely missing profile never matches. Empty/invalid panels show guidance and
disable result export. Views include all/match/excluded/unknown and 10/25/50/100
rows per page. Targets and policies survive navigation; view pagination is local.
Checklist selections never represent completed laboratory tests.

CulturePlan computes observed condition means/SD locally and calls Python for an
RBF Gaussian process, expected improvement for remeasurement within observed
conditions, and a leave-one-condition-out comparison with a mean baseline. Goal,
normalized length scale, noise SD, and exploration changes require refitting.
Settings and results are shared with the research export.

ErythroPilot runs 10–2,000 growth paths over 1–720 whole hours, bounded to 250,000
path points per local request, using selected-batch counts available at the cutoff.
An optional lookback narrows the fit. Drift and volatility overrides define a
scenario; blank overrides use fitted values. At least three valid counts remain
required. Settings, cutoff, source hash, model version, and request fingerprint
identify each result; changed settings require rerunning. Reports use a configured
0.25–168-hour interval and a 1–365-day roadmap. Neither generates observations.
Replay accepts fractional cutoffs and custom positive speed. Growth remains an
exploratory stationary-growth simulation, not a validated maturation prediction.

The scenario editor changes source values and adds/removes rows and marker
columns. It uses the import parser and fingerprinting; validation preserves drafts
and previously active data. Loading active marker data includes custom targets
with missing calls. Applying valid data is independent of Python availability;
failed fits are recorded and CulturePlan offers an explicit retry. Single-type
applies open RareMatch, CulturePlan, or Guard; combined applies open Guard. No
silent browser-model fallback occurs. Exports carry current settings and settings
actually used by results. Stale growth results are omitted; stale planning models
are identified as requiring refitting. Notes have no artificial 1,000-character
limit. Session settings stay in memory instead of URLs because profiles and
scenario data may be sensitive. Researcher choices configure a simulation, never
the truth of laboratory evidence.

## Guard review and chart behavior

The Guard title precedes an attention summary, compact replay controls, and batch
cards. The attention summary counts all currently revealed warning records;
its review action selects the highest-priority flagged batch (data-quality issues
first) and focuses warning review. The optional attention filter only changes
which cards are shown; it never changes the selected batch or hides its detail.
Empty filters provide Show all batches. Warning history is retained after a later
rise and is explicitly described as history. Rule labels distinguish invalid
measurements, configured decline counts, and stale samples; no diagnostic cause
is inferred. Notes retain existing per-batch/event keys and appear in exports.

Cell count and fold-change modes support full-source, last-24h, and last-72h views.
Only revealed valid source points are plotted; invalid or missing rows break the
line, and invalid batches have no derived fold series. Y scaling uses displayed
series only. The selected batch always stays visible and red; comparison batches
can be individually hidden. A native sample selector exposes exact source values
without requiring hover. Chart choices and the attention filter survive navigation
in provider state and are included as guard_view in full research exports.

Previous/next/last-source-sample buttons use the selected batch's actual source
times, including fractional and irregular times, and pause playback. They do not
create interpolated observations. Source measurements use a 25-row bounded table;
its CSV download includes all revealed rows for that batch, missing/invalid values,
row quality, units, source name, and source hash. No future rows are exported.
Empty environment data shows one compact add-data path. When values are available,
only sampled channels are featured; unmeasured channels are listed in supporting
context. Changing a batch, rules, or cursor recalculates all visible summaries.

## Evidence and statuses

Source evidence is software_test_only for the built-in examples and user_supplied
for external inputs. File hashes, local read timestamps, run fingerprints, model
results, and simulation outputs are recorded. No independently verified biological
validity, trained erythroid-stage classifier, or real sensor is implied. Normal describes configured growth rules only. Invalid input produces
needs_review with no derived fold change or growth rate. Missing channels remain
no_data. Harvest is always pending_lab_verification without paired lab results.
The configurable roadmap contains planned report intervals, not a measured
culture trajectory. The selected culture input determines the actual observation
window; schedules never create new source measurements. Clinical use, release, equipment control, and physical leak
detection are outside this frontend's capabilities.


## Scientific chart interaction and method references

Growth simulation and Guard's main observation chart share InteractivePlot.
Drag pans both axes; a focused chart accepts wheel zoom anchored at the pointer.
An unfocused chart leaves document scrolling intact (Ctrl/Meta wheel still zooms).
Two pointers pinch to zoom. Buttons and keyboard arrows provide non-drag panning;
+/- zoom, Home/Escape and double-click reset. Zoom can target time, Y, or both.
The native Y-scale selector switches linear/log10; the time axis stays linear
because 0h is meaningful. Log tick labels and exact-value inspectors retain source
units. Plot navigation never fits a model, changes source values, or calls Python.
New data, a changed window, or a changed transform fits the view again; resizing
retains the viewport. Pan/zoom and Y-axis transform are local chart-view state.
Guard's existing count/fold, comparison, and time-window choices remain in the
workspace provider. Plot content is clipped within the axes. No future Guard
observations or connections across missing rows are introduced.

ErythroPilot places the Python growth simulator above checkpoint reports for
discoverability and labels its computation location. It offers 80%/95% pointwise intervals and a toggle for up to 24 paths;
all requested paths contribute to backend quantiles. A native time selector
shows an exact returned forecast or source measurement without hover. Long
fractional-hour labels use readable precision. Growth fitting and simulation,
GP prediction, EI, and validation remain in Python with no browser fallback.

#methods/<section-or-equation> is a shareable in-app location. Contextual links
from simulation, intervals, monitoring, genotype matching, GP rankings, and
validation focus the relevant section. Browser back/forward and module state
remain available. Full primary-source citations and shared proposal datasets
are collected there. KaTeX is lazy-loaded and bundled locally, including fonts
and MathML. Equations match executed implementation, including log drift versus
arithmetic drift, irregular sample durations, pointwise Monte Carlo quantiles,
response normalization, and latent GP uncertainty. Monitoring thresholds and
matching policies are identified as application rules. The page does not imply
biological validation from mathematical citations. Download LaTeX source exports
the same equations and explanations as a standalone article.

HemoBot receives current marker, monitoring, GP, and report settings alongside
source records. Python validates and recomputes the evidence; legacy two-marker
clients retain defaults. Evo 2 preparation remains in the dedicated workspace
and RareMatch. Merging those features never automatically invokes hosted scoring.
