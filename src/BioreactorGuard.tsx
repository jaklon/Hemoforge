import { useMemo, useRef, useState, useEffect, type ReactNode } from "react"
import { useCultureData, useWorkspace } from "./workspace-context"
import {
  Button,
  Panel,
  Badge,
  PageTitle,
  Status,
  Icon,
  Details,
} from "./workspace-ui"
import MonitoringControls from "./MonitoringControls"
import { ChannelPanel } from "./AnalysisPanels"
import { csv, downloadFile } from "./workspace-utils"
import {
  summarizeGuardBatch,
  guardSeries,
  guardEventInfo,
  formatGuardNumber as number,
  type GuardBatchSummary,
} from "./guard-insights"

type BatchView = {
  index: number
  id: string
  cellLine: string
  total: number
  summary: GuardBatchSummary
}

function Sparkline({ summary }: { summary: GuardBatchSummary }) {
  const segments = guardSeries(summary, 0, "count")
  const points = segments.flat()
  const end = Math.max(1, points.at(-1)?.hour ?? 1)
  const max = Math.max(0.01, ...points.map((point) => point.value))
  const min = Math.min(...points.map((point) => point.value), max)
  const range = max - min || max * 0.1
  return (
    <svg className="guard-sparkline" viewBox="0 0 110 32" aria-hidden="true">
      {segments.map((segment, i) => (
        <polyline
          key={i}
          points={segment
            .map(
              (point) =>
                `${4 + (point.hour / end) * 102},${27 - ((point.value - min) / range) * 23}`,
            )
            .join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      ))}
      {points.at(-1) && (
        <circle
          cx={4 + (points.at(-1)!.hour / end) * 102}
          cy={27 - ((points.at(-1)!.value - min) / range) * 23}
          r="2.5"
          fill="currentColor"
        />
      )}
    </svg>
  )
}

function GrowthChart({
  batches,
  selected,
  hour,
  endHour,
}: {
  batches: BatchView[]
  selected: BatchView
  hour: number
  endHour: number
}) {
  const { guardView: view, setGuardView: setView } = useWorkspace()
  const chart = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(700)
  const [inspectedHour, setInspectedHour] = useState<number | null>(null)
  useEffect(() => {
    if (!chart.current) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, entry.contentRect.width)),
    )
    observer.observe(chart.current)
    return () => observer.disconnect()
  }, [])
  const start = view.window ? Math.max(0, hour - view.window) : 0
  const end = Math.max(start + 1, view.window ? hour : endHour)
  const displayed = batches.filter(
    (batch) =>
      batch.index === selected.index ||
      (view.compare && !view.hiddenBatchIds.includes(batch.id)),
  )
  const series = displayed.map((batch) => ({
    ...batch,
    segments: guardSeries(batch.summary, start, view.scale),
  }))
  const allPoints = series.flatMap((batch) => batch.segments.flat())
  const max = Math.max(0.01, ...allPoints.map((point) => point.value)) * 1.12
  const x = (time: number) =>
    54 + ((time - start) / (end - start)) * (width - 78)
  const y = (value: number) => 245 - (value / max) * 195
  const selectedPoints = series
    .find((batch) => batch.index === selected.index)!
    .segments.flat()
  const point =
    selectedPoints.find((point) => point.hour === inspectedHour) ??
    selectedPoints.at(-1)
  function comparison(id: string) {
    setView((old) => ({
      ...old,
      hiddenBatchIds: old.hiddenBatchIds.includes(id)
        ? old.hiddenBatchIds.filter((value) => value !== id)
        : [...old.hiddenBatchIds, id],
    }))
  }
  return (
    <>
      <div className="guard-chart-controls">
        <fieldset className="guard-segmented">
          <legend className="sr-only">Growth chart scale</legend>
          <button
            type="button"
            aria-pressed={view.scale === "count"}
            onClick={() => setView({ ...view, scale: "count" })}
          >
            Cell count
          </button>
          <button
            type="button"
            aria-pressed={view.scale === "fold"}
            onClick={() => setView({ ...view, scale: "fold" })}
          >
            Fold change
          </button>
        </fieldset>
        <label>
          Time window
          <select
            value={view.window}
            onChange={(event) =>
              setView({ ...view, window: Number(event.target.value) })
            }
          >
            <option value="0">Full source window</option>
            <option value="24">Last 24 hours</option>
            <option value="72">Last 72 hours</option>
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={view.compare}
            onChange={(event) =>
              setView({ ...view, compare: event.target.checked })
            }
          />
          Compare batches
        </label>
      </div>
      <svg
        ref={chart}
        className="guard-growth-chart"
        viewBox={`0 0 ${width} 280`}
        role="img"
        aria-label={`${
          view.scale === "fold" ? "Fold change" : "Cell counts"
        } for ${selected.id}${
          view.compare ? " and comparison batches" : ""
        }, ${number(start)}h to ${number(end)}h. Observations stop at ${number(hour)}h; gaps represent missing or invalid rows.`}
      >
        <text x="54" y="25" className="axis-title">
          {view.scale === "count"
            ? "Cell count · ×10⁶ cells"
            : "Fold change · first valid sample = 1×"}
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1="54"
              x2={width - 24}
              y1={y(max * fraction)}
              y2={y(max * fraction)}
              className="chart-grid"
            />
            <text x="44" y={y(max * fraction) + 4} textAnchor="end">
              {number(max * fraction)}
            </text>
          </g>
        ))}
        {hour < end && (
          <rect
            x={x(hour)}
            y="40"
            width={Math.max(0, x(end) - x(hour))}
            height="205"
            fill="var(--guard-future)"
          />
        )}
        {series.map((batch) => (
          <g
            key={batch.id}
            className={`guard-series ${
              batch.index === selected.index
                ? "is-current"
                : batch.index % 2
                  ? "is-teal"
                  : "is-slate"
            }`}
          >
            {batch.segments.map((segment, index) => (
              <polyline
                key={index}
                points={segment
                  .map((sample) => `${x(sample.hour)},${y(sample.value)}`)
                  .join(" ")}
                fill="none"
                strokeWidth={batch.index === selected.index ? 2.6 : 1.5}
                strokeDasharray={
                  batch.index === selected.index
                    ? undefined
                    : batch.index % 3 === 0
                      ? "3 4"
                      : undefined
                }
              />
            ))}
            {batch.segments.flat().map((sample) => (
              <circle
                key={sample.hour}
                cx={x(sample.hour)}
                cy={y(sample.value)}
                r={batch.index === selected.index ? 3.8 : 2.5}
              >
                <title>
                  {batch.id} · {sample.hour}h · {number(sample.value)}
                  {view.scale === "count" ? " million cells" : "×"}
                </title>
              </circle>
            ))}
          </g>
        ))}
        {point && (
          <line
            x1={x(point.hour)}
            x2={x(point.hour)}
            y1="40"
            y2="245"
            className="guard-inspection-line"
          />
        )}
        <line
          x1={x(Math.min(hour, end))}
          x2={x(Math.min(hour, end))}
          y1="40"
          y2="245"
          className="replay-line"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <text
            key={fraction}
            x={x(start + (end - start) * fraction)}
            y="269"
            textAnchor="middle"
          >
            {number(start + (end - start) * fraction)}h
          </text>
        ))}
        {!allPoints.length && (
          <text x={width / 2} y="140" textAnchor="middle">
            {view.scale === "fold"
              ? "No valid baseline in this view"
              : "No valid samples in this window"}
          </text>
        )}
      </svg>
      <div className="guard-legend" aria-label="Chart series">
        <span className="guard-current-series">
          <i />
          {selected.id} <small>selected</small>
        </span>
        {view.compare &&
          batches
            .filter((batch) => batch.index !== selected.index)
            .map((batch) => (
              <label
                key={batch.id}
                className={`inline-check ${
                  batch.index % 2 ? "is-teal" : "is-slate"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!view.hiddenBatchIds.includes(batch.id)}
                  onChange={() => comparison(batch.id)}
                />
                {batch.id}
              </label>
            ))}
      </div>
      {view.scale === "fold" && selected.summary.foldChange === null && (
        <p className="panel-note">
          Fold change is unavailable for {selected.id}.{" "}
          {selected.summary.status === "needs_review"
            ? "Review the invalid source rows before using derived growth values."
            : "Advance to a valid source sample to establish a baseline."}
        </p>
      )}
      <div className="guard-inspector">
        <label>
          Inspect a source sample
          <select
            disabled={!selectedPoints.length}
            value={point?.hour ?? ""}
            onChange={(event) => setInspectedHour(Number(event.target.value))}
          >
            {selectedPoints.length ? (
              selectedPoints.map((sample) => (
                <option key={sample.hour} value={sample.hour}>
                  {selected.id} · {sample.hour}h
                </option>
              ))
            ) : (
              <option value="">No samples in this window</option>
            )}
          </select>
        </label>
        <div>
          <span>
            {view.scale === "count" ? "Measured count" : "Observed fold change"}
          </span>
          <strong>
            {point ? number(point.value) : "—"}
            <small>
              {point ? (view.scale === "count" ? " ×10⁶ cells" : "×") : ""}
            </small>
          </strong>
        </div>
        <p>
          Points are source measurements. Lines guide the eye; gaps stay
          visible.{hour < end ? " Grey area is not yet replayed." : ""}
        </p>
      </div>
    </>
  )
}

export default function BioreactorGuard({
  hour,
  replicate,
  setReplicate,
  navigate,
  eventNotes,
  setEventNotes,
  replayControls,
}: {
  hour: number
  replicate: number
  setReplicate: (index: number) => void
  navigate: (view: "data" | "pilot" | "report") => void
  eventNotes: Record<string, string>
  setEventNotes: (notes: Record<string, string>) => void
  replayControls: ReactNode
}) {
  const {
    batches,
    source,
    replayEndHour,
    monitoring,
    reportInterval,
    checkpointReports,
  } = useCultureData()
  const { guardView: view, setGuardView: setView } = useWorkspace()
  const settingsRef = useRef<HTMLDivElement>(null)
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [measurementPage, setMeasurementPage] = useState(0)
  const batchViews = useMemo(
    () =>
      batches.map((batch, index) => ({
        index: index + 1,
        id: batch.id,
        cellLine: batch.cellLine,
        total: batch.measurements.length,
        summary: summarizeGuardBatch(batch.measurements, hour, monitoring),
      })),
    [batches, hour, monitoring],
  )
  const selected =
    batchViews.find((batch) => batch.index === replicate) ?? batchViews[0]
  const state = selected.summary
  const attention = batchViews.filter((batch) => batch.summary.events.length)
  const noData = batchViews.filter((batch) => !batch.summary.latest)
  const shown = view.attentionOnly ? attention : batchViews
  const urgent = [...attention].sort(
    (a, b) => b.summary.priority - a.summary.priority,
  )[0]
  const warnings = [...state.events].sort(
    (a, b) =>
      (b.status === "needs_review" ? 1 : 0) -
        (a.status === "needs_review" ? 1 : 0) || b.hour - a.hour,
  )
  const event =
    warnings.find((item) => item.id === selectedEvent) ?? warnings[0]
  const eventInfo = event ? guardEventInfo(event, monitoring) : null
  const report = useMemo(
    () => checkpointReports(replicate, hour).at(-1),
    [replicate, hour, source, monitoring, reportInterval],
  )
  const page = Math.min(
    measurementPage,
    Math.max(0, Math.ceil(state.visible.length / 25) - 1),
  )
  const noteKey = event ? `R${selected.index}-${event.id}` : ""
  function configure() {
    const details = settingsRef.current?.querySelector("details")
    if (details) {
      details.open = true
      details.scrollIntoView({ block: "start", behavior: "instant" })
      details.querySelector("summary")?.focus()
    }
  }
  function choose(index: number) {
    setReplicate(index)
    setSelectedEvent(null)
    setMeasurementPage(0)
  }
  return (
    <div className="guard-workspace">
      <PageTitle
        title="Bioreactor Guard"
        description="See what changed, what needs review, and which sample to check next."
        action={
          <div className="header-actions">
            <Badge>
              {source.evidence === "software_test_only"
                ? "Synthetic replay"
                : "Imported observations"}
            </Badge>
            <Button onClick={configure}>Monitoring rules</Button>
          </div>
        }
      />
      <div
        className={`guard-overview${attention.length ? " has-attention" : ""}`}
      >
        <div className="guard-overview-message">
          <Icon
            name={
              attention.length
                ? "alert"
                : noData.length === batches.length
                  ? "data"
                  : "guard"
            }
          />
          <div>
            <h2>
              {attention.length
                ? `${attention.length} ${
                    attention.length === 1 ? "batch needs" : "batches need"
                  } review`
                : noData.length === batches.length
                  ? "Waiting for source measurements"
                  : "No configured warnings at this cutoff"}
            </h2>
            <p>
              {attention.length
                ? "Review recorded warnings alongside the original measurements."
                : "Status reflects your configured rules and available data."}
            </p>
          </div>
        </div>
        <dl className="guard-fleet-stats">
          <div>
            <dt>Batches</dt>
            <dd>{batches.length}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>
              {batchViews.reduce(
                (sum, batch) => sum + batch.summary.events.length,
                0,
              )}
            </dd>
          </div>
          <div>
            <dt>Without a valid count</dt>
            <dd>{noData.length}</dd>
          </div>
        </dl>
        {urgent && (
          <Button
            onClick={() => {
              choose(urgent.index)
              document
                .getElementById("guard-review")
                ?.scrollIntoView({ behavior: "instant", block: "start" })
              document
                .getElementById("guard-review-heading")
                ?.focus({ preventScroll: true })
            }}
          >
            Review {urgent.id}
          </Button>
        )}
      </div>
      {replayControls}
      <div className="guard-source-line">
        <span>
          <Icon name="data" />
          {source.name}
        </span>
        <span>Source measurements · cutoff {number(hour)}h</span>
        <button
          type="button"
          className="text-button"
          onClick={() => navigate("data")}
        >
          Edit scenario data
        </button>
      </div>
      <div className="section-heading guard-batch-heading">
        <div>
          <h2>Batch overview</h2>
          <p>Select a batch to inspect its measurements and warnings.</p>
        </div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={view.attentionOnly}
            onChange={(event) =>
              setView({ ...view, attentionOnly: event.target.checked })
            }
          />
          Needs attention only
        </label>
      </div>
      <fieldset className="guard-batches">
        <legend className="sr-only">Select culture batch</legend>
        {shown.map((batch) => (
          <label
            key={batch.id}
            className={`guard-batch-card${
              selected.index === batch.index ? " is-selected" : ""
            }`}
          >
            <input
              type="radio"
              name="guard-batch"
              checked={selected.index === batch.index}
              onChange={() => choose(batch.index)}
            />
            <div className="guard-batch-title">
              <strong>{batch.id}</strong>
              <Status status={batch.summary.status} />
            </div>
            <p>{batch.cellLine}</p>
            <div className="guard-batch-reading">
              <strong>
                {number(batch.summary.latest?.count ?? null)}
                <small> ×10⁶ cells</small>
              </strong>
              <Sparkline summary={batch.summary} />
            </div>
            <div
              className={`guard-batch-trend${
                batch.summary.delta !== null && batch.summary.delta < 0
                  ? " is-declining"
                  : ""
              }`}
            >
              <span>
                {batch.summary.percentChange === null
                  ? "Awaiting comparison"
                  : `${
                      batch.summary.percentChange > 0 ? "+" : ""
                    }${number(batch.summary.percentChange, 1)}% since prior sample`}
              </span>
              <span>
                {batch.summary.latest
                  ? `${number(batch.summary.sampleAge)}h old`
                  : "No valid count"}
              </span>
            </div>
            <footer>
              <span>
                Last valid sample{" "}
                <b>
                  {batch.summary.latest
                    ? `${number(batch.summary.latest.hour)}h`
                    : "—"}
                </b>
              </span>
              <span>
                {batch.summary.visible.length}/{batch.total} rows revealed
              </span>
            </footer>
          </label>
        ))}
      </fieldset>
      {!shown.length && (
        <div className="guard-filter-empty">
          <Icon name="check" />
          <span>No batches have recorded warnings at this cutoff.</span>
          <Button onClick={() => setView({ ...view, attentionOnly: false })}>
            Show all batches
          </Button>
        </div>
      )}
      <div className="guard-main-grid">
        <Panel
          title={`${selected.id} · growth`}
          caption={`${state.trend} · original sample times`}
          className="guard-growth-panel"
          action={<Status status={state.status} />}
        >
          <div className="guard-metrics">
            <div>
              <span>Latest valid count</span>
              <strong>
                {number(state.latest?.count ?? null)}
                <small> ×10⁶</small>
              </strong>
            </div>
            <div>
              <span>Last interval change</span>
              <strong
                className={
                  state.delta !== null && state.delta < 0 ? "is-declining" : ""
                }
              >
                {state.percentChange !== null && state.percentChange > 0
                  ? "+"
                  : ""}
                {number(state.percentChange, 1)}
                <small>{state.percentChange === null ? "" : "%"}</small>
              </strong>
            </div>
            <div>
              <span>Fold from first sample</span>
              <strong>
                {number(state.foldChange)}
                <small>{state.foldChange === null ? "" : "×"}</small>
              </strong>
            </div>
            <div>
              <span>Latest valid sample age</span>
              <strong>
                {number(state.sampleAge)}
                <small>{state.sampleAge === null ? "" : "h"}</small>
              </strong>
            </div>
          </div>
          <GrowthChart
            batches={batchViews}
            selected={selected}
            hour={hour}
            endHour={replayEndHour}
          />
        </Panel>
        <section
          id="guard-review"
          className="panel guard-review-panel"
          aria-labelledby="guard-review-heading"
        >
          <header>
            <div>
              <h2 id="guard-review-heading" tabIndex={-1}>
                Review warnings
              </h2>
              <p>
                {selected.id} · recorded through {number(hour)}h
              </p>
            </div>
            <Badge tone={warnings.length ? "warning" : "neutral"}>
              {warnings.length} flagged
            </Badge>
          </header>
          <div className="guard-warning-list">
            {warnings.length ? (
              warnings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`guard-warning-row${
                    event?.id === item.id ? " is-selected" : ""
                  }`}
                  aria-pressed={event?.id === item.id}
                  onClick={() => setSelectedEvent(item.id)}
                >
                  <Icon name="alert" />
                  <span>
                    <strong>{guardEventInfo(item, monitoring).title}</strong>
                    <small>
                      {item.variable === "sample_age"
                        ? "Evaluated"
                        : "Measured"}{" "}
                      at {number(item.hour)}h
                      {eventNotes[`R${selected.index}-${item.id}`]
                        ? " · note recorded"
                        : ""}
                    </small>
                  </span>
                  <Icon name="arrow" />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <Icon name={state.latest ? "check" : "data"} />
                <strong>
                  {state.latest
                    ? "No warnings recorded"
                    : "No valid samples yet"}
                </strong>
                <p>
                  {state.latest
                    ? "Keep reviewing new source measurements as replay advances."
                    : "Advance to a source sample or import measurements."}
                </p>
              </div>
            )}
          </div>
          {event && eventInfo && (
            <div className="guard-event-detail">
              <div className="guard-event-label">
                <span>
                  {event.status === "needs_review"
                    ? "Data quality"
                    : event.variable === "sample_age"
                      ? "Sample freshness"
                      : "Growth trend"}
                </span>
                <Badge tone="warning">Review required</Badge>
              </div>
              <p>{event.reason}</p>
              <dl>
                <div>
                  <dt>
                    {event.variable === "sample_age"
                      ? "Age at cutoff"
                      : "Source count"}
                  </dt>
                  <dd>
                    {number(event.value)}{" "}
                    {event.variable === "sample_age" ? "hours" : "×10⁶ cells"}
                  </dd>
                </div>
                <div>
                  <dt>Rule</dt>
                  <dd>
                    {event.variable === "sample_age"
                      ? `Older than ${monitoring.staleHours}h`
                      : event.status === "needs_review"
                        ? "Valid positive source data"
                        : `${monitoring.declineCount} declines · ≥${monitoring.dropPercent}% each`}
                  </dd>
                </div>
              </dl>
              <div className="guard-next-step">
                <strong>What to check next</strong>
                <p>{eventInfo.action}</p>
              </div>
              <label className="guard-note-label" htmlFor="guard-follow-up">
                Researcher follow-up
                <textarea
                  className="resize-none"
                  id="guard-follow-up"
                  value={eventNotes[noteKey] ?? ""}
                  onChange={(e) =>
                    setEventNotes({ ...eventNotes, [noteKey]: e.target.value })
                  }
                  placeholder="Record your observation and next step…"
                />
              </label>
              <small className="guard-note-status" role="status">
                {eventNotes[noteKey]
                  ? "Note saved in this session · included in research exports"
                  : "Notes stay with this warning during the session."}
              </small>
              <Button onClick={() => navigate("data")}>
                Review source data
              </Button>
            </div>
          )}
          <p className="panel-note">
            Warnings form a history. A later rise does not erase an earlier
            flag; follow-up notes record your review.
          </p>
        </section>
      </div>
      <div className="guard-secondary-grid">
        <ChannelPanel
          replicate={replicate}
          hour={hour}
          onImport={() => navigate("data")}
        />
        <Panel
          title="Continue in ErythroPilot"
          caption="The same selected batch and replay cutoff"
          className="guard-handoff-panel"
          action={<Icon name="pilot" />}
        >
          <div className="handoff">
            <Badge>
              {report
                ? `${number(report.checkpoint_hour)}h checkpoint`
                : `First report at ${reportInterval}h`}
            </Badge>
            <h3>
              {report?.new_measurements
                ? "A new sample is ready to review"
                : report
                  ? "Latest checkpoint is ready"
                  : "Waiting for the first checkpoint"}
            </h3>
            <p>
              {report?.summary ??
                `Advance replay to ${reportInterval}h for the first report. Source measurements remain available here.`}
            </p>
            <dl>
              <div>
                <dt>Selected batch</dt>
                <dd>{selected.id}</dd>
              </div>
              <div>
                <dt>Report interval</dt>
                <dd>Every {reportInterval}h</dd>
              </div>
            </dl>
            <div className="guard-handoff-actions">
              <Button primary icon="report" onClick={() => navigate("pilot")}>
                Open checkpoint reports
              </Button>
              <Button onClick={() => navigate("report")}>
                Research export
              </Button>
            </div>
          </div>
        </Panel>
      </div>
      <div ref={settingsRef} id="guard-settings">
        <MonitoringControls />
      </div>
      <Details title={`Source measurements · ${selected.id}`}>
        <div className="guard-table-actions">
          <p>
            {state.visible.length} source rows through {number(hour)}h. Missing
            or invalid values remain visible.
          </p>
          <Button
            icon="download"
            disabled={!state.visible.length}
            onClick={() =>
              downloadFile(
                `hemogpt-${selected.id.replace(/[^a-z0-9_-]/gi, "_")}-${hour}h-observations.csv`,
                csv([
                  [
                    "batch_id",
                    "elapsed_hours",
                    "cell_count_million",
                    "unit",
                    "data_quality",
                    "source",
                    "sha256",
                  ],
                  ...state.visible.map((sample) => [
                    selected.id,
                    sample.hour,
                    sample.count,
                    sample.unit,
                    state.valid.includes(sample) ? "valid" : "needs_review",
                    source.name,
                    source.sha256,
                  ]),
                ]),
                "text/csv;charset=utf-8",
              )
            }
          >
            Export observations CSV
          </Button>
        </div>
        <div className="table-scroll">
          <table aria-label={`Source measurements for ${selected.id}`}>
            <thead>
              <tr>
                <th>Source time</th>
                <th className="numeric">Count · ×10⁶ cells</th>
                <th>Data quality</th>
              </tr>
            </thead>
            <tbody>
              {state.visible
                .slice(page * 25, (page + 1) * 25)
                .map((sample, index) => (
                  <tr key={`${sample.hour}-${index}`}>
                    <td>{number(sample.hour)}h</td>
                    <td className="numeric">{number(sample.count)}</td>
                    <td>
                      <Badge
                        tone={
                          state.valid.includes(sample) ? "neutral" : "warning"
                        }
                      >
                        {state.valid.includes(sample)
                          ? "Valid row"
                          : "Needs review"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              {!state.visible.length && (
                <tr>
                  <td colSpan={3}>
                    No source rows at this cutoff. Advance replay or import
                    data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <Button disabled={!page} onClick={() => setMeasurementPage(page - 1)}>
            Previous samples
          </Button>
          <span>
            {state.visible.length
              ? `${page * 25 + 1}–${Math.min((page + 1) * 25, state.visible.length)} of ${state.visible.length}`
              : "0 samples"}
          </span>
          <Button
            disabled={(page + 1) * 25 >= state.visible.length}
            onClick={() => setMeasurementPage(page + 1)}
          >
            Next samples
          </Button>
        </div>
      </Details>
      <Details title="Source & status definitions">
        <p>
          <b>Source:</b> {source.name}. <b>Evidence:</b> {source.evidence}.
          SHA-256:{" "}
          <code>{source.sha256 || "Not available for built-in demo"}</code>.
        </p>
        <p>
          Normal means no configured rule triggered. Warning means a recorded
          trend or sample-age flag. Needs review means invalid source data;
          derived growth values are withheld. Missing channels remain No data.
          Source fingerprints identify files and do not verify biological
          validity.
        </p>
      </Details>
    </div>
  )
}
