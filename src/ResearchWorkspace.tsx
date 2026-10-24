import { sourceReferences as sources } from "./source-references"

import {
  Icon,
  Button,
  Badge,
  Panel,
  Details,
  PageTitle,
  Status,
  SignOutLink,
} from "./workspace-ui"

import { downloadFile } from "./workspace-utils"

import { DataProvider, useWorkspace, useCultureData } from "./workspace-context"

import DataWorkspace from "./DataWorkspace"

import RareMatchBook from "./RareMatchBook"

import HemoBot, { useHemoBot } from "./HemoBot"

import { jevStatus } from "./jev-api"

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
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  loadLimits,
  measuredSamples,
  processVariables,
  safeLimits,
  simulate,
} from "./dashboard-sim"

const MethodsPage = lazy(() => import("./MethodsPage"))

import AccountPage, { initials, useProfile } from "./AccountPage"

import { accountApi } from "./account"

import ActivityLog from "./ActivityLog"

import { CheckpointRoadmap, StageEstimate, TrendHealth } from "./PilotInsights"

import {
  analyzeMeasurements,
  batchMeasurements,
  checkpointReports,
  demoSource,
  liveHour,
  replayEndHour,
  screenProfiles,
  wallTime,
} from "./culture-monitoring"

import { doeConditions, doeEffects, formatDoeValue } from "./culture-doe"

type View = "data" | "dashboard" | "guard" | "pilot" | "plan" | "match" | "evo2" | "workflow" | "report" | "bot" | "methods" | "account" | "activity"

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
    id: "activity",

    name: "Activity log",

    purpose: "Notifications & process events",

    icon: "bell",

    group: "Output",
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

  replicate,

  sticky = false,
}: {
  hour: number

  replicate: number

  sticky?: boolean

  setHour: (hour: number) => void

  playing: boolean

  setPlaying: (playing: boolean) => void
}) {
  const { batchMeasurements, batchId } = useCultureData()

  const steps = sampleSteps(batchMeasurements(replicate), hour)

  // The latest data is now: the track ends at the current time, never at the run's end.
  const now = liveHour()

  // Leaving live pauses at the chosen time; the future past the clock is never shown.
  function move(next: number) {
    setPlaying(false)

    setHour(Math.min(next, liveHour()))
  }

  return (
    <section
      className={`replay-bar${sticky ? " is-sticky" : ""}`}
      aria-label="Replay controls"
    >
      <div className="replay-actions">
        <Button primary onClick={() => setPlaying(!playing)}>
          {playing ? "Pause" : "Go live"}
        </Button>
        <Button onClick={() => move(0)}>Reset</Button>
      </div>
      <div className="replay-track">
        <label htmlFor="replay-hour">
          <span>
            {playing ? "Live" : "Paused"} · {batchId(replicate)}
          </span>
          <strong>{wallTime(hour)}</strong>
        </label>
        <input
          id="replay-hour"
          type="range"
          min="0"
          max={now}
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
          max={now}
          step="any"
          value={Math.round(hour * 10) / 10}
          onChange={(event) => {
            const value = Number(event.target.value)

            if (Number.isFinite(value) && value >= 0 && value <= now)
              move(value)
          }}
        />
      </label>
    </section>
  )
}

type CheckpointReport = ReturnType<ReturnType<typeof useCultureData>["checkpointReports"]>[number]

/** One checkpoint report, read in ErythroPilot and inspected on Research Report. */

