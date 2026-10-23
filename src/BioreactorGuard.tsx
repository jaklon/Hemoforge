import { useMemo, useRef, useState, type ReactNode } from "react"

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

import InteractivePlot from "./InteractivePlot"

import { ChannelPanel, MvpCharts } from "./AnalysisPanels"

import { csv, downloadFile } from "./workspace-utils"

import {
  summarizeGuardBatch,
  guardSeries,
  guardEventInfo,
  intervalRate,
  doublingHours,
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

  selectedEventId,

  onSelectEvent,
}: {
  batches: BatchView[]

  selected: BatchView

  hour: number

  endHour: number

  selectedEventId?: string

  onSelectEvent: (id: string) => void
}) {
  const { guardView: view, setGuardView: setView } = useWorkspace()

  const { monitoring } = useCultureData()

  const start = 0

  const end = Math.max(start + 1, endHour)

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

  const unit = view.scale === "count" ? " ×10⁶ cells" : "× fold change"

  const hoverPoints = series.flatMap((batch) =>
    batch.segments.flatMap((segment) =>
      segment.map((sample, index) => {
        const previous = segment[index - 1]

        const rate = previous ? intervalRate(previous, sample) : null

        const doubling = doublingHours(rate)

        const warnings = batch.summary.events.filter(
          (item) => item.hour === sample.hour,
        )

        return {
          x: sample.hour,

          y: sample.value,

          lines: [
            `${batch.id} · ${number(sample.hour)}h`,

            `${number(sample.value)}${unit}`,

            ...(previous
              ? [
                  `${sample.value >= previous.value ? "+" : ""}${number(
                    ((sample.value - previous.value) / previous.value) * 100,

                    1,
                  )}% vs ${number(previous.hour)}h`,
                ]
              : []),

            ...(rate !== null
              ? [
                  `μ ${number(rate, 4)}/h · ${
                    doubling === null
                      ? "not doubling"
                      : `doubles in ${number(doubling, 1)}h`
                  }`,
                ]
              : []),

            ...warnings.map(
              (item) => `⚠ ${guardEventInfo(item, monitoring).title}`,
            ),
          ],
        }
      }),
    ),
  )

  const markers = selected.summary.events.filter(
    (item) => item.hour >= start && item.hour <= end,
  )

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
      <InteractivePlot
        controls={
          <>
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
          </>
        }
        title={`Observed growth for ${selected.id}`}
        xExtent={[start, end]}
        values={allPoints.map((point) => point.value)}
        points={hoverPoints}
        yLabel={
          view.scale === "count"
            ? "Cell count · ×10⁶ cells"
            : "Fold change · first valid sample = 1×"
        }
      >
        {({ x, y, top, bottom }) => (
          <>
            {hour < end && (
              <rect
                x={x(hour)}
                y={top}
                width={Math.max(0, x(end) - x(hour))}
                height={bottom - top}
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
                      batch.index === selected.index ? undefined : "3 4"
                    }
                  />
                ))}
                {batch.segments.flat().map((sample) => (
                  <circle
                    key={sample.hour}
                    cx={x(sample.hour)}
                    cy={y(sample.value)}
                    r={batch.index === selected.index ? 3.8 : 2.5}
                  />
                ))}
              </g>
            ))}
            {markers.map((item) => (
              <g
                key={item.id}
                className={`guard-warning-marker${
                  item.id === selectedEventId ? " is-selected" : ""
                }`}
                data-plot-action
                role="button"
                tabIndex={0}
                aria-label={`${guardEventInfo(item, monitoring).title} at ${number(item.hour)}h`}
                onClick={() => onSelectEvent(item.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return

                  event.preventDefault()

                  event.stopPropagation()

                  onSelectEvent(item.id)
                }}
              >
              <line
                  x1={x(item.hour)}
                  x2={x(item.hour)}
                y1={top}
                y2={bottom}
              />
                <path d={`M${x(item.hour)} ${top + 2} l-7 12 h14 z`} />
                <text x={x(item.hour)} y={top + 12.5} textAnchor="middle">
                  !
                </text>
              </g>
            ))}
            <line
              x1={x(Math.min(hour, end))}
              x2={x(Math.min(hour, end))}
              y1={top}
              y2={bottom}
              className="replay-line"
            />
            {!allPoints.length && (
              <text
                x={x((start + end) / 2)}
                y={(top + bottom) / 2}
                textAnchor="middle"
              >
                No valid samples in this window
              </text>
            )}
          </>
        )}
      </InteractivePlot>
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
  live = false,
}: {
  hour: number

  replicate: number

  setReplicate: (index: number) => void

  navigate: (view: "data" | "pilot" | "report") => void

  eventNotes: Record<string, string>

  setEventNotes: (notes: Record<string, string>) => void

  replayControls: ReactNode
  live?: boolean
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

  const pool = view.attentionOnly ? attention : batchViews

  const slotted = view.slotIds.flatMap((id) =>
    pool.filter((batch) => batch.id === id),
  )

  // ponytail: fixed 3 cards; the chart still compares every batch.
  const shown = [
    ...slotted,
    ...pool.filter((batch) => !slotted.includes(batch)),
  ].slice(0, 3)

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

  // Hash routing owns location.hash, so section links scroll instead of using anchors.
  function jump(id: string) {
    const target = document.getElementById(id)

    const details = target?.querySelector("details")

    if (details) details.open = true

    target?.scrollIntoView({ block: "start", behavior: "instant" })

    const focusTarget = target?.querySelector<HTMLElement>("summary, h2")

    if (focusTarget && !focusTarget.matches("summary"))
      focusTarget.tabIndex = -1

    focusTarget?.focus({ preventScroll: true })
  }

  function place(slot: number, id: string) {
    const ids = shown.map((batch) => batch.id)

    const existing = ids.indexOf(id)

    if (existing >= 0) ids[existing] = ids[slot]

    ids[slot] = id

    setView((old) => ({ ...old, slotIds: ids }))

    if (shown[slot]?.index === selected.index)
      choose(batchViews.find((batch) => batch.id === id)!.index, false)
  }

  function choose(index: number, reveal = true) {
    const batch = batchViews.find((item) => item.index === index)

    // A batch picked elsewhere (e.g. Review) takes the last card if it is hidden.
    if (reveal && batch && !shown.includes(batch))
      setView((old) => ({
        ...old,

        slotIds: [...shown.slice(0, 2).map((item) => item.id), batch.id],
      }))

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
            <Button onClick={() => jump("guard-settings")}>
              Monitoring rules
            </Button>
          </div>
        }
      />
      <div
        className={`workspace-overview${attention.length ? " has-attention" : ""}`}
      >
        <div className="workspace-overview-message">
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
                  ? "No measurements yet"
                  : `All batches look normal at ${number(hour)}h`}
            </h2>
            <p>
              {urgent
                ? `Start with ${urgent.id}. It has the most urgent warning.`
                : live
                  ? "Monitoring released FLEX2 samples. The 3D window controls time and sampling."
                : hour < replayEndHour
                  ? "Press Play or Next to step through the culture samples."
                  : "Every sample so far is within your monitoring rules."}
            </p>
          </div>
        </div>
        <dl className="workspace-overview-stats">
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
            <dt>Missing a count</dt>
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
      <div className="section-heading guard-batch-heading" id="guard-batches">
        <div>
          <h2>Batch overview</h2>
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
        {shown.map((batch, slot) => (
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
              {pool.length > 3 ? (
                <select
                  aria-label={`Batch shown in card ${slot + 1}`}
                  value={batch.id}
                  onChange={(event) => place(slot, event.target.value)}
                >
                  {pool.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{batch.id}</strong>
              )}
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
                  ? "Needs 2 samples to compare"
                  : `${
                      batch.summary.percentChange > 0 ? "+" : ""
                    }${number(batch.summary.percentChange, 1)}% since last sample`}
              </span>
              <span>
                {batch.summary.latest
                  ? `Sampled ${number(batch.summary.sampleAge)}h ago`
                  : "No valid count"}
              </span>
            </div>
            <footer>
              <span>
                Last sample{" "}
                <b>
                  {batch.summary.latest
                    ? `${number(batch.summary.latest.hour)}h`
                    : "—"}
                </b>
              </span>
              <span>
                {batch.summary.visible.length} of {batch.total} samples shown
              </span>
            </footer>
          </label>
        ))}
      </fieldset>
      {!shown.length && (
        <div className="guard-filter-empty">
          <Icon name="check" />
          <span>No batches have warnings at {number(hour)}h.</span>
          <Button onClick={() => setView({ ...view, attentionOnly: false })}>
            Show all batches
          </Button>
        </div>
      )}
      <section className="guard-graphs" id="guard-growth">
        <div className="section-heading">
          <div>
            <h2>Culture graphs</h2>
          </div>
        </div>
        <Panel
          title={`${selected.id} · growth & MVP variables`}
          caption={`${state.trend} · original sample times`}
          className="guard-growth-panel"
          action={
            <div className="header-actions">
              <a className="method-link" href="#methods/monitoring" target={live ? "_blank" : undefined} rel={live ? "noopener" : undefined}>
                Growth &amp; warning formulas
              </a>
              <Status status={state.status} />
            </div>
          }
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
              <span>Growth rate μ (last interval)</span>
              <strong
                className={
                  state.growthRate !== null && state.growthRate < 0
                    ? "is-declining"
                    : ""
                }
              >
                {number(state.growthRate, 4)}
                <small>{state.growthRate === null ? "" : " /h"}</small>
              </strong>
            </div>
            <div>
              <span>Doubling time</span>
              <strong>
                {number(doublingHours(state.growthRate), 1)}
                <small>
                  {doublingHours(state.growthRate) !== null
                    ? " h"
                    : state.growthRate !== null
                      ? " not growing"
                      : ""}
                </small>
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
              <span>Time since last sample</span>
              <strong>
                {number(state.sampleAge)}
                <small>{state.sampleAge === null ? "" : "h"}</small>
              </strong>
            </div>
          </div>
          <div className="guard-graphs-grid">
          <div>
          <GrowthChart
            batches={batchViews}
            selected={selected}
            hour={hour}
            endHour={replayEndHour}
            selectedEventId={event?.id}
            onSelectEvent={(id) => {
              setSelectedEvent(id)

              document

                .getElementById("guard-review-heading")

                ?.focus({ preventScroll: true })
            }}
          />
          </div>
          <div className="guard-mvp">
            <h3>MVP variables</h3>
            <MvpCharts replicate={replicate} hour={hour} />
          </div>
          </div>
        </Panel>
      </section>
      <div className="guard-main-grid">
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
                {!state.latest && (
                  <p>Advance to a source sample or import measurements.</p>
                )}
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
                      setEventNotes({
                        ...eventNotes,
                        [noteKey]: e.target.value,
                      })
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
        </section>
        <Panel
          title="Continue in ErythroPilot"
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
                `Advance replay to ${reportInterval}h for the first report.`}
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
      <div className="guard-secondary-grid" id="guard-environment">
        <ChannelPanel
          replicate={replicate}
          hour={hour}
          onImport={() => navigate("data")}
        />
      </div>
      <div ref={settingsRef} id="guard-settings">
        <MonitoringControls />
      </div>
      <div id="guard-raw">
      <Details title={`Raw measurements · ${selected.id}`}>
        <div className="guard-table-actions">
          <p>
              {state.visible.length} source rows through {number(hour)}h.
              Missing or invalid values remain visible.
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
            <Button
              disabled={!page}
              onClick={() => setMeasurementPage(page - 1)}
            >
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
      </div>
      <Details title="What the statuses mean">
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
