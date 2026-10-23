import { sourceReferences as sources } from "./source-references"

import {
  Icon,
  Button,
  Badge,
  Panel,
  Details,
  PageTitle,
  Status,
} from "./workspace-ui"

import { downloadFile, escapeHtml } from "./workspace-utils"

import { DataProvider, useWorkspace, useCultureData } from "./workspace-context"

import DataWorkspace from "./DataWorkspace"

import Evo2Preparation from "./Evo2Preparation"

import HemoBot, { useHemoBot } from "./HemoBot"

import { botStatus, type BotStatus } from "./hemobot-api"

import Guard from "./BioreactorGuard"

import Dashboard from "./Dashboard"

import { sampleSteps } from "./guard-insights"

import {
  SimulationPanel,
  ExperimentPlanner,
  MarkerScreen,
} from "./AnalysisPanels"

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

const MethodsPage = lazy(() => import("./MethodsPage"))
import AccountPage, { initials, useProfile } from "./AccountPage"
import { CheckpointRoadmap, StageEstimate, TrendHealth } from "./PilotInsights"

import {
  analyzeMeasurements,
  batchMeasurements,
  checkpointReports,
  demoSource,
  replayEndHour,
  screenProfiles,
} from "./culture-monitoring"

import { doeConditions, doeEffects, formatDoeValue } from "./culture-doe"

type View = "data" | "dashboard" | "guard" | "pilot" | "plan" | "match" | "evo2" | "workflow" | "report" | "bot" | "methods" | "account"

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
  {
    id: "data",
    name: "Data & Runs",
    purpose: "Import, validate & run",
    icon: "data",
    group: "Data",
    role: "Import",
  },
  // Workflow & Datasets page is hidden but kept: re-add
  // { id: "workflow", name: "Workflow & Datasets", purpose: "Trace the evidence", icon: "data", group: "Data" },
  // to show it again. Without a nav entry, #workflow falls back to Guard.
  // Legacy marker screen ("match") stays in code but is no longer navigable.
  {
    id: "dashboard",
    name: "Dashboard",
    purpose: "Process variables & control",
    icon: "dashboard",
    group: "Workspace",
  },
  {
    id: "evo2",
    name: "RareMatch",
    purpose: "Screen sequence variants",
    icon: "dna",
    group: "Workspace",
    role: "Select",
  },
  {
    id: "plan",
    name: "CulturePlan",
    purpose: "Plan experiments",
    icon: "plan",
    group: "Workspace",
    role: "Plan",
  },
  {
    id: "guard",
    name: "Bioreactor Guard",
    purpose: "Observe culture",
    icon: "guard",
    group: "Workspace",
    role: "Observe",
  },
  {
    id: "pilot",
    name: "ErythroPilot",
    purpose: "Interpret & summarize",
    icon: "pilot",
    group: "Workspace",
    role: "Interpret",
  },
  {
    id: "report",
    name: "Research Report",
    purpose: "Review & export",
    icon: "report",
    group: "Output",
    role: "Report",
  },
  {
    id: "bot",
    name: "HemoBot",
    purpose: "Analyze research evidence",
    icon: "pilot",
    group: "Assist & Reference",
  },
  {
    id: "methods",
    name: "Methods & References",
    purpose: "Equations & sources",
    icon: "report",
    group: "Assist & Reference",
  },
]

// Reached from the account links under the navigation, not a navigation group.
const accountPage: NavigationItem = {
  id: "account",
  name: "Account",
  purpose: "Profile & password",
  icon: "team",
  group: "Account",
}