function ReportDetail({
  report,

  evidence,

  children,
}: {
  report: CheckpointReport

  evidence: string

  children?: ReactNode
}) {
  return (
    <div className="report-detail">
      <div className="report-reading">
        <span>Last available count</span>
        <strong>
          {report.last_count?.toFixed(2) ?? "—"}
          <small>×10⁶ cells</small>
        </strong>
        <p>
          Sampled at {report.last_measurement_hour}h · not at the reporting time
        </p>
      </div>
      <dl>
        <div>
          <dt>Data window</dt>
          <dd>
            ({report.data_window.from_hour}h, {report.checkpoint_hour}h]
          </dd>
        </div>
        <div>
          <dt>New samples</dt>
          <dd>{report.new_measurements}</dd>
        </div>
        <div>
          <dt>Change since prior report</dt>
          <dd>
            {report.change_since_previous === null
              ? "— · no new sample"
              : `${
                  report.change_since_previous > 0 ? "+" : ""
                }${report.change_since_previous.toFixed(2)} ×10⁶ cells`}
          </dd>
        </div>
        <div>
          <dt>Open warnings</dt>
          <dd>{report.open_warnings.length}</dd>
        </div>
        <div>
          <dt>Execution / evidence</dt>
          <dd>Succeeded / {evidence}</dd>
        </div>
      </dl>
      <p>{report.summary}</p>
      {report.open_warnings.map((event) => (
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
        <p>{report.recommendation}</p>
      </div>
      {children}
    </div>
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

  navigate: (view: View, detail?: string) => void
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
        <TrendHealth
          hour={hour}
          replicate={replicate}
          warnings={state.events.length}
        />
        <StageEstimate hour={hour} />
      </div>
      <section className="pilot-section" aria-label="Growth simulation">
        <SimulationPanel replicate={replicate} hour={hour} />
      </section>
      <div className="pilot-latest">
        <Panel
          title={
            selected
              ? `Latest report · ${selected.checkpoint_hour}h`
              : "Latest report"
          }
          action={selected && <Status status={selected.status} />}
        >
          {selected ? (
            <ReportDetail report={selected} evidence={source.evidence}>
              <div className="pilot-report-actions">
                <Button onClick={() => navigate("guard")}>
                  Review in Guard
                </Button>
                <Button
                  icon="report"
                  onClick={() =>
                    navigate("report", String(selected.checkpoint_hour))
                  }
                >
                  Review report
                </Button>
              </div>
            </ReportDetail>
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

// Names printed under the signature lines of every report; institution is the account's company.
type SignOff = {
  researcher: string
  supervisor: string
  institution: string
}

type SavedReport = {
  number: string
  created_at: string
  kind: "automated" | "hemobot"
  source: string
  batch_id: string
  hour: number | null
  status: string
  title: string
  summary: string
  lines: string[]
  sections: { heading: string; paragraphs: string[] }[]
}

function ResearchReport({
  focusHour,
  version,
  // Report to open first, from #report/<hour> (ErythroPilot's Review report).
}: {
  focusHour: number | null
  // Bumped when new reports are saved, so the list reloads.
  version: number
}) {
  const [signOff, setSignOff] = useState<SignOff | null>(null)
  const [names, setNames] = useState({ researcher: "", supervisor: "" })
  const [savingNames, setSavingNames] = useState(false)
  const [namesError, setNamesError] = useState("")
  const namesChanged =
    !!signOff &&
    (names.researcher.trim() !== signOff.researcher ||
      names.supervisor.trim() !== signOff.supervisor)
  useEffect(() => {
    accountApi<SignOff>("reports/signatories")
      .then((saved) => {
        setSignOff(saved)
        setNames({ researcher: saved.researcher, supervisor: saved.supervisor })
      })
      .catch((error: Error) => setNamesError(error.message))
  }, [])
  async function saveNames() {
    setSavingNames(true)
    setNamesError("")
    try {
      const saved = await accountApi<SignOff>("reports/signatories", "PUT", names)
      setSignOff(saved)
      setNames({ researcher: saved.researcher, supervisor: saved.supervisor })
      return true
    } catch (error) {
      setNamesError(error instanceof Error ? error.message : "Could not save the names.")
      return false
    } finally {
      setSavingNames(false)
    }
  }
  const [all, setAll] = useState<SavedReport[] | null>(null)
  const [loadError, setLoadError] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [activeNumber, setActiveNumber] = useState<string | null>(null)
  useEffect(() => setActiveNumber(null), [focusHour])
  useEffect(() => {
    accountApi<SavedReport[]>("reports")
      .then((reports) => {
        setAll(reports)
        setLoadError("")
      })
      .catch((error: Error) => setLoadError(error.message))
  }, [version])
  const list = all ?? []
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("all")
  const [newestFirst, setNewestFirst] = useState(true)
  const [shown, setShown] = useState(reportPage)
  const needle = query.trim().toLowerCase()
  const matches = list.filter(
    (report) =>
      (kind === "all" || report.kind === kind) &&
      (!needle ||
        `${report.hour ?? ""}h ${report.title} ${report.summary} ${report.source} ${report.batch_id}`
          .toLowerCase()
          .includes(needle)),
  )
  // The server sends newest first.
  const reports = newestFirst ? matches : [...matches].reverse()
  const selected =
    list.find((report) => report.number === activeNumber) ??
    list.find((report) => focusHour !== null && report.hour === focusHour) ??
    list[0]
  const download = async () => {
    if (!selected || exporting) return
    setExporting(true)
    setExportError("")
    try {
      // The PDF prints the saved names, so unsaved edits are saved first.
      if (namesChanged && !(await saveNames())) return
      const response = await fetch(`/api/reports/${selected.number}/pdf`, {
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(
          error?.detail ||
            "PDF export failed. Check the Python service and retry.",
        )
      }
      if (!response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error(
          "PDF service unavailable. Check the Python service and retry.",
        )
      }
      downloadFile(
        `${selected.number}.pdf`,
        await response.blob(),
        "application/pdf",
      )
    } catch (error) {
      setExportError(
        error instanceof Error &&
          error.name !== "TypeError" &&
          error.name !== "TimeoutError"
          ? error.message
          : "PDF export could not reach the Python service. Check the connection and retry.",
      )
    } finally {
      setExporting(false)
    }
  }
  return (
    <>
      <PageTitle
        title="Research Report"
        description="Reports from automated Dashboard actions and saved HemoBot analyses."
        action={<Badge>{list.length} reports</Badge>}
      />
      <Panel
        title="Formal PDF report"
        className="report-document"
        caption={
          selected
            ? `Create a PDF of ${selected.number} dated when the report was created.`
            : "Select a report once reports are available."
        }
        action={
          <Button
            primary
            icon="download"
            disabled={!selected || exporting}
            onClick={() => void download()}
          >
            {exporting ? "Generating PDF…" : "Download PDF"}
          </Button>
        }
      >
        <form
          className="report-document-fields"
          aria-busy={exporting || savingNames}
          onSubmit={(event) => {
            event.preventDefault()
            void saveNames()
          }}
        >
          <div className="settings-grid">
            <label>
              Researcher
              <input
                value={names.researcher}
                maxLength={120}
                disabled={!signOff || savingNames}
                autoComplete="name"
                placeholder="Name for researcher sign-off"
                onChange={(event) =>
                  setNames({ ...names, researcher: event.target.value })
                }
              />
            </label>
            <label>
              Supervisor
              <input
                value={names.supervisor}
                maxLength={120}
                disabled={!signOff || savingNames}
                placeholder="Name for supervisor sign-off"
                onChange={(event) =>
                  setNames({ ...names, supervisor: event.target.value })
                }
              />
            </label>
            <label>
              Institution / laboratory
              <input
                value={signOff?.institution ?? ""}
                readOnly
                placeholder="Set your company on the Account page"
              />
            </label>
          </div>
          <div className="report-names-actions">
            <Button
              primary={namesChanged}
              disabled={!namesChanged || savingNames}
              onClick={() => void saveNames()}
            >
              {savingNames ? "Saving…" : namesChanged ? "Save names" : "Names saved"}
            </Button>
          </div>
          <p className="panel-note">
            Saved for your workspace and printed on every report. The
            institution comes from your <a href="#account">account profile</a>.
            Sign above each printed name.
          </p>
          {(namesError || exportError) && (
            <p role="alert" className="import-error">
              {namesError || exportError}
            </p>
          )}
        </form>
      </Panel>
      <div className="report-layout">
        <Panel title="Past reports" caption="Select a report to inspect it">
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
              Type
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value)
                  setShown(reportPage)
                }}
              >
                <option value="all">All</option>
                <option value="automated">Automated action</option>
                <option value="hemobot">HemoBot</option>
              </select>
            </label>
            <label>
              Sort
              <select
                value={newestFirst ? "newest" : "oldest"}
                onChange={(event) =>
                  setNewestFirst(event.target.value === "newest")
                }
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <span role="status">
              {matches.length === list.length
                ? `${list.length} reports`
                : `${matches.length} of ${list.length} match`}
            </span>
          </div>
          {loadError && (
            <p role="alert" className="import-error">
              {loadError}
            </p>
          )}
          <div className="report-timeline">
            {reports.length ? (
              reports.slice(0, shown).map((report) => (
                <button
                  key={report.number}
                  className={report === selected ? "active" : ""}
                  aria-pressed={report === selected}
                  onClick={() => setActiveNumber(report.number)}
                >
                  <span className="checkpoint-time">
                    {report.hour === null ? "—" : `${report.hour}h`}
                  </span>
                  <span>
                    <strong>{report.title}</strong>
                    <small>{report.summary}</small>
                  </span>
                  <Status status={report.status} />
                  <Icon name="arrow" />
                </button>
              ))
            ) : list.length ? (
              <div className="empty-state">
                <strong>No matching reports</strong>
                <p>Change the search or type filter.</p>
              </div>
            ) : (
              <div className="empty-state">
                <strong>{all ? "No reports yet" : "Loading reports…"}</strong>
                <p>
                  A report is created when the Dashboard's automated control
                  acts on a variable past its action limit, or when you save a
                  HemoBot analysis as a report.
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
        <Panel
          title={selected ? selected.title : "Report detail"}
          caption={
            selected
              ? `${selected.source} · ${selected.batch_id}${
                  selected.hour === null ? "" : ` · ${selected.hour}h`
                }`
              : undefined
          }
          className="report-inspector"
        >
          {selected ? (
            <div className="report-detail">
              <dl>
                <div>
                  <dt>Report number</dt>
                  <dd>{selected.number}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{new Date(selected.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <Status status={selected.status} />
                  </dd>
                </div>
                <div>
                  <dt>Researcher</dt>
                  <dd>{signOff?.researcher || "Not set"}</dd>
                </div>
                <div>
                  <dt>Supervisor</dt>
                  <dd>{signOff?.supervisor || "Not set"}</dd>
                </div>
              </dl>
              <p>{selected.summary}</p>
              <ul>
                {selected.lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
              {selected.sections.map((section, index) => (
                <section key={index}>
                  <h3>
                    {index + 1}. {section.heading}
                  </h3>
                  {section.paragraphs.map((paragraph, item) => (
                    <p key={item}>{paragraph}</p>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <p className="panel-note">Select a report to inspect it.</p>
          )}
        </Panel>
      </div>
    </>
  )
}

const serviceLabels = {
  checking: "checking…",

  online: "connected",

  offline: "offline",

  disabled: "off",
} as const

/** Top-bar health: the Python API, the GCP inference service that runs the AI models, the database, and the bioreactor machine. */

function ServiceStatus({
  backend,
}: {
  backend: "checking" | "online" | "offline"
}) {
  const [gcp, setGcp] = useState<"checking" | "online" | "offline">(
    "checking",
  )

  const [database, setDatabase] = useState<"checking" | "online" | "offline">(
    "checking",
  )

  useEffect(() => {
    if (backend !== "online") return

    const check = () =>
      accountApi("health/db")

        .then(() => setDatabase("online"))

        .catch(() => setDatabase("offline"))

    void check()

    const timer = setInterval(check, 60_000)

    return () => clearInterval(timer)
  }, [backend])

  useEffect(() => {
    if (backend !== "online") return

    let controller: AbortController | undefined

    const check = () => {
      controller?.abort()

      controller = new AbortController()

      jevStatus(controller.signal)

        .then((status) => setGcp(status.status === "online" ? "online" : "offline"))

        .catch((error) => {
          if (error?.name !== "AbortError") setGcp("offline")
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

    ["GCP", backend === "online" ? gcp : backend],

    ["Database", backend === "online" ? database : backend],

    // ponytail: hardcoded until a real machine feed exists; derive from its heartbeat then.

    ["Machine", "online"],
  ] as const

  return (
    <span className="service-status" role="status">
      {services.map(([name, state]) => (
        <span key={name} className={`service-pill is-${state}`}>
          <span className={`status-dot is-${state}`} aria-hidden="true" />
          {name}
          <span className="sr-only"> {serviceLabels[state]}</span>
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


  const [replicate, setReplicate] = useState(1)

  const [eventNotes, setEventNotes] = useState<Record<string, string>>({})


  const [checks, setChecks] = useState([false, false, false])

  const botContext = {
    batch_id: batches[replicate - 1]?.id ?? batches[0]?.id ?? "No batch",

    // Whole hours: HemoBot clears its answer whenever this context changes.
    replay_elapsed_hours: Math.floor(hour),

    marker_settings: workspaceData.markerSettings,

    monitoring: workspaceData.monitoring,

    plan_settings: workspaceData.planSettings,

    report_interval: workspaceData.reportInterval,

    objective: workspaceData.planSettings.objective,

    verification_requests: checks,
  }

  const bot = useHemoBot(botContext)

  // Each automated Dashboard correction up to the replay hour becomes a report; the server ignores repeats.
  const [reportsVersion, setReportsVersion] = useState(0)
  const sentReports = useRef(new Set<string>())
  useEffect(() => {
    const batch = batches[replicate - 1]
    if (!batch) return
    const limits = safeLimits(loadLimits())
    const measured = measuredSamples(batch.measurements)
    const runs = simulate(limits, hour, measured)
    const reportKey = (item: { batch_id: string; variable: string; hour: number; action: string }) =>
      `${item.batch_id}:${item.variable}:${item.hour}:${item.action}`
    const actions = processVariables
      .flatMap((variable) =>
        runs[variable.id].actions
          // An exchange another variable triggered belongs to that variable's report.
          .filter((action) => !action.linkedFrom)
          .map((action) => {
            const settings = limits[variable.id]
            return {
              batch_id: batch.id,
              hour: action.hour,
              variable: variable.name,
              unit: variable.unit,
              side: action.side,
              limit: (action.side === "low" ? settings.actLow : settings.actHigh) ?? 0,
              warning: action.side === "low" ? settings.warnLow : settings.warnHigh,
              action: action.label,
              before: action.before,
              after: action.after,
              digits: variable.digits,
              measured: !!measured[variable.id],
              // The report's figure: 48 h before the event up to 12 h after, never past the replay hour.
              points: runs[variable.id].samples
                .filter((sample) => sample.hour >= action.hour - 48 && sample.hour <= Math.min(hour, action.hour + 12))
                .map((sample) => [sample.hour, sample.value]),
            }
          }),
      )
      .filter((item) => !sentReports.current.has(reportKey(item)))
    if (!actions.length) return
    const keys = actions.map(reportKey)
    keys.forEach((key) => sentReports.current.add(key))
    accountApi<{ created: number }>("reports/automated", "POST", { actions })
      .then(({ created }) => {
        if (!created) return
        setReportsVersion((value) => value + 1)
        workspaceData.flag("report")
      })
      .catch(() => keys.forEach((key) => sentReports.current.delete(key)))
  }, [hour, replicate, batches])

  const current = pages.find((item) => item.id === view)!

  useEffect(() => {
    document.title = `${current.name} · HemoForge`
  }, [current.name])

  // Live: the replay hour follows the wall clock (see liveStart), checked every second.
  useEffect(() => {
    if (!playing) return

    const tick = () => setHour(liveHour())

    tick()

    const timer = window.setInterval(tick, 1000)

    return () => clearInterval(timer)
  }, [playing])

  useEffect(() => {
    function hashChanged() {
      const next = location.hash.slice(1).split("/")[0]

      setMethodSection(location.hash.slice(1).split("/")[1] ?? "")

      setView(pages.some((item) => item.id === next) ? next as View : "guard")

      setMenuOpen(false)
    }

    window.addEventListener("hashchange", hashChanged)

    return () => window.removeEventListener("hashchange", hashChanged)
  }, [])

  useEffect(() => {
    setReplicate(1)

    setHour(0)

    // Data plays live by default; it pauses only when someone scrubs or presses Pause.
    setPlaying(true)

    setEventNotes({})
  }, [source])

  useEffect(() => {
    setChecks([false, false, false])
  }, [workspaceData.inputs.markers])

  // detail is the second hash segment: a Methods section or a report checkpoint hour.

  function navigate(next: View, detail = "") {
    setView(next)

    setMethodSection(detail)

    setMenuOpen(false)

    location.hash = detail ? `${next}/${detail}` : next

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
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            width="40"
            height="40"
            alt=""
          />
          <span>
            <strong>
              Hemo<span>Forge</span>
            </strong>
            <small className="brand-version" title="Build commit">
              v{__APP_COMMIT__}
            </small>
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
                    aria-label={
                      sidebarPinned
                        ? "Collapse sidebar to icons"
                        : "Keep sidebar open"
                    }
                    title={
                      sidebarPinned
                        ? "Collapse sidebar to icons"
                        : "Keep sidebar open"
                    }
                    aria-pressed={sidebarPinned}
                    aria-controls="research-navigation"
                    onClick={() => setSidebarPinned(!sidebarPinned)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                      <path d="M9 4.5v15" />
                      <path
                        d={
                          sidebarPinned
                            ? "m15.5 10-2 2 2 2"
                            : "m13.5 10 2 2-2 2"
                        }
                      />
                    </svg>
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
        <nav className="nav-signout" aria-label="Account">
          <a
            href="#account"
            title={
              sidebarCollapsed
                ? `${profile.name} · ${profile.company}`
                : "Account settings"
            }
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
              {profile.name || profile.username}
              <small>{profile.company}</small>
            </strong>
          </a>
          <SignOutLink collapsed={sidebarCollapsed} />
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
            src={`${import.meta.env.BASE_URL}favicon.svg`}
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
        ) : view === "activity" ? (
          <ActivityLog hour={hour} replicate={replicate} />
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
              description="Load the donor and recipient FASTA files, then check them side by side."
            />
            <RareMatchBook />
          </>
        ) : view === "workflow" ? (
          <Workflow navigate={navigate} />
        ) : (
          <ResearchReport
            version={reportsVersion}
            focusHour={Number(methodSection) || null}
          />
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
