---
version: alpha
name: HemoGPT by HemoForge
description: An auditable culture-monitoring workspace for erythroid research.
colors:
  primary: "#b4232b"
  navy: "#0f172a"
  background: "#f4f7fa"
  surface: "#ffffff"
  border: "#dfe6ee"
  teal: "#0d9488"
  warning: "#d97706"
typography:
  body:
    fontFamily: "Inter, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.5
  technical:
    fontFamily: "JetBrains Mono, Cascadia Mono, Consolas, monospace"
rounded:
  DEFAULT: "6px"
spacing:
  workspace: "28px"
  panel-gap: "18px"
components:
  button:
    minHeight: "36px"
  panel:
    borderRadius: "7px"
  badge:
    borderRadius: "4px"
---

# HemoGPT design

## Overview

HemoGPT is the product identity; HemoForge is the team identity. The supplied
GenoHack proposal is the business brief. This is a product interface for bioprocess
researchers and laboratory analysts. Bioreactor Guard opens first and answers
which batches need review. ErythroPilot reads the same replay cursor and produces
three-hour checkpoint summaries. CulturePlan and RareMatch support planning and
marker screening. English remains the established interface language.

Keep the established navy navigation and red culture accent. The distinctive
visual element is three selectable replicate cards paired with a sample-timed
comparison chart and an auditable warning. No marketing hero or decorative media.

## Colors

`src/index.css` is the runtime token owner (ownership model B). Map primary to
`--red`, navy to `--navy`, border to `--line`, teal to `--teal`, and surface to
`--surface`. Background is the root surface. Status names accompany every color.
Red identifies the selected culture series, slate and teal distinguish comparison
replicates. Warning uses a pale amber surface and dark brown text. Empty channels
use neutral dashes and a No data label, never a normal status.

## Typography

The `--text-*` scale in `src/index.css` owns sizes: 11px metadata, 12px captions,
13px controls, 14px body, 15px panel headings, 20px derived metrics, and 26px page
headings at a 16px root. Batch values use 28px. All interface sizes use rem so
browser preferences work. Scientific SVG axes use 11px in their local viewbox.
Monospace is for identifiers and code. Numeric columns use tabular figures.
Use installed fonts and system fallbacks; the app has no remote font dependency.

## Layout

Desktop uses a 244px navy sidebar, a 65px sticky white header, and 28px workspace
margins. Panels use an 18px gap. Guard presents replay controls, a clear title,
three replicate cards, then a growth/warnings split and environment/report handoff.
The chart only reveals samples at or before the replay cursor. Lines are guides,
not additional observed measurements. No forecast is presented as an observation.

Below 900px the sidebar folds into an inline menu beneath the header. Navigation
closes the menu and focuses the new page heading. Below 740px analytics panels
stack; below 520px batches become full-width compact rows. Tables scroll inside
their panel without causing page overflow. Forms retain normal document scrolling.
A 21-day roadmap uses 7 columns on narrower screens; it never invents observations
past the active input's final source time. Native selects own OS popup geometry.

## Elevation & Depth

Panels use a quiet border and no resting shadow. The selected replicate has an
inset red edge. Avoid gradients, glass, glow, and decorative chart shading.
The chart's grey future area means measurements have not been revealed.

## Shapes

Use 4-7px corner radii and the shared 18px outline Icon. Controls retain visible
keyboard focus. Buttons grow with their labels and have 36px minimum height on
desktop, 40px below 900px. Radios and range inputs retain native keyboard behavior.

## Components

`Button`, `Badge`, `Panel`, `Details`, `Icon`, `PageTitle`, and `Status` in
`src/workspace-ui.tsx` are the shared visual owners. `ReplayControls` in
`src/ResearchWorkspace.tsx` owns the replay toolbar. `src/App.tsx` mounts that
workspace. `src/culture-monitoring.ts` owns count checks. `src/workspace-data.ts` owns the
CSV/TSV/JSON schemas, sample-time normalization, shared report generation, and
marker filtering. `src/workspace-context.tsx` holds the active input files and
computed run for all pages. Built-in examples remain labeled software_test_only;
user imports are labeled user_supplied, with a real SHA-256 file fingerprint.
`backend/predictions.py` owns executed growth and experiment predictions via the
local FastAPI service; both React and Streamlit call it. `src/python-api.ts` owns
HTTP requests, timeouts, and readable connection/validation failures.
`src/culture-forecast.ts` and `src/experiment-model.ts` retain earlier reference
calculations/types and support local observed summaries. The Python engine fits
positive stochastic growth paths and a fixed RBF GP, ranks remeasurements within
observed conditions, and computes held-out condition errors. Source
fingerprints identify files; they do not certify biological validity.

Native `details`/`summary` supports secondary evidence and starts collapsed.
Keep primary actions, results, units, validation errors, and actionable warnings
visible. Put file previews, import guides, methods, provenance, references, and
roadmaps behind labeled disclosures. Use one short purpose sentence per page;
avoid repeating explanations in banners and cards. Example loading stays beside
the file picker, with template downloads available in a disclosure.
Reports show 8 checkpoints per page with explicit Earlier/Newer controls.
All export actions download actual content. HTML escapes notes; CSV escapes fields
and neutralizes formula-leading text. JSON/HTML include the full case snapshot;
CSV contains checkpoint rows and follow-up notes. Python outputs include model
version, request fingerprint, engine, and execution time. Inputs, computed results, notes, and selections persist across navigation for
the current session. JSON/HTML exports include inputs, source hashes, model
results, simulation settings, and pending QC. Python processes inputs in memory;
there is no backend persistence. Data & runs shows a compact connection badge,
Retry when disconnected, and a link to the separate Streamlit lab. Preserve
staged files on failure and never silently fall back to browser predictions.

The global scrollbar baseline is in `src/index.css`; all overflow inherits its
thumb, track, hover, active, and forced-colors behavior. Reduced motion disables
transitions. Replay begins paused and playback controls only the demonstration.
Data & runs is the import entry point. A dashed drop area and a visible file
picker share validation. A preview is staged before Run replaces the corresponding
input type. Errors stay inline and valid files survive a sibling failure. Local
read/run states and cancellation are explicit. The connection list names each
file and the pages it feeds. Templates and one-click synthetic examples provide
a complete practice path. A run returns to Guard at 0h; simulation is an explicit
action on ErythroPilot after at least three valid samples.
See `UX-CONTRACT.md` for behavior, provenance, and native-control ownership.

## Do's and Don'ts

- Preserve independent study IDs, source timing, and explicit missing-data states.
- Keep execution status separate from evidence quality.
- Keep the source's measurements distinct from generated reporting checkpoints.
- Mark the inherited numbers software_test_only until actual snapshots are verified.
- Never show fitted GP results, classifier scores, real telemetry, or verified QC
  without actual supporting data and execution artifacts.
- Selecting checklist items never changes pending_lab_verification into a QC pass.