const pages = [...navigation, accountPage]

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
        Go to hour
        <input
          type="number"
          aria-label="Exact cutoff (hours)"
          min="0"
          max={replayEndHour}
          step="any"
          value={Math.round(hour * 10) / 10}
          onChange={(event) => {
            const value = Number(event.target.value)

            if (Number.isFinite(value) && value >= 0 && value <= replayEndHour)
              move(value)
          }}
        />
      </label>
      <label className="replay-field">
        Speed (h/sec)
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
  replayControls,

  hour,

  replicate,

  setReplicate,

  navigate,
}: {
  replayControls: ReactNode

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

  const reports = useMemo(
    () => checkpointReports(replicate, hour),

    [replicate, hour, source, reportInterval, monitoring],
  )

  // Past reports live on the Research Report page; Pilot reads the latest one.
  const selected = reports.at(-1)

  const state = analyzeMeasurements(batchMeasurements(replicate), hour)

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
    <div className="pilot-workspace">
      <PageTitle
        title="ErythroPilot"
        description="Interpret Guard data: trend health, stage evidence, and the 21-day plan."
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
      <div
        className={`workspace-overview${
          state.events.length ? " has-attention" : ""
        }`}
      >
        <div className="workspace-overview-message">
          <Icon name={state.events.length ? "alert" : "pilot"} />
          <div>
            <h2>Reading Guard through {hour}h</h2>
            <p>Reports use configured rules.</p>
          </div>
        </div>
        <label className="pilot-batch-picker">
          Batch
          <select
            value={replicate}
            onChange={(e) => {
              setReplicate(Number(e.target.value))
            }}
          >
            {batchIndexes.map((n) => (
              <option value={n} key={n}>
                {batchId(n)}
              </option>
            ))}
          </select>
        </label>
        <dl className="workspace-overview-stats">
          <div>
            <dt>Valid samples</dt>
            <dd>{state.valid.length}</dd>
          </div>
          <div>
            <dt>Checkpoints</dt>
            <dd>{reports.length}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>{state.events.length}</dd>
          </div>
        </dl>
      </div>
      {replayControls}
      <CheckpointRoadmap hour={hour} />
      <div className="pilot-insights">
        <TrendHealth hour={hour} replicate={replicate} warnings={state.events.length} />
        <StageEstimate hour={hour} />
      </div>
      <section className="pilot-section" aria-label="Growth simulation">
        <SimulationPanel replicate={replicate} hour={hour} />
      </section>
      <div className="pilot-latest">
        <Panel
          title={
            selected ? `Latest report · ${selected.checkpoint_hour}h` : "Latest report"
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
    </div>
  )
}

