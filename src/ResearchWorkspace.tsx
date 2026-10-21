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
import type { BotAnalysis, BotModule } from "./hemobot-api"

import {
  SimulationPanel,
  ExperimentPlanner,
  MarkerScreen,
  ChannelPanel,
} from "./AnalysisPanels"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  analyzeMeasurements,
  batchMeasurements,
  checkpointReports,
  demoSource,
  replayEndHour,
  screenProfiles,
} from "./culture-monitoring"

import { doeConditions, doeEffects, formatDoeValue } from "./culture-doe"

type View = "data" | "guard" | "pilot" | "plan" | "match" | "evo2" | "workflow" | "report" | "bot"

interface NavigationItem {
  id: View

  name: string

  purpose: string

  icon: string
}

const navigation: NavigationItem[] = [
  { id: "bot", name: "HemoBot", purpose: "Analyze research evidence", icon: "pilot" },
  {
    id: "data",

    name: "Data & runs",

    purpose: "Import, validate & run",

    icon: "data",
  },

  {
    id: "guard",

    name: "Bioreactor Guard",

    purpose: "Observe culture",

    icon: "guard",
  },

  {
    id: "pilot",

    name: "ErythroPilot",

    purpose: "Interpret & report",

    icon: "pilot",
  },

  {
    id: "plan",

    name: "CulturePlan",

    purpose: "Plan experiments",

    icon: "plan",
  },

  { id: "match", name: "RareMatch", purpose: "Screen markers", icon: "dna" },
  { id: "evo2", name: "Evo 2", purpose: "Prepare public sequences", icon: "dna" },

  {
    id: "workflow",

    name: "Workflow & datasets",

    purpose: "Trace the evidence",

    icon: "data",
  },

  {
    id: "report",

    name: "Research report",

    purpose: "Review & export",

    icon: "report",
  },
]

function GrowthChart({
  hour,

  replicate,

  compare,
}: {
  hour: number

  replicate: number

  compare: boolean
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
  } = useCultureData()

  const ref = useRef<SVGSVGElement>(null)

  const [width, setWidth] = useState(700)

  useEffect(() => {
    if (!ref.current) return

    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    )

    observer.observe(ref.current)

    return () => observer.disconnect()
  }, [])

  const x = (h: number) => 46 + (h / replayEndHour) * (width - 68)

  const yMax =
    Math.max(
      0.01,

      ...batchIndexes.flatMap((n) =>
        analyzeMeasurements(batchMeasurements(n), hour).valid.map(
          (sample) => sample.count!,
        ),
      ),
    ) * 1.15

  const y = (value: number) => 213 - (value / yMax) * 176

  const series = compare
    ? [replicate, ...batchIndexes.filter((n) => n !== replicate)]

        .slice(0, 3)

        .sort((a, b) => a - b)
    : [replicate]

  return (
    <svg
      ref={ref}
      className="growth-chart"
      viewBox={`0 0 ${width} 253`}
      role="img"
      aria-label={`Cell counts through ${hour} hours. Points are discrete samples; connecting lines are visual guides.`}
    >
      <title>Cell count replay — active source</title>
      <text x="46" y="17" className="axis-title">
        Cell count · ×10⁶ cells
      </text>
      {Array.from({ length: 5 }, (_, i) => (i * yMax) / 4).map((tick) => (
        <g key={tick}>
          <line
            x1="46"
            x2={width - 22}
            y1={y(tick)}
            y2={y(tick)}
            className="chart-grid"
          />
          <text x="32" y={y(tick) + 4} textAnchor="end">
            {tick.toPrecision(2)}
          </text>
        </g>
      ))}
      {Array.from({ length: width < 480 ? 5 : 8 }, (_, i) =>
        Math.round((i * replayEndHour) / (width < 480 ? 4 : 7)),
      )

        .map((tick) => (
          <text key={tick} x={x(tick)} y="237" textAnchor="middle">
            {tick}h
          </text>
        ))}
      <rect
        x={x(hour)}
        y="30"
        width={Math.max(0, width - 22 - x(hour))}
        height="183"
        fill="#f4f6f8"
      />
      {series.map((n) => {
        const samples = analyzeMeasurements(batchMeasurements(n), hour).valid

        const selected = n === replicate

        return (
          <g
            key={n}
            className={`series series-${((n - 1) % 3) + 1}${
              selected ? " selected" : ""
            }`}
          >
            <polyline
              points={samples

                .map((p) => `${x(p.hour)},${y(p.count!)}`)

                .join(" ")}
              fill="none"
              strokeWidth={selected ? 2.5 : 1.5}
            />
            {samples.map((p) => (
              <circle
                key={p.hour}
                cx={x(p.hour)}
                cy={y(p.count!)}
                r={selected ? 4 : 3}
              >
                <title>
                  {batchId(n)} · {p.hour}h · {p.count!.toFixed(2)} ×10⁶ cells
                </title>
              </circle>
            ))}
          </g>
        )
      })}
      <line
        x1={x(hour)}
        x2={x(hour)}
        y1="30"
        y2="213"
        className="replay-line"
      />
    </svg>
  )
}

