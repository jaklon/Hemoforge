import { sourceReferences as sources } from "./source-references"

import {
  filterMarkers,
  type MarkerRow,
  type ExperimentRow,
} from "./workspace-data"

import { conditionSummary } from "./experiment-model"

import {
  Icon,
  Button,
  Badge,
  Panel,
  Details,
  PageTitle,
  Status,
} from "./workspace-ui"

import { downloadFile, csv, escapeHtml } from "./workspace-utils"

import { DataProvider, useWorkspace, useCultureData } from "./workspace-context"

import DataWorkspace from "./DataWorkspace"

import Evo2Preparation from "./Evo2Preparation"

import HemoBot, { useHemoBot } from "./HemoBot"

import { botStatus, type BotAnalysis, type BotModule, type BotStatus } from "./hemobot-api"

import MonitoringControls from "./MonitoringControls"

import Guard from "./BioreactorGuard"

import { sampleSteps } from "./guard-insights"

import {
  SimulationPanel,
  ExperimentPlanner,
  MarkerScreen,
} from "./AnalysisPanels"

import { lazy, Suspense, useEffect, useMemo, useState } from "react"

const MethodsPage = lazy(() => import("./MethodsPage"))
import AboutPage from "./AboutPage"

import {
  analyzeMeasurements,
  batchMeasurements,
  checkpointReports,
  demoSource,
  replayEndHour,
  screenProfiles,
} from "./culture-monitoring"

import { doeConditions, doeEffects, formatDoeValue } from "./culture-doe"

type View = "data" | "guard" | "pilot" | "plan" | "match" | "evo2" | "workflow" | "report" | "bot" | "methods" | "about"

interface NavigationItem {
  id: View
  name: string
  purpose: string
  icon: string
  group: string
  // Process-map role; items with a role are ranked stages in array order.
  role?: string
}

// Ordered start to finish along the HemoForge process map.
const navigation: NavigationItem[] = [
  { id: "data", name: "Data & runs", purpose: "Import, validate & run", icon: "data", group: "Data", role: "Import" },
  // Workflow & datasets page is hidden but kept: re-add
  // { id: "workflow", name: "Workflow & datasets", purpose: "Trace the evidence", icon: "data", group: "Data" },
  // to show it again. Without a nav entry, #workflow falls back to Guard.
  // Legacy marker screen ("match") stays in code but is no longer navigable.
  { id: "evo2", name: "RareMatch", purpose: "Screen sequence variants", icon: "dna", group: "Workspace", role: "Select" },
  { id: "plan", name: "CulturePlan", purpose: "Plan experiments", icon: "plan", group: "Workspace", role: "Plan" },
  { id: "guard", name: "Bioreactor Guard", purpose: "Observe culture", icon: "guard", group: "Workspace", role: "Observe" },
  { id: "pilot", name: "ErythroPilot", purpose: "Interpret & summarize", icon: "pilot", group: "Workspace", role: "Interpret" },
  { id: "report", name: "Research report", purpose: "Review & export", icon: "report", group: "Output", role: "Report" },
  { id: "bot", name: "HemoBot", purpose: "Analyze research evidence", icon: "pilot", group: "Assist & reference" },
  { id: "methods", name: "Methods & references", purpose: "Equations & sources", icon: "report", group: "Assist & reference" },
  { id: "about", name: "About us", purpose: "Project & team", icon: "team", group: "About" },
]

const processStages = navigation.filter((item) => item.role)

const navigationGroups = [...new Set(navigation.map((item) => item.group))]