function Workflow({ navigate }: { navigate: (view: View) => void }) {
  const workspaceData = useWorkspace()

  return (
    <>
      <PageTitle
        title="Workflow & Datasets"
        description="See how inputs connect to each analysis."
        action={
          <a className="button" href="#methods">
            Methods & References
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
                    file.evidence === "software_test_only"
                      ? "warning"
                      : "neutral"
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

const reportPage = 10

function ResearchReport({
  hour,
  replicate,
}: {
  hour: number
  replicate: number
}) {
  const { batchId, checkpointReports, reportInterval } = useCultureData()

  const all = checkpointReports(replicate, hour)

  const [query, setQuery] = useState("")

  const [status, setStatus] = useState("all")

  const [newestFirst, setNewestFirst] = useState(true)

  const [shown, setShown] = useState(reportPage)

  const needle = query.trim().toLowerCase()

  const matches = all.filter(
    (report) =>
      (status === "all" || report.status === status) &&
      (!needle ||
        `${report.checkpoint_hour}h ${report.summary} ${report.recommendation}`
          .toLowerCase()
          .includes(needle)),
  )

  const reports = newestFirst ? [...matches].reverse() : matches

  // ponytail: no real batch start clock, so the run is anchored to now minus replay hours.
  const startedAt = Date.now() - hour * 3_600_000

  const madeAt = (h: number) => new Date(startedAt + h * 3_600_000)

  const download = (report: typeof reports[number]) => {
    const made = madeAt(report.checkpoint_hour)

    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>HemoForge report ${report.checkpoint_hour}h</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;padding:20px}h1{color:#9d232c}</style><h1>HemoForge report · ${report.checkpoint_hour}h</h1><p>Batch ${escapeHtml(report.batch_id)} · made ${made.toLocaleString()}</p><p>${escapeHtml(report.summary)}</p><p>${escapeHtml(report.recommendation)}</p><pre>${escapeHtml(JSON.stringify({ ...report, generated_at: made.toISOString() }, null, 2))}</pre></html>`

    downloadFile(
      `hemoforge-report-${report.batch_id}-${report.checkpoint_hour}h.html`,
      html,
      "text/html;charset=utf-8",
    )
  }

  return (
    <>
      <PageTitle
        title="Research Report"
        description={`Reports the AI made every ${reportInterval}h for ${batchId(replicate)}.`}
        action={<Badge>{all.length} reports</Badge>}
      />
      <Panel title="Past reports" caption="Click a report to download it">
        <div className="report-filters">
          <label className="search-field">
            <span className="sr-only">Search reports</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-4.5-4.5" />
            </svg>
            <input
              type="search"
              placeholder="Search by hour or text, e.g. 48h"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setShown(reportPage)
              }}
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setShown(reportPage)
              }}
            >
              <option value="all">All</option>
              <option value="normal">Normal</option>
              <option value="warning">Warning</option>
              <option value="needs_review">Needs review</option>
            </select>
          </label>
          <label>
            Sort
            <select
              value={newestFirst ? "newest" : "oldest"}
              onChange={(event) => setNewestFirst(event.target.value === "newest")}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <span role="status">
            {matches.length === all.length
              ? `${all.length} reports`
              : `${matches.length} of ${all.length} match`}
          </span>
        </div>
        <div className="report-timeline">
          {reports.length ? (
            reports.slice(0, shown).map((report) => (
              <button
                key={report.checkpoint_hour}
                onClick={() => download(report)}
                aria-label={`Download ${report.checkpoint_hour}h report`}
              >
                <span className="checkpoint-time">
                  {report.checkpoint_hour}h
                </span>
                <span>
                  <strong>
                    {madeAt(report.checkpoint_hour).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </strong>
                  <small>{report.summary}</small>
                </span>
                <Status status={report.status} />
                <Icon name="download" />
              </button>
            ))
          ) : all.length ? (
            <div className="empty-state">
              <strong>No matching reports</strong>
              <p>Change the search or status filter.</p>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No reports yet</strong>
              <p>
                Advance replay to {reportInterval}h to generate the first
                report.
              </p>
            </div>
          )}
        </div>
        {reports.length > shown && (
          <div className="report-more">
            <Button onClick={() => setShown(shown + reportPage)}>
              Show {Math.min(reportPage, reports.length - shown)} more
            </Button>
          </div>
        )}
      </Panel>
    </>
  )
}

const serviceLabels = {
  checking: "checking…",
  online: "connected",
  offline: "offline",
  disabled: "off",
} as const