function ReplayControls({
  hour,

  setHour,

  playing,

  setPlaying,

  speed,

  setSpeed,
}: {
  hour: number

  setHour: (hour: number) => void

  playing: boolean

  setPlaying: (playing: boolean) => void

  speed: number

  setSpeed: (speed: number) => void
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
  } = useCultureData()

  function move(next: number) {
    setPlaying(false)

    setHour(next)
  }

  return (
    <section className="replay-controls" aria-label="Replay controls">
      <div className="replay-actions">
        <Button
          primary
          onClick={() => {
            if (hour === replayEndHour) setHour(0)

            setPlaying(!playing)
          }}
        >
          {playing
            ? "Pause replay"
            : hour === replayEndHour
              ? "Replay again"
              : "Resume replay"}
        </Button>
        <Button onClick={() => move(0)}>Reset</Button>
      </div>
      <div className="replay-position">
        <label htmlFor="replay-hour">
          Culture replay{" "}
          <strong>
            {hour}h <span>/ {replayEndHour}h</span>
          </strong>
        </label>
        <input
          id="replay-hour"
          type="range"
          min="0"
          max={replayEndHour}
          step="1"
          value={hour}
          onChange={(e) => move(Number(e.target.value))}
        />
        <div className="range-labels">
          <span>Start · 0h</span>
          <span>Original sample times</span>
          <span>End · {replayEndHour}h</span>
        </div>
      </div>
      <label className="speed-select">
        Replay speed
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value="1">1 hour / second</option>
          <option value="6">6 hours / second</option>
          <option value="24">24 hours / second</option>
        </select>
      </label>
    </section>
  )
}