function ReplayControls({
  hour,

  setHour,

  playing,

  setPlaying,

  speed,

  setSpeed,

  replicate,

  sticky = false,
}: {
  hour: number

  replicate: number

  sticky?: boolean

  setHour: (hour: number) => void

  playing: boolean

  setPlaying: (playing: boolean) => void

  speed: number

  setSpeed: (speed: number) => void
}) {
  const { batchMeasurements, batchId, replayEndHour } = useCultureData()

  const steps = sampleSteps(batchMeasurements(replicate), hour)

  function move(next: number) {
    setPlaying(false)

    setHour(next)
  }

  return (
    <section
      className={`replay-bar${sticky ? " is-sticky" : ""}`}
      aria-label="Replay controls"
    >
      <div className="replay-actions">
        <Button
          primary
          onClick={() => {
            if (hour === replayEndHour) setHour(0)

            setPlaying(!playing)
          }}
        >
          {playing ? "Pause" : hour === replayEndHour ? "Replay" : "Play"}
        </Button>
        <Button onClick={() => move(0)}>Reset</Button>
      </div>
      <div className="replay-track">
        <label htmlFor="replay-hour">
          <span>Culture replay · {batchId(replicate)}</span>
          <strong>
            {Math.round(hour * 10) / 10}h <span>/ {replayEndHour}h</span>
          </strong>
        </label>
        <input
          id="replay-hour"
          type="range"
          min="0"
          max={replayEndHour}
          step="any"
          value={hour}
          onChange={(e) => move(Number(e.target.value))}
        />
      </div>
      <div
        className="replay-sample-navigation"
        role="group"
        aria-label="Source sample navigation"
      >
        <Button
          aria-label="Previous sample"
          disabled={steps.previous === null}
          onClick={() => move(steps.previous!)}
        >
          ‹ Prev
        </Button>
        <Button
          aria-label="Next sample"
          disabled={steps.next === null}
          onClick={() => move(steps.next!)}
        >
          Next ›
        </Button>
        <Button
          aria-label="Last source sample"
          disabled={steps.last === null || hour === steps.last}
          onClick={() => move(steps.last!)}
        >
          Latest
        </Button>
      </div>
      <label className="replay-field">
        Cutoff h
        <input
          type="number"
          aria-label="Exact cutoff (hours)"
          min="0"
          max={replayEndHour}
          step="any"
          value={Math.round(hour * 10) / 10}
          onChange={(event) => {
            const value = Number(event.target.value)

            if (
              Number.isFinite(value) &&
              value >= 0 &&
              value <= replayEndHour
            )
              move(value)
          }}
        />
      </label>
      <label className="replay-field">
        Speed h/s
        <input
          type="number"
          aria-label="Replay speed (hours per second)"
          min="0.01"
          max="10000"
          step="any"
          value={speed}
          onChange={(event) => {
            const value = Number(event.target.value)

            if (Number.isFinite(value) && value > 0 && value <= 10000)
              setSpeed(value)
          }}
        />
      </label>
    </section>
  )
}