/** Top-bar health: the Python API, the model server it talks to, and the bioreactor machine. */
function ServiceStatus({
  backend,
}: {
  backend: "checking" | "online" | "offline"
}) {
  const [llm, setLlm] = useState<BotStatus["llm_status"] | "checking">(
    "checking",
  )
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
    // ponytail: hardcoded until a real machine feed exists; derive from its heartbeat then.
    ["Machine", "online"],
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
  const { notice, notify } = workspaceData

  const profile = useProfile()

  const noticeProgress = notice?.message.endsWith("…")
  // Errors stay longer so they can be read.
  const noticeMs = notice?.tone === "error" ? 8000 : 5000

  // The notice clears when its exit animation ends (see onAnimationEnd).
  const [leavingId, setLeavingId] = useState<number | null>(null)
  const noticeLeaving = notice !== null && leavingId === notice.id

  function dismissNotice() {
    if (!notice) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) notify(null)
    else setLeavingId(notice.id)
  }

  useEffect(() => {
    if (!notice || noticeProgress) return
    const timer = setTimeout(dismissNotice, noticeMs)
    return () => clearTimeout(timer)
  }, [notice])

  const [view, setView] = useState<View>(() =>
    pages.some((item) => item.id === location.hash.slice(1).split("/")[0])
      ? location.hash.slice(1).split("/")[0] as View
      : "guard",
  )

  // Opening a page counts as seeing its new results.
  useEffect(() => {
    if (workspaceData.updates.includes(view)) workspaceData.unflag(view)
  }, [view, workspaceData.updates])

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

  const current = pages.find((item) => item.id === view)!

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
        pages.some((item) => item.id === next) ? next as View : "guard",
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
  }, [source])

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
      className={`app-shell${sidebarPinned ? " sidebar-pinned" : ""}${
        sidebarCollapsed ? " sidebar-collapsed" : ""
      }`}
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
          if (!e.currentTarget.contains(e.relatedTarget))
            setSidebarFocused(false)
        }}
      >
        <a
          className="brand"
          href="#dashboard"
          aria-label="HemoForge · Dashboard"
          onClick={(e) => {
            e.preventDefault()

            navigate("dashboard")
          }}
        >
          <img
            className="brand-mark"
            src="/favicon.svg"
            width="40"
            height="40"
            alt=""
          />
          <span>
            <strong>
              Hemo<span>Forge</span>
            </strong>
          </span>
        </a>
        <nav aria-label="Research modules">
          {navigationGroups.map((group, i) => (
            <div
              className="nav-group"
              key={group}
              role="group"
              aria-label={group}
            >
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
                    {workspaceData.updates.includes(item.id) && (
                      <span
                        className="nav-count nav-update"
                        title="New results"
                      >
                        !<span className="sr-only"> New results</span>
                      </span>
                    )}
                  </a>
                ))}
            </div>
          ))}
        </nav>
        {/* No accounts yet: signing out just returns to the landing page. */}
        <nav className="nav-signout" aria-label="Account">
          <a
            href="#account"
            title={sidebarCollapsed ? `Logged in as ${profile.name} · ${profile.company}` : "Account settings"}
            aria-current={view === "account" ? "page" : undefined}
            className={`nav-user${view === "account" ? " active" : ""}`}
            onClick={(e) => {
              e.preventDefault()
              navigate("account")
            }}
          >
            <span className="nav-avatar" aria-hidden="true">
              {initials(profile)}
            </span>
            <strong>
              <small>Logged in as</small>
              {profile.name || profile.username}
              <small>{profile.company}</small>
            </strong>
          </a>
          <a
            href="#"
            title={sidebarCollapsed ? "Sign out" : undefined}
            onClick={(e) => {
              e.preventDefault()
              location.hash = ""
            }}
          >
            <Icon name="logout" />
            <strong>Sign out</strong>
          </a>
        </nav>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          <span>Research Workspace</span>
          <Icon name="arrow" />
          <strong>{current.name}</strong>
        </div>
        <a
          className="mobile-brand"
          href="#dashboard"
          aria-label="HemoForge · Dashboard"
          onClick={(event) => {
            event.preventDefault()
            navigate("dashboard")
          }}
        >
          <img
            className="brand-mark"
            src="/favicon.svg"
            width="40"
            height="40"
            alt=""
          />
          <strong>
            Hemo<span>Forge</span>
          </strong>
        </a>
        <div className="header-actions">
          <ServiceStatus backend={workspaceData.backendStatus} />
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
      <main
        id="main-content"
        className={`workspace workspace-${view}`}
        tabIndex={-1}
      >
        {view === "bot" ? (
          <HemoBot
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
        ) : view === "dashboard" ? (
          <Dashboard
            hour={hour}
            replicate={replicate}
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
            />
          </>
        ) : view === "plan" ? (
          <ExperimentPlanner onEditData={() => navigate("data")} />
        ) : view === "match" ? (
          <MarkerScreen
            checks={checks}
            setChecks={setChecks}
            onEditData={() => navigate("data")}
          />
        ) : view === "account" ? (
          <AccountPage />
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
          <ResearchReport hour={hour} replicate={replicate} />
        )}
      </main>
      <div className="toast-region" role="status" aria-live="polite">
        {notice && ( // The key restarts the entry animation and countdown per notice.
          <div
            className={`toast is-${notice.tone}${
              noticeLeaving ? " is-leaving" : ""
            }`}
            key={notice.id}
            onAnimationEnd={(event) => {
              if (event.animationName === "toast-out") notify(null)
            }}
          >
            <Icon name="data" />
            <span>{notice.message}</span>
            {!noticeProgress && (
              <i
                className="toast-bar"
                style={{ animationDuration: `${noticeMs}ms` }}
              />
            )}
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={dismissNotice}
            >
              ×
            </button>
          </div>
        )}
      </div>
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