function Guard({
  hour,

  replicate,

  setReplicate,

  navigate,

  eventNotes,

  setEventNotes,
}: {
  hour: number

  replicate: number

  setReplicate: (n: number) => void

  navigate: (view: View) => void

  eventNotes: Record<string, string>

  setEventNotes: (notes: Record<string, string>) => void
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
  } = useCultureData()

  const [compare, setCompare] = useState(true)

  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)

  const state = analyzeMeasurements(batchMeasurements(replicate), hour)

  const event = state.events.find((item) => item.id === selectedEvent)

  const report = checkpointReports(replicate, hour).at(-1)

  return (
    <>
      <PageTitle
        title="Bioreactor Guard"
        description="Track cell growth and review warnings."
        action={<Badge tone="brand">Replay · {hour}h elapsed</Badge>}
      />
      <div className="section-heading">
        <h2>Batch overview</h2>
        <span>{batches.length} batches</span>
      </div>
      <fieldset className="batch-grid">
        <legend className="sr-only">Select culture batch</legend>
        {batchIndexes.map((n) => {
          const batch = analyzeMeasurements(batchMeasurements(n), hour)

          return (
            <label
              key={n}
              className={`batch-card${replicate === n ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="batch"
                checked={replicate === n}
                onChange={() => {
                  setReplicate(n)

                  setSelectedEvent(null)
                }}
              />
              <div className="batch-heading">
                <strong>{batchId(n)}</strong>
                <Status status={batch.status} />
              </div>
              <p>
                {batches[n - 1].cellLine} · batch {n}
              </p>
              <div className="batch-count">
                {batch.latest?.count?.toFixed(2) ?? "—"}
                <small>×10⁶ cells</small>
              </div>
              <footer>
                <span>
                  Last sample <b>{batch.latest?.hour ?? "—"}h</b>
                </span>
                <span>
                  {batch.visible.length} / {batchMeasurements(n).length} samples
                </span>
              </footer>
            </label>
          )
        })}
      </fieldset>
      <div className="guard-grid">
        <Panel
          title="Cell growth"
          caption={`${batchId(replicate)} · ${source.name}`}
          action={
            <label className="inline-check">
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) => setCompare(e.target.checked)}
              />
              Compare up to 3 batches
            </label>
          }
        >
          <div className="growth-metrics">
            <div>
              <span>Fold change from first sample</span>
              <strong>
                {state.foldChange?.toFixed(2) ?? "—"}
                <small>×</small>
              </strong>
            </div>
            <div>
              <span>Last interval growth rate</span>
              <strong>
                {state.growthRate?.toFixed(4) ?? "—"}
                <small>h⁻¹</small>
              </strong>
            </div>
            <div>
              <span>Latest sample</span>
              <strong>
                {state.latest?.hour ?? "—"}
                <small>h</small>
              </strong>
            </div>
          </div>
          <GrowthChart hour={hour} replicate={replicate} compare={compare} />
          <div className="chart-foot">
            <div className="series-key">
              {(compare
                ? [replicate, ...batchIndexes.filter((n) => n !== replicate)]

                    .slice(0, 3)

                    .sort((a, b) => a - b)
                : [replicate]
              )

                .map((n) => (
                  <span key={n}>
                    <i className={`series-dot r${((n - 1) % 3) + 1}`} />
                    {batchId(n)}
                  </span>
                ))}
            </div>
            <p>Points = measured samples</p>
          </div>
        </Panel>
        <Panel
          title="Events & warnings"
          action={
            <Badge tone={state.events.length ? "warning" : "neutral"}>
              {state.events.length} flagged
            </Badge>
          }
        >
          <div className="warning-list">
            {state.events.length ? (
              state.events.map((item) => (
                <button
                  className="warning-row"
                  key={item.id}
                  aria-expanded={selectedEvent === item.id}
                  onClick={() =>
                    setSelectedEvent(selectedEvent === item.id ? null : item.id)
                  }
                >
                  <Icon name="alert" />
                  <span>
                    <strong>
                      {item.status === "needs_review"
                        ? "Data need review"
                        : "Two consecutive declines"}
                    </strong>
                    <small>
                      {batchId(replicate)} · {item.hour}h · cell count
                    </small>
                  </span>
                  <Icon name="arrow" />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <Icon name="check" />
                <strong>No growth warnings at {hour}h</strong>
              </div>
            )}
            {event && (
              <div className="event-detail">
                <Badge tone="warning">{event.rule}</Badge>
                <p>{event.reason}</p>
                <dl>
                  <div>
                    <dt>Value</dt>
                    <dd>{event.value} ×10⁶ cells</dd>
                  </div>
                  <div>
                    <dt>Measured at</dt>
                    <dd>{event.hour}h relative</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{source.name}</dd>
                  </div>
                </dl>
                <label>
                  Follow-up note
                  <textarea
                    className="resize-none"
                    maxLength={1000}
                    value={eventNotes[`R${replicate}-${event.id}`] ?? ""}
                    onChange={(e) =>
                      setEventNotes({
                        ...eventNotes,

                        [`R${replicate}-${event.id}`]: e.target.value,
                      })
                    }
                    placeholder="Record the evidence to review and next steps…"
                  />
                  <small>
                    Kept during this session and included in the research
                    export.
                  </small>
                </label>
              </div>
            )}
          </div>
          <Details title="Monitoring rules">
            <p>
              Positive counts, consistent units, increasing timestamps, and two
              successive declines. Protocol limits and stale-data thresholds
              require a configured source.
            </p>
          </Details>
        </Panel>
        <ChannelPanel replicate={replicate} hour={hour} />
        <Panel
          title="ErythroPilot handoff"
          caption="A summary every 3 hours from Guard data"
          action={
            <Badge>
              {report ? `${report.checkpoint_hour}h checkpoint` : "Awaiting 3h"}
            </Badge>
          }
        >
          <div className="handoff">
            <div className="handoff-title">
              <Icon name="pilot" />
              <strong>
                {report?.new_measurements
                  ? "New measurement to review"
                  : "No new measurements"}
              </strong>
            </div>
            <p>
              {report?.summary ??
                "The first scheduled report is at 3h. The initial sample is available in Guard."}
            </p>
            <div className="handoff-meta">
              <span>
                Latest count <b>{state.latest?.count?.toFixed(2)} ×10⁶</b>
              </span>
              <span>
                Last sampled <b>{state.latest?.hour}h</b>
              </span>
            </div>
            <Button onClick={() => navigate("pilot")} icon="report">
              Open three-hour reports
            </Button>
          </div>
        </Panel>
      </div>
      <Details title="Available measurements · current input">
        <div className="table-scroll">
          <table aria-label="Available culture measurements">
            <thead>
              <tr>
                <th>Sample time</th>
                {batchIndexes.map((n) => (
                  <th key={n} className="numeric">
                    {batchId(n)}
                  </th>
                ))}
                <th>Unit / quality</th>
              </tr>
            </thead>
            <tbody>
              {state.visible.map((sample, index) => (
                <tr key={sample.hour}>
                  <td>{sample.hour}h</td>
                  {batchIndexes.map((n) => (
                    <td key={n} className="numeric">
                      {batchMeasurements(n)

                        .find((point) => point.hour === sample.hour)

                        ?.count?.toFixed(2) ?? "—"}
                    </td>
                  ))}
                  <td>×10⁶ cells · {source.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Details>
      <Details title="Measurement provenance & status definitions">
        <div className="two-column">
          <div>
            <h3>Trace every value</h3>
            <p>
              <code>dataset_id: {demoSource.dataset_id}</code>
              <br />
              <code>source: {source.name}</code>
              <br />
              Times and batch IDs come from the active input. Absolute
              laboratory timestamps and instrument IDs are not inferred. File
              SHA-256: {source.sha256 || "not available for built-in demo"}. A
              fingerprint establishes file identity, not scientific validity.
            </p>
          </div>
          <div>
            <h3>Read status in context</h3>
            <p>
              <b>Normal:</b> no configured growth rule triggered.{" "}
              <b>Warning:</b> a count trend needs review. <b>Needs review:</b>{" "}
              data validation failed. <b>No data:</b> a measurement is absent.
              Missing channels never receive a normal status.
            </p>
          </div>
        </div>
      </Details>
    </>
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
  } = useCultureData()

  const reports = useMemo(
    () => checkpointReports(replicate, hour),

    [replicate, hour, source],
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
        description="Review checkpoint reports and simulate growth."
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
        <Badge>Deterministic summaries</Badge>
      </div>
      <div className="pilot-grid">
        <Panel
          title="Three-hour reports"
          caption={`${reports.length} checkpoints reached · 8 per page`}
          action={<Badge>Every 3h</Badge>}
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
                <p>Advance replay to 3h to generate the first report.</p>
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
          caption="Only samples available at this checkpoint"
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
      <SimulationPanel replicate={replicate} hour={hour} />
      <Details title="21-day reporting roadmap · planned">
        <div className="roadmap-days" aria-label="21-day checkpoint roadmap">
          {Array.from({ length: 21 }, (_, i) => (
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
          21 days × 8 reports per day = 168 intervals. The culture input stops
          at {replayEndHour}h; observations are not invented after it ends.
          Harvest and QC remain pending.
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

const sources = [
  {
    name: "BEL-A · University of Bath",

    id: "BATH-01456",

    scope: "Static culture growth and metabolite DOE",

    details:
      "Proposal: 3 growth replicates × 8 timepoints; 12 separate DOE runs. Source timing extends to about 171h; the unverified UI fixture ends at 168h.",

    url: "https://doi.org/10.15125/BATH-01456",

    license: "CC BY 4.0 (proposal)",

    module: "Guard / CulturePlan",
  },

  {
    name: "Human erythroid transcriptomes",

    id: "GSE53983",

    scope: "Reference stage classification",

    details:
      "Proposal: 15 human samples, 5 stages × 3 replicates. Not a 21-day culture time series and not paired with BEL-A.",

    url: "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE53983",

    license: "Check source terms",

    module: "ErythroPilot reference",
  },

  {
    name: "1000 Genomes · Phase 3",

    id: "1000G-P3",

    scope: "Population genotype reference",

    details:
      "Proposal: KEL rs8176058 and SLC14A1 rs1058396. Sample IDs and GRCh38 allele orientation require verification before screening real profiles.",

    url: "https://www.internationalgenome.org/data/",

    license: "Check source terms",

    module: "RareMatch",
  },
]

function Workflow({ navigate }: { navigate: (view: View) => void }) {
  const workspaceData = useWorkspace()

  return (
    <>
      <PageTitle
        title="Workflow & datasets"
        description="See how inputs connect to each analysis."
      />
      <Panel title="Active workspace inputs">
        <div className="input-connections">
          {Object.values(workspaceData.inputs).map((file) => (
            <article key={file.kind}>
              <div>
                <h3>{file.name}</h3>
                <p>
                  {file.kind} · {file.rows.length} rows · {file.evidence}
                </p>
                <Details title="File fingerprint">
                  <code>
                    {file.sha256 || "Built-in demo; no external file hash"}
                  </code>
                </Details>
              </div>
              <Button onClick={() => navigate("data")}>
                Import / replace data
              </Button>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="HemoForge process map">
        <ol className="process-map">
          {[
            {
              name: "RareMatch",

              role: "Select",

              text: "Screen initial markers",

              view: "match" as View,
            },

            {
              name: "CulturePlan",

              role: "Plan",

              text: "Review experimental conditions",

              view: "plan" as View,
            },

            {
              name: "Bioreactor Guard",

              role: "Observe",

              text: "Compare batches and warnings",

              view: "guard" as View,
            },

            {
              name: "ErythroPilot",

              role: "Interpret",

              text: "Summarize every three hours",

              view: "pilot" as View,
            },
          ].map((stage) => (
            <li key={stage.name}>
              <button onClick={() => navigate(stage.view)}>
                <small>{stage.role}</small>
                <strong>{stage.name}</strong>
                <span>{stage.text}</span>
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
            <strong>FastAPI + Streamlit</strong>
            <p>
              The local Python API runs growth simulations and experiment
              predictions. Streamlit provides a second interface to the same
              models. HemoBot adds evidence analysis, local SQLite audits, and
              an optional private Ollama connection.
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

  kel,

  slc,

  candidate,

  checks,
}: {
  botAnalysis: BotAnalysis | null
  hour: number

  replicate: number

  notes: string

  setNotes: (v: string) => void

  eventNotes: Record<string, string>

  kel: string

  slc: string

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
  } = useCultureData()

  const [format, setFormat] = useState("HTML")

  const [feedback, setFeedback] = useState("")

  const reports = checkpointReports(replicate, hour)

  const state = analyzeMeasurements(batchMeasurements(replicate), hour)

  const rows = filterMarkers(
    workspaceData.inputs.markers.rows as MarkerRow[],

    kel,

    slc,
  )

  const bundle = {
    hemobot_analysis: botAnalysis,
    product: "HemoForge",

    generated_at: new Date().toISOString(),

    execution_status: "succeeded",

    evidence_status: "source_labeled",

    run: workspaceData.run,

    input_files: workspaceData.inputs,

    simulation:
      workspaceData.simulation?.batchId === batchId(replicate) &&
      workspaceData.simulation.sourceHash === source.sha256 &&
      workspaceData.simulation.result.fromHour === hour
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

    target_signature: { kel, slc },

    screening: rows,

    cultureplan: {
      selected_demo_condition:
        candidate === null
          ? null
          : (conditionSummary(
              workspaceData.inputs.experiments.rows as ExperimentRow[],
            )[candidate]?.id ?? null),

      gp_status: workspaceData.run?.plan ? "fitted" : "not_fitted",

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
          <span>Three-hour reports</span>
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
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document observations, limitations, and the next checks to run…"
            />
            <small>
              {notes.length} / 1000 characters · included in exports
            </small>
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
            <p>
              {format === "CSV"
                ? "Checkpoints and notes. Full workspace: JSON or HTML."
                : "Full workspace snapshot, including notes."}
            </p>
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

function ResearchWorkspaceContent() {
  const { batches, batchIndexes, replayEndHour, source } = useCultureData()

  const workspaceData = useWorkspace()

  const [view, setView] = useState<View>(() =>
    navigation.some((item) => item.id === location.hash.slice(1))
      ? location.hash.slice(1) as View
      : "guard",
  )

  const [menuOpen, setMenuOpen] = useState(false)

  const [hour, setHour] = useState(120)

  const [playing, setPlaying] = useState(false)

  const [speed, setSpeed] = useState(6)

  const [replicate, setReplicate] = useState(1)

  const [eventNotes, setEventNotes] = useState<Record<string, string>>({})

  const [notes, setNotes] = useState("")

  const [kel, setKel] = useState("G/A")

  const [slc, setSlc] = useState("G/G")

  const [candidate, setCandidate] = useState<number | null>(null)

  const [checks, setChecks] = useState([false, false, false])

  const botContext = {
    batch_id: batches[replicate - 1]?.id ?? batches[0]?.id ?? "No batch",
    replay_elapsed_hours: hour,
    kel,
    slc,
    objective: workspaceData.run?.plan?.objective ?? "maximize" as const,
    verification_requests: checks,
  }
  const bot = useHemoBot(botContext)

  const current = navigation.find((item) => item.id === view)!

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
      const next = location.hash.slice(1)

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
    <div className="app-shell">
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
            <small>Erythroid research</small>
          </span>
        </a>
        <div className="workspace-context">
          <span>GenoHack 2026</span>
          <strong>Erythroid research workspace</strong>
          <small>CASE-DEMO-01</small>
        </div>
        <nav aria-label="Research modules">
          {navigation.map((item) => (
            <a
              href={`#${item.id}`}
              key={item.id}
              aria-current={view === item.id ? "page" : undefined}
              className={view === item.id ? "active" : ""}
              onClick={(e) => {
                e.preventDefault()

                navigate(item.id)
              }}
            >
              <Icon name={item.icon} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.purpose}</small>
              </span>
              {item.id === "guard" && (
                <span className="nav-count">{batches.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <span className="status-dot" />
            <strong>Local analysis workspace</strong>
          </div>
          <span className="version-label">
            Prototype · no sensor connection
          </span>
        </div>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          <span>Research workspace</span>
          <Icon name="arrow" />
          <strong>{current.name}</strong>
        </div>
        <strong className="mobile-brand">HemoForge</strong>
        <div className="header-actions">
          <span className="replay-indicator">
            <span className="status-dot" />
            {workspaceData.run ? "Local analysis" : "Demo inputs"}
          </span>
          <Button icon="data" onClick={() => navigate("data")}>
            Import data
          </Button>
          <Button icon="report" onClick={() => navigate("report")}>
            View report
          </Button>
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
        {(view === "guard" || view === "pilot" || view === "bot") && (
          <ReplayControls
            hour={hour}
            setHour={setHour}
            playing={playing}
            setPlaying={setPlaying}
            speed={speed}
            setSpeed={setSpeed}
          />
        )}
        {(["guard", "pilot", "plan", "match"] as View[]).includes(view) && (
          <div className="bot-module-handoff"><span>Interpret the current evidence with HemoBot.</span>
            <Button onClick={() => { bot.prepare(view as BotModule); navigate("bot") }}>Ask HemoBot</Button>
          </div>
        )}
        {view === "bot" ? (
          <HemoBot bot={bot} context={botContext} batchChoices={batches.map(batch => batch.id)}
            onBatchChange={id => setReplicate(batches.findIndex(batch => batch.id === id) + 1)} />
        ) : view === "data" ? (
          <DataWorkspace onRun={() => navigate("guard")} />
        ) : view === "guard" ? (
          <Guard
            hour={hour}
            replicate={replicate}
            setReplicate={setReplicate}
            navigate={navigate}
            eventNotes={eventNotes}
            setEventNotes={setEventNotes}
          />
        ) : view === "pilot" ? (
          <Pilot
            hour={hour}
            replicate={replicate}
            setReplicate={setReplicate}
            navigate={navigate}
          />
        ) : view === "plan" ? (
          <ExperimentPlanner
            candidate={candidate}
            setCandidate={setCandidate}
          />
        ) : view === "match" ? (
          <MarkerScreen
            kel={kel}
            setKel={setKel}
            slc={slc}
            setSlc={setSlc}
            checks={checks}
            setChecks={setChecks}
          />
        ) : view === "evo2" ? (
          <><PageTitle title="Evo 2 · sequence workspace" description="Browse public GRCh38 variants, prepare local tasks or explicitly score one public variant through the optional NVIDIA trial." />
            <Evo2Preparation /></>
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
            kel={kel}
            slc={slc}
            candidate={candidate}
            checks={checks}
          />
        )}
        <footer className="workspace-footer">
          <span>HemoForge</span>
          <span>Research decision support · Harvest & QC pending</span>
        </footer>
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