function Pilot({
  hour,

  replicate,

  setReplicate,

  navigate,
}: {
  hour: number

  replicate: number

  setReplicate: (n: number) => void

  navigate: (view: View) => void
}) {
  const {
    batches,

    batchIndexes,

    batchId,

    batchMeasurements,

    checkpointReports,

    replayEndHour,

    demoSource,

    source,

    analyze: analyzeMeasurements,

    monitoring,

    reportInterval,
  } = useCultureData()

  const { roadmapDays } = useWorkspace()

  const reports = useMemo(
    () => checkpointReports(replicate, hour),

    [replicate, hour, source, reportInterval, monitoring],
  )

  const [page, setPage] = useState(0)

  const [activeHour, setActiveHour] = useState<number | null>(null)

  const maxPage = Math.max(0, Math.ceil(reports.length / 8) - 1)

  const safePage = Math.min(page, maxPage)

  const shown = [...reports].reverse().slice(safePage * 8, safePage * 8 + 8)

  const selected =
    reports.find((report) => report.checkpoint_hour === activeHour) ??
    reports.at(-1)

  function exportReports() {
    downloadFile(
      `hemogpt-R${replicate}-reports-${hour}h.json`,

      JSON.stringify(
        {
          generated_at: new Date().toISOString(),

          mode: "simulation_ui",

          reports,
        },

        null,

        2,
      ),

      "application/json",
    )
  }

  return (
    <>
      <PageTitle
        title="ErythroPilot"
        description="Simulate growth and review checkpoint reports."
        action={
          <Button
            icon="download"
            onClick={exportReports}
            disabled={!reports.length}
          >
            Export reports
          </Button>
        }
      />
      <div className="context-strip">
        <span>
          Reading Guard · through <b>{hour}h</b>
        </span>
        <label>
          Batch
          <select
            value={replicate}
            onChange={(e) => {
              setReplicate(Number(e.target.value))

              setPage(0)

              setActiveHour(null)
            }}
          >
            {batchIndexes.map((n) => (
              <option value={n} key={n}>
                {batchId(n)}
              </option>
            ))}
          </select>
        </label>
        <Badge>Reports use configured rules</Badge>
      </div>
      <SimulationPanel replicate={replicate} hour={hour} />
      <div className="pilot-grid">
        <Panel
          title="Checkpoint reports"
          caption={`${reports.length} checkpoints reached · 8 per page`}
          action={<Badge>Every {reportInterval}h</Badge>}
        >
          <div className="report-timeline">
            {shown.length ? (
              shown.map((report) => (
                <button
                  key={report.checkpoint_hour}
                  className={
                    selected?.checkpoint_hour === report.checkpoint_hour
                      ? "active"
                      : ""
                  }
                  onClick={() => setActiveHour(report.checkpoint_hour)}
                >
                  <span className="checkpoint-time">
                    {report.checkpoint_hour}h
                  </span>
                  <span>
                    <strong>
                      {report.new_measurements
                        ? "New source sample"
                        : "No new measurements"}
                    </strong>
                    <small>
                      Last sample {report.last_measurement_hour}h ·{" "}
                      {report.open_warnings.length} warnings
                    </small>
                  </span>
                  <Icon name="arrow" />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <strong>No checkpoints reached</strong>
                <p>
                  Advance replay to {reportInterval}h to generate the first
                  report.
                </p>
              </div>
            )}
          </div>
          <div className="pagination">
            <Button
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Newer
            </Button>
            <span>
              {reports.length
                ? `Page ${safePage + 1} of ${maxPage + 1}`
                : "No reports"}
            </span>
            <Button
              disabled={safePage === maxPage}
              onClick={() => setPage(safePage + 1)}
            >
              Earlier
            </Button>
          </div>
        </Panel>
        <Panel
          title={
            selected ? `Report · ${selected.checkpoint_hour}h` : "Report detail"
          }
          action={selected && <Status status={selected.status} />}
        >
          {selected ? (
            <div className="report-detail">
              <div className="report-reading">
                <span>Last available count</span>
                <strong>
                  {selected.last_count?.toFixed(2) ?? "—"}
                  <small>×10⁶ cells</small>
                </strong>
                <p>
                  Sampled at {selected.last_measurement_hour}h · not at the
                  reporting time
                </p>
              </div>
              <dl>
                <div>
                  <dt>Data window</dt>
                  <dd>
                    ({selected.data_window.from_hour}h,{" "}
                    {selected.checkpoint_hour}h]
                  </dd>
                </div>
                <div>
                  <dt>New samples</dt>
                  <dd>{selected.new_measurements}</dd>
                </div>
                <div>
                  <dt>Change since prior report</dt>
                  <dd>
                    {selected.change_since_previous === null
                      ? "— · no new sample"
                      : `${
                          selected.change_since_previous > 0 ? "+" : ""
                        }${selected.change_since_previous.toFixed(2)} ×10⁶ cells`}
                  </dd>
                </div>
                <div>
                  <dt>Open warnings</dt>
                  <dd>{selected.open_warnings.length}</dd>
                </div>
                <div>
                  <dt>Execution / evidence</dt>
                  <dd>Succeeded / {source.evidence}</dd>
                </div>
              </dl>
              <p>{selected.summary}</p>
              {selected.open_warnings.map((event) => (
                <div className="notice warning-notice" key={event.id}>
                  <Icon name="alert" />
                  <div>
                    <strong>
                      {event.hour}h · {event.rule}
                    </strong>
                    <p>{event.reason}</p>
                  </div>
                </div>
              ))}
              <div className="analyst-review">
                <strong>Analyst follow-up</strong>
                <p>{selected.recommendation}</p>
              </div>
              <Button onClick={() => navigate("guard")}>Review in Guard</Button>
            </div>
          ) : (
            <p className="panel-note">Reports appear as replay advances.</p>
          )}
        </Panel>
      </div>
      <Details title={`${roadmapDays}-day reporting roadmap · planned`}>
        <div
          className="roadmap-days"
          aria-label={`${roadmapDays}-day checkpoint roadmap`}
        >
          {Array.from({ length: roadmapDays }, (_, i) => (
            <div key={i} className={(i + 1) * 24 <= hour ? "reached" : ""}>
              <span>D{i + 1}</span>
              <i />
              <small>
                {(i + 1) * 24 <= hour ? "Replay reached" : "Planned"}
              </small>
            </div>
          ))}
        </div>
        <p className="panel-note">
          {roadmapDays} days · {Math.floor((roadmapDays * 24) / reportInterval)}{" "}
          planned report intervals. The culture input stops at {replayEndHour}h;
          observations are not invented after it ends. Harvest and QC remain
          pending.
        </p>
      </Details>
      <Details title="Erythroid stage reference · GSE53983">
        <div className="two-column">
          <div>
            <h3>A separate transcriptomic study</h3>
            <p>
              15 human reference samples across 5 erythroblast stages, according
              to the proposal. These are independent of culture replay; there is
              no matched longitudinal assay for {batchId(replicate)}.
            </p>
            <Badge>Batch maturation: insufficient data</Badge>
          </div>
          <div>
            <h3>Evaluation pending</h3>
            <p>
              Planned: log₂(CPM + 1), feature selection and standardization
              inside each training fold, L2 logistic regression, and stratified
              3-fold evaluation against a baseline. Macro-F1, balanced accuracy,
              and confusion matrices require actual model outputs.
            </p>
            <p>
              No trained model, verified counts file, or evaluation artifact is
              bundled. HemoForge summaries here use deterministic rules.
            </p>
          </div>
        </div>
      </Details>
    </>
  )
}

function Workflow({ navigate }: { navigate: (view: View) => void }) {
  const workspaceData = useWorkspace()

  return (
    <>
      <PageTitle
        title="Workflow & datasets"
        description="See how inputs connect to each analysis."
        action={
          <a className="button" href="#methods">
            Methods & references
          </a>
        }
      />
      <Panel title="Process map">
        <ol className="process-map">
          {processStages.map((stage, index) => (
            <li key={stage.id}>
              <button onClick={() => navigate(stage.id)}>
                <small>
                  {index + 1} · {stage.role}
                </small>
                <strong>{stage.name}</strong>
                <span>
                  {stage.id === "pilot"
                    ? `Summarize every ${workspaceData.reportInterval} hours`
                    : stage.purpose}
                </span>
                <Icon name="arrow" />
              </button>
            </li>
          ))}
          <li className="pending-stage">
            <Icon name="report" />
            <strong>Harvest & laboratory QC</strong>
            <span>Final RareMatch verification</span>
            <Badge tone="warning">Pending laboratory results</Badge>
          </li>
        </ol>
      </Panel>
      <Panel
        title="Active inputs"
        action={
          <Button icon="data" onClick={() => navigate("data")}>
            Import / replace
          </Button>
        }
      >
        <ul className="workflow-inputs">
          {Object.values(workspaceData.inputs).map((file) => (
            <li key={file.kind}>
              <small>{file.kind}</small>
              <strong>{file.name}</strong>
              <span>
                {file.rows.length} rows ·{" "}
                <Badge
                  tone={
                    file.evidence === "software_test_only" ? "warning" : "neutral"
                  }
                >
                  {file.evidence.replace(/_/g, " ")}
                </Badge>
              </span>
              <code title={file.sha256 || undefined}>
                {file.sha256
                  ? `SHA-256 ${file.sha256.slice(0, 12)}…`
                  : "Built-in demo · no file hash"}
              </code>
            </li>
          ))}
        </ul>
      </Panel>
      <Details title="How sources stay separate">
        <p>
          BEL-A, GSE53983, and 1000 Genomes come from different experiments and
          individuals. Case metadata may link analyses; donor IDs, samples,
          batches, and timelines remain independent.
        </p>
      </Details>
      <Details title="Proposal references">
        <div className="source-list">
          {sources.map((source) => (
            <article key={source.id}>
              <div>
                <code>{source.id}</code>
                <h3>{source.name}</h3>
                <p>{source.details}</p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  Open source reference ↗
                </a>
              </div>
              <dl>
                <div>
                  <dt>Module</dt>
                  <dd>{source.module}</dd>
                </div>
                <div>
                  <dt>Scope</dt>
                  <dd>{source.scope}</dd>
                </div>
                <div>
                  <dt>License</dt>
                  <dd>{source.license}</dd>
                </div>
                <div>
                  <dt>Download / SHA-256</dt>
                  <dd>Not supplied / not verified</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Details>
      <Details title="System architecture & integration status">
        <div className="architecture">
          <div>
            <strong>React + TypeScript</strong>
            <p>
              Guard, replay, rules, deterministic reports, and local exports are
              available in this frontend.
            </p>
          </div>
          <Icon name="arrow" />
          <div>
            <strong>Python prediction service</strong>
            <p>
              The local Python API runs growth simulations and experiment
              predictions directly from this website. HemoBot adds evidence
              analysis, local SQLite audits, and an optional private Ollama
              connection.
            </p>
          </div>
        </div>
        <p>
          Real sensors, physical leak detection, longitudinal maturation
          forecasts, and clinical release remain future work. No actuator
          controls are exposed.
        </p>
      </Details>
    </>
  )
}

function ResearchReport({
  botAnalysis,

  hour,

  replicate,

  notes,

  setNotes,

  eventNotes,

  candidate,

  checks,
}: {
  botAnalysis: BotAnalysis | null

  hour: number

  replicate: number

  notes: string

  setNotes: (v: string) => void

  eventNotes: Record<string, string>

  candidate: number | null

  checks: boolean[]
}) {
  const workspaceData = useWorkspace()

  const {
    batches,

    batchIndexes,

    batchId,

    batchMeasurements,

    checkpointReports,

    replayEndHour,

    demoSource,

    source,

    analyze: analyzeMeasurements,

    monitoring,

    reportInterval,
  } = useCultureData()

  const [format, setFormat] = useState("HTML")

  const [feedback, setFeedback] = useState("")

  const reports = checkpointReports(replicate, hour)

  const state = analyzeMeasurements(batchMeasurements(replicate), hour)

  const rows = filterMarkers(
    workspaceData.inputs.markers.rows as MarkerRow[],

    workspaceData.markerSettings,
  )

  const bundle = {
    hemobot_analysis: botAnalysis,

    product: "HemoForge",

    generated_at: new Date().toISOString(),

    execution_status: workspaceData.run?.planError
      ? "partial_success"
      : "succeeded",

    evidence_status: "source_labeled",

    run: workspaceData.run,

    input_files: workspaceData.inputs,

    simulation:
      workspaceData.simulation?.batchId === batchId(replicate) &&
      workspaceData.simulation.sourceHash === source.sha256 &&
      workspaceData.simulation.result.fromHour === hour &&
      JSON.stringify(workspaceData.simulation.settings) ===
        JSON.stringify(workspaceData.growthSettings)
        ? workspaceData.simulation
        : null,

    ...demoSource,

    replay_hour: hour,

    batch_id: `${batchId(replicate)}`,

    measurements: state.visible,

    warnings: state.events,

    warning_follow_up: eventNotes,

    reports,

    researcher_notes: notes,

    guard_view: workspaceData.guardView,

    target_signature: workspaceData.markerSettings,

    researcher_settings: {
      growth: workspaceData.growthSettings,

      planning: workspaceData.planSettings,

      monitoring: workspaceData.monitoring,

      report_interval_hours: workspaceData.reportInterval,

      roadmap_days: workspaceData.roadmapDays,
    },

    screening: rows,

    cultureplan: {
      selected_demo_condition:
        candidate === null
          ? null
          : (conditionSummary(
              workspaceData.inputs.experiments.rows as ExperimentRow[],
            )[candidate]?.id ?? null),

      gp_status: workspaceData.run?.plan
        ? JSON.stringify(workspaceData.run.settings) ===
          JSON.stringify(workspaceData.planSettings)
          ? "fitted"
          : "settings_changed_refit_required"
        : "not_fitted",

      settings_used: workspaceData.run?.settings ?? null,

      model: workspaceData.run?.plan ?? null,
    },

    laboratory: {
      status: "pending_lab_verification",

      review_plan: checks,

      actual_results: null,
    },

    studies: sources.map((source) => ({
      id: source.id,

      url: source.url,

      type: "proposal_reference",
    })),
  }

  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>HemoForge research report</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;padding:20px}h1{color:#9d232c}</style><h1>HemoForge research report</h1><p>Research input files are labeled by source. Uploaded files have not been independently verified as biological evidence. Harvest / QC: pending_lab_verification.</p><p>Export generated at ${bundle.generated_at} UTC.</p><h2>Researcher notes</h2><p>${escapeHtml(notes) || "No notes recorded."}</p><h2>Auditable snapshot</h2><pre>${escapeHtml(JSON.stringify(bundle, null, 2))}</pre></html>`

  const reportCsv = csv([
    [
      "checkpoint_hour",

      "batch_id",

      "last_measurement_hour",

      "last_count",

      "new_measurements",

      "open_warnings",

      "summary",

      "evidence_status",

      "researcher_notes",

      "warning_follow_up",

      "lab_status",

      "researcher_settings",

      "target_signature",
    ],

    ...reports.map((r) => [
      r.checkpoint_hour,

      r.batch_id,

      r.last_measurement_hour,

      r.last_count,

      r.new_measurements,

      r.open_warnings.length,

      r.summary,

      r.quality_flag,

      notes,

      JSON.stringify(eventNotes),

      "pending_lab_verification",

      JSON.stringify(bundle.researcher_settings),

      JSON.stringify(bundle.target_signature),
    ]),
  ])

  const content =
    format === "HTML"
      ? html
      : format === "JSON"
        ? JSON.stringify(bundle, null, 2)
        : reportCsv

  return (
    <>
      <PageTitle
        title="Research report"
        description="Add notes and export your results."
        action={<Badge tone="warning">Pending laboratory verification</Badge>}
      />
      <div className="report-summary">
        <div>
          <span>Selected batch</span>
          <strong>{batchId(replicate)}</strong>
        </div>
        <div>
          <span>Replay position</span>
          <strong>{hour}h</strong>
        </div>
        <div>
          <span>Checkpoint reports · {reportInterval}h</span>
          <strong>{reports.length}</strong>
        </div>
        <div>
          <span>Source integrity</span>
          <strong>
            {source.sha256 ? "Fingerprint recorded" : "Unverified fixture"}
          </strong>
        </div>
      </div>
      <div className="report-grid">
        <Panel title="Researcher review">
          <div className="report-form">
            <label htmlFor="research-notes">Interpretation & follow-up</label>
            <textarea
              className="resize-none"
              id="research-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document observations, limitations, and the next checks to run…"
            />
            <small>{notes.length} characters · included in exports</small>
            <label htmlFor="export-format">Export format</label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => {
                setFormat(e.target.value)

                setFeedback("")
              }}
            >
              <option>HTML</option>
              <option>JSON</option>
              <option>CSV</option>
            </select>
            {format === "CSV" && (
              <p>Checkpoints and notes. Full workspace: JSON or HTML.</p>
            )}
            <Button
              primary
              icon="download"
              onClick={() => {
                downloadFile(
                  `hemogpt-research-${hour}h.${format.toLowerCase()}`,

                  content,

                  format === "JSON"
                    ? "application/json"
                    : format === "CSV"
                      ? "text/csv;charset=utf-8"
                      : "text/html;charset=utf-8",
                )

                setFeedback(`${format} download requested.`)
              }}
            >
              Export {format} report
            </Button>
            <p className="export-status" role="status">
              {feedback}
            </p>
          </div>
        </Panel>
        <Details title={`Preview ${format} export`}>
          <pre className="export-preview">
            {content.slice(0, 5000)}
            {content.length > 5000
              ? "\n… Preview shortened; the download includes the full report."
              : ""}
          </pre>
        </Details>
      </div>
      <Details title="Evidence boundaries">
        <p>
          Inputs, file fingerprints, computed GP results, and growth simulations
          are included when available. A successful local calculation does not
          establish scientific validity. Source labels remain separate for each
          data type. No trained erythroid-stage classifier, real sensor
          connection, or post-harvest laboratory result is implied. Clinical
          release remains pending.
        </p>
      </Details>
    </>
  )
}

const serviceLabels = {
  checking: "checking…",
  online: "live",
  offline: "offline",
  disabled: "off",
} as const

/** Top-bar health: the Python API and the model server it talks to. */
function ServiceStatus({ backend }: { backend: "checking" | "online" | "offline" }) {
  const [llm, setLlm] = useState<BotStatus["llm_status"] | "checking">("checking")
  useEffect(() => {
    if (backend !== "online") return
    let controller: AbortController | undefined
    const check = () => {
      controller?.abort()
      controller = new AbortController()
      botStatus(controller.signal)
        .then((status) => setLlm(status.llm_status))
        .catch((error) => {
          if (error?.name !== "AbortError") setLlm("offline")
        })
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => {
      clearInterval(timer)
      controller?.abort()
    }
  }, [backend])
  const services = [
    ["Backend", backend],
    ["LLM", backend === "online" ? llm : backend],
  ] as const
  return (
    <span className="service-status" role="status">
      {services.map(([name, state]) => (
        <span key={name}>
          <span className={`status-dot is-${state}`} />
          {name} {serviceLabels[state]}
        </span>
      ))}
    </span>
  )
}

function ResearchWorkspaceContent() {
  const { batches, batchIndexes, replayEndHour, source } = useCultureData()

  const workspaceData = useWorkspace()

  const [view, setView] = useState<View>(() =>
    navigation.some((item) => item.id === location.hash.slice(1).split("/")[0])
      ? location.hash.slice(1).split("/")[0] as View
      : "guard",
  )

  const [methodSection, setMethodSection] = useState(
    () => location.hash.slice(1).split("/")[1] ?? "",
  )

  const [menuOpen, setMenuOpen] = useState(false)

  const [sidebarPinned, setSidebarPinned] = useState(true)

  const [sidebarHovered, setSidebarHovered] = useState(false)

  const [sidebarFocused, setSidebarFocused] = useState(false)

  // Desktop sidebar rests as an icon rail; hover/focus floats it open over the page, the pin docks it.
  const sidebarCollapsed = !sidebarPinned && !sidebarHovered && !sidebarFocused

  const [hour, setHour] = useState(120)

  const [playing, setPlaying] = useState(false)

  const [speed, setSpeed] = useState(6)

  const [replicate, setReplicate] = useState(1)

  const [eventNotes, setEventNotes] = useState<Record<string, string>>({})

  const [notes, setNotes] = useState("")

  const [candidate, setCandidate] = useState<number | null>(null)

  const [checks, setChecks] = useState([false, false, false])

  const botContext = {
    batch_id: batches[replicate - 1]?.id ?? batches[0]?.id ?? "No batch",

    replay_elapsed_hours: hour,

    marker_settings: workspaceData.markerSettings,

    monitoring: workspaceData.monitoring,

    plan_settings: workspaceData.planSettings,

    report_interval: workspaceData.reportInterval,

    objective: workspaceData.planSettings.objective,

    verification_requests: checks,
  }

  const bot = useHemoBot(botContext)

  const current = navigation.find((item) => item.id === view)!

  useEffect(() => {
    document.title = `${current.name} · HemoForge`
  }, [current.name])

  useEffect(() => {
    if (!playing) return

    const timer = window.setInterval(
      () => setHour((value) => Math.min(replayEndHour, value + speed)),

      1000,
    )

    return () => clearInterval(timer)
  }, [playing, speed, replayEndHour])

  useEffect(() => {
    if (hour === replayEndHour) setPlaying(false)
  }, [hour, replayEndHour])

  useEffect(() => {
    function hashChanged() {
      const next = location.hash.slice(1).split("/")[0]

      setMethodSection(location.hash.slice(1).split("/")[1] ?? "")

      setView(
        navigation.some((item) => item.id === next) ? next as View : "guard",
      )

      setMenuOpen(false)

      setPlaying(false)
    }

    window.addEventListener("hashchange", hashChanged)

    return () => window.removeEventListener("hashchange", hashChanged)
  }, [])

  useEffect(() => {
    setReplicate(1)

    setHour(0)

    setPlaying(false)

    setEventNotes({})

    setNotes("")
  }, [source])

  useEffect(() => {
    setCandidate(null)
  }, [workspaceData.inputs.experiments])

  useEffect(() => {
    setChecks([false, false, false])
  }, [workspaceData.inputs.markers])

  function navigate(next: View) {
    setView(next)

    setPlaying(false)

    setMenuOpen(false)

    location.hash = next

    window.scrollTo({ top: 0, behavior: "instant" })

    requestAnimationFrame(() =>
      document.getElementById("page-title")?.focus({ preventScroll: true }),
    )
  }

  return (
    <div
      className={`app-shell${sidebarPinned ? " sidebar-pinned" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()

          document.getElementById("main-content")?.focus()
        }}
      >
        Skip to content
      </a>
      <aside
        id="research-navigation"
        className={`sidebar${menuOpen ? " is-open" : ""}`}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") setSidebarHovered(true)
        }}
        onPointerLeave={() => setSidebarHovered(false)}
        onPointerDown={(e) => setSidebarFocused(e.pointerType === "touch")}
        onFocusCapture={(e) => {
          if (e.target.matches(":focus-visible")) setSidebarFocused(true)
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setSidebarFocused(false)
        }}
      >
        <a
          className="brand"
          href="#guard"
          onClick={(e) => {
            e.preventDefault()

            navigate("guard")
          }}
        >
          <span className="brand-mark">
            <Icon name="dna" />
          </span>
          <span>
            <strong>HemoForge</strong>
            <small>GenoHack 2026</small>
          </span>
        </a>
        <nav aria-label="Research modules">
          {navigationGroups.map((group, i) => (
            <div className="nav-group" key={group} role="group" aria-label={group}>
              <div className="nav-group-label">
                <span aria-hidden="true">{group}</span>
                {i === 0 && (
                  <button
                    type="button"
                    className="sidebar-pin"
                    tabIndex={sidebarCollapsed ? -1 : undefined}
                    aria-label={sidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
                    title={sidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
                    aria-pressed={sidebarPinned}
                    aria-controls="research-navigation"
                    onClick={() => setSidebarPinned(!sidebarPinned)}
                  >
                    <Icon name="pin" />
                  </button>
                )}
              </div>
              {navigation
                .filter((item) => item.group === group)
                .map((item) => (
                  <a
                    href={`#${item.id}`}
                    key={item.id}
                    title={sidebarCollapsed ? item.name : undefined}
                    aria-current={view === item.id ? "page" : undefined}
                    className={view === item.id ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault()

                      navigate(item.id)
                    }}
                  >
                    <Icon name={item.icon} />
                    <strong>{item.name}</strong>
                    {item.id === "guard" && (
                      <span className="nav-count">{batches.length}</span>
                    )}
                  </a>
                ))}
            </div>
          ))}
        </nav>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          <span>Research workspace</span>
          <Icon name="arrow" />
          <strong>{current.name}</strong>
        </div>
        <strong className="mobile-brand">HemoForge</strong>
        <div className="header-actions">
          <ServiceStatus backend={workspaceData.backendStatus} />
          {(["guard", "pilot", "plan", "match"] as View[]).includes(view) && (
            <Button
              icon="pilot"
              onClick={() => {
                bot.prepare(view as BotModule)
                navigate("bot")
              }}
            >
              Ask HemoBot
            </Button>
          )}
          <button
            type="button"
            className="button menu-toggle"
            aria-controls="research-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>
      <main id="main-content" className="workspace" tabIndex={-1}>
        {(view === "pilot" || view === "bot") && (
          <ReplayControls
            hour={hour}
            setHour={setHour}
            playing={playing}
            setPlaying={setPlaying}
            speed={speed}
            setSpeed={setSpeed}
            replicate={replicate}
            sticky={view === "pilot"}
          />
        )}
        {view === "bot" ? (
          <HemoBot
            bot={bot}
            context={botContext}
            batchChoices={batches.map((batch) => batch.id)}
            onBatchChange={(id) =>
              setReplicate(batches.findIndex((batch) => batch.id === id) + 1)
            }
          />
        ) : view === "data" ? (
          <DataWorkspace
            onRun={(kind) =>
              navigate(
                kind === "markers"
                  ? "evo2"
                  : kind === "experiments"
                    ? "plan"
                    : "guard",
              )
            }
          />
        ) : view === "guard" ? (
          <Guard
            replayControls={
              <ReplayControls
                hour={hour}
                setHour={setHour}
                playing={playing}
                setPlaying={setPlaying}
                speed={speed}
                setSpeed={setSpeed}
                replicate={replicate}
                sticky
              />
            }
            hour={hour}
            replicate={replicate}
            setReplicate={setReplicate}
            navigate={navigate}
            eventNotes={eventNotes}
            setEventNotes={setEventNotes}
          />
        ) : view === "pilot" ? (
          <>
            <Pilot
              hour={hour}
              replicate={replicate}
              setReplicate={setReplicate}
              navigate={navigate}
            />
            <MonitoringControls />
          </>
        ) : view === "plan" ? (
          <ExperimentPlanner
            onEditData={() => navigate("data")}
            candidate={candidate}
            setCandidate={setCandidate}
          />
        ) : view === "match" ? (
          <MarkerScreen
            checks={checks}
            setChecks={setChecks}
            onEditData={() => navigate("data")}
          />
        ) : view === "about" ? (
          <AboutPage />
        ) : view === "methods" ? (
          <Suspense
            fallback={
              <p className="empty-state" role="status">
                Loading methods…
              </p>
            }
          >
            <MethodsPage section={methodSection} />
          </Suspense>
        ) : view === "evo2" ? (
          <>
            <PageTitle
              title="RareMatch"
              description="Browse public KEL/SLC14A1 variants, prepare tasks, and optionally score them with Evo 2."
            />
            <Evo2Preparation />
          </>
        ) : view === "workflow" ? (
          <Workflow navigate={navigate} />
        ) : (
          <ResearchReport
            botAnalysis={bot.result}
            hour={hour}
            replicate={replicate}
            notes={notes}
            setNotes={setNotes}
            eventNotes={eventNotes}
            candidate={candidate}
            checks={checks}
          />
        )}
      </main>
    </div>
  )
}

export default function ResearchWorkspace() {
  return (
    <DataProvider>
      <ResearchWorkspaceContent />
    </DataProvider>
  )
}
