import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Badge, Button, NumberField, PageTitle, Panel, Status } from "./workspace-ui"
import InteractivePlot from "./InteractivePlot"
import { useCultureData } from "./workspace-context"
import { replayEndHour } from "./culture-monitoring"
import { boundRange, panRange, zoomRange, type Range } from "./plot-navigation"
import {
  exchangeAction,
  hoursToAction,
  level,
  limitProblem,
  processVariables,
  simulate,
  limitsKey,
  loadLimits,
  safeLimits,
  type Level,
  type Limits,
  type ProcessVariable,
  type Sample,
} from "./dashboard-sim"

const levelLabel: Record<Level, string> = {
  normal: "In range",
  warning: "Warning",
  action: "Action limit",
}

const nameOf = (id: string) =>
  processVariables.find((variable) => variable.id === id)!.name

const linkedNames = (except: string) =>
  processVariables
    .filter((variable) => variable.fresh !== undefined && variable.id !== except)
    .map((variable) => variable.name)
    .join(", ")

const format = (variable: ProcessVariable, value: number) =>
  value.toFixed(variable.digits)

function limitLines(settings: Limits) {
  return [
    { value: settings.warnLow, kind: "warn" },
    { value: settings.warnHigh, kind: "warn" },
    { value: settings.actLow, kind: "act" },
    { value: settings.actHigh, kind: "act" },
  ].filter((line): line is { value: number; kind: string } => line.value !== null)
}

const extent: Range = [0, replayEndHour]

type Action = { hour: number; label: string; before: number; after: number; linkedFrom?: string }

const limitNote: Record<Level, string | null> = {
  normal: null,
  warning: "⚠ Past warning limit",
  action: "⚠ Past action limit",
}

// Hover text for one sample, flagging warning and action limit breaches.
function sampleTip(title: string, unit: string, digits: number, sample: Sample, settings?: Limits) {
  const note = settings ? limitNote[level(sample.value, settings)] : null
  return {
    x: sample.hour,
    y: sample.value,
    lines: [`${title} · ${sample.hour}h`, `${sample.value.toFixed(digits)} ${unit}`, ...(note ? [note] : [])],
  }
}

// Hover text for an automated correction marker: what was done and its effect.
function actionTip(action: Action, unit: string, digits: number) {
  return {
    x: action.hour,
    y: 0,
    marker: true,
    lines: [
      `${action.hour}h · ${action.label}`,
      ...(action.linkedFrom ? [`Triggered by ${nameOf(action.linkedFrom)}`] : []),
      `${action.before.toFixed(digits)} → ${action.after.toFixed(digits)} ${unit}`,
    ],
  }
}
// Narrowest zoom, so a few samples always stay on screen.
const minSpan = 6

// Live view: the trailing window ending at the replay hour, like a dashboard's "last N hours".
function liveRange(hour: number, span: number): Range {
  return boundRange([hour - span, hour], extent)
}

function zoomTo(range: Range, factor: number, anchor = 0.5): Range {
  if (factor < 1 && range[1] - range[0] <= minSpan) return range
  return zoomRange(range, extent, factor, anchor)
}

// Card chart: same hover, zoom and pan as Bioreactor Guard's charts, over the shared time
// window. Warning lines dashed, action lines solid, automated corrections as markers.
function MiniChart({
  title,
  unit,
  digits,
  samples,
  actions,
  settings,
  hour,
  range,
  onRange,
  dots = false,
}: {
  title: string
  unit: string
  digits: number
  samples: Sample[]
  actions: Action[]
  settings?: Limits
  hour: number
  dots?: boolean
  range: Range
  // Shared time window; without it the chart zooms and pans on its own.
  onRange?: (next: Range | null) => void
}) {
  const lines = settings ? limitLines(settings) : []
  const seen = samples.filter((sample) => sample.hour <= hour)
  // Keep the nearest sample beyond each edge so the line runs off the chart instead of
  // stopping short; sparse series (daily counts) often have none inside a short window.
  const first = Math.max(0, seen.findIndex((sample) => sample.hour >= range[0]) - 1)
  const after = seen.findIndex((sample) => sample.hour > range[1])
  const inView = seen.slice(first, after === -1 ? undefined : after + 1)
  // Dense series scale to what is on screen, so zooming shows detail. Sparse ones scale to
  // all samples so far: two points stretched to full height would fake a spike or crash.
  const values = [...(dots ? seen : inView).map((sample) => sample.value), ...lines.map((line) => line.value)]
  const shown = actions.filter((action) => action.hour <= hour)
  return (
    <InteractivePlot
      compact
      height={160}
      title={`${title} chart`}
      xExtent={onRange ? extent : range}
      xView={range}
      onXView={onRange}
      values={values}
      fromZero={false}
      yLabel={unit}
      points={[
        ...inView.map((sample) => sampleTip(title, unit, digits, sample, settings)),
        ...shown.map((action) => actionTip(action, unit, digits)),
      ]}
    >
      {({ x, y, top, bottom, left, right }) => (
        <>
          {hour < range[1] && (
            <rect x={Math.max(left, x(hour))} y={top} width={Math.max(0, right - Math.max(left, x(hour)))} height={bottom - top} className="dash-future" />
          )}
          {lines.map((line, i) => (
            <line key={i} x1={left} x2={right} y1={y(line.value)} y2={y(line.value)} className={`dash-limit is-${line.kind}`} />
          ))}
          {shown.map((action) => (
            <g key={`${action.hour}-${action.label}`} className="dash-marker">
              <line x1={x(action.hour)} x2={x(action.hour)} y1={top + 7} y2={bottom} />
              <path d={`M${x(action.hour)} ${top}l4 7h-8z`} />
            </g>
          ))}
          <polyline points={inView.map((sample) => `${x(sample.hour)},${y(sample.value)}`).join(" ")} className="dash-line" />
          {(dots ? inView : inView.filter((sample) => sample.hour === hour)).map((sample) => (
            <circle key={sample.hour} cx={x(sample.hour)} cy={y(sample.value)} r="3" className="dash-dot" />
          ))}
        </>
      )}
    </InteractivePlot>
  )
}

function LimitEditor({
  variable,
  settings,
  onChange,
}: {
  variable: ProcessVariable
  settings: Limits
  onChange: (next: Limits) => void
}) {
  const problem = limitProblem(settings)
  const exchange = variable.highAction === exchangeAction
  const field = (label: string, key: keyof Limits) => (
    <NumberField
      label={label}
      value={settings[key] as number | null}
      optional={key !== "doseLow" && key !== "doseHigh"}
      min={key === "doseLow" || key === "doseHigh" ? 0 : undefined}
      max={key === "doseHigh" && exchange ? 100 : undefined}
      onChange={(value) => onChange({ ...settings, [key]: value })}
    />
  )
  const row = (side: string, action: string, keys: (keyof Limits)[], sizeLabel: string) => (
    <div className="dash-limit-row">
      <p>
        <strong>{side}</strong> · {action}
      </p>
      {field(`Warn (${variable.unit})`, keys[0])}
      {field(`Action (${variable.unit})`, keys[1])}
      {field(sizeLabel, keys[2])}
    </div>
  )
  return (
    <div className="dash-editor">
      {variable.lowAction && row("Low", variable.lowAction, ["warnLow", "actLow", "doseLow"], `Boost (${variable.unit})`)}
      {variable.highAction &&
        row(
          "High",
          exchange ? `${exchangeAction}, also moves ${linkedNames(variable.id)}` : variable.highAction,
          ["warnHigh", "actHigh", "doseHigh"],
          exchange ? "Exchange (%)" : `Size (${variable.unit})`,
        )}
      <div className="dash-editor-footer">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={settings.auto}
            onChange={(event) => onChange({ ...settings, auto: event.target.checked })}
          />
          Automatic correction
        </label>
        <button type="button" className="text-button" onClick={() => onChange(variable.limits)}>
          Reset to defaults
        </button>
      </div>
      {problem && (
        <p className="dash-problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}

// Cell count is measured, not simulated: it comes from the loaded batch data and uses
// Bioreactor Guard's growth rules, so its card has no limits of its own.
const countId = "cell-count"

export default function Dashboard({
  hour,
  replicate,
  replayControls,
}: {
  hour: number
  replicate: number
  replayControls: ReactNode
}) {
  const culture = useCultureData()
  const countState = culture.analyze(culture.batchMeasurements(replicate), hour)
  const countSamples = countState.valid.map((sample) => ({ hour: sample.hour, value: sample.count! }))
  const countLevel: Level = countState.status === "warning" || countState.status === "needs_review" ? "warning" : "normal"
  const [limits, setLimits] = useState(loadLimits)
  const [selectedId, setSelectedId] = useState(processVariables[0].id)
  // null = live: follow the replay hour with a trailing window of `windowHours`.
  const [pinned, setPinned] = useState<Range | null>(null)
  const [windowHours, setWindowHours] = useState(48)
  const range = pinned ?? liveRange(hour, windowHours)

  useEffect(() => {
    try {
      localStorage.setItem(limitsKey, JSON.stringify(limits))
    } catch {
      // Storage blocked: limits still apply for this visit.
    }
  }, [limits])

  const runs = useMemo(() => {
    const safe = safeLimits(limits)
    const results = simulate(safe, replayEndHour)
    return processVariables.map((variable) => {
      const run = results[variable.id]
      const visible = run.samples.filter((sample) => sample.hour <= hour)
      const current = visible.at(-1)!
      return {
        variable,
        settings: safe[variable.id],
        ...run,
        visible,
        current,
        level: level(current.value, safe[variable.id]),
        eta: safe[variable.id].auto ? null : hoursToAction(visible, safe[variable.id]),
        done: run.actions.filter((action) => action.hour <= hour),
      }
    })
  }, [limits, hour])

  const selected = runs.find((run) => run.variable.id === selectedId)
  const log = runs
    .flatMap((run) => run.done.map((action) => ({ ...action, variable: run.variable })))
    .sort((a, b) => b.hour - a.hour || Number(!!a.linkedFrom) - Number(!!b.linkedFrom))
  const describe = (action: (typeof log)[number]) =>
    action.linkedFrom ? `${action.label} (triggered by ${nameOf(action.linkedFrom)})` : action.label
  const count = (value: Level) =>
    runs.filter((run) => run.level === value).length + (countLevel === value ? 1 : 0)

  return (
    <>
      <PageTitle
        title="Dashboard"
        description="Live process variables with warning limits, action limits, and automated corrections."
        action={<Badge tone="warning">Process variables simulated · cell count from batch data</Badge>}
      />
      {replayControls}
      <div className="dash-summary">
        <span>
          <strong>
            {count("normal")}/{runs.length + 1}
          </strong>{" "}
          in range
        </span>
        <span className="is-warning">
          <strong>{count("warning")}</strong> warning
        </span>
        <span className="is-action">
          <strong>{count("action")}</strong> at action limit
        </span>
        <span>
          <strong>{log.filter((action) => !action.linkedFrom).length}</strong> automated actions
        </span>
        <span className="dash-legend">
          <i className="is-warn" /> warning <i className="is-act" /> action <i className="is-marker" /> correction
        </span>
      </div>
      <div className="dash-timebar">
        <fieldset className="guard-segmented">
          <legend className="sr-only">Time window</legend>
          {[12, 24, 48, replayEndHour].map((span) => (
            <button
              key={span}
              type="button"
              aria-pressed={!pinned && windowHours === span}
              onClick={() => {
                setWindowHours(span)
                setPinned(null)
              }}
            >
              {span === replayEndHour ? "All" : `Last ${span}h`}
            </button>
          ))}
        </fieldset>
        <span className="plot-buttons">
          <Button aria-label="Pan earlier" onClick={() => setPinned(panRange(range, extent, -0.25))}>
            ‹
          </Button>
          <Button aria-label="Pan later" onClick={() => setPinned(panRange(range, extent, 0.25))}>
            ›
          </Button>
          <Button aria-label="Zoom in" onClick={() => setPinned(zoomTo(range, 0.8))}>
            +
          </Button>
          <Button aria-label="Zoom out" onClick={() => setPinned(zoomTo(range, 1.25))}>
            −
          </Button>
          <Button icon="home" onClick={() => setPinned(null)} disabled={!pinned}>
            Live
          </Button>
        </span>
        <span className="dash-range">
          {Math.round(range[0])}h – {Math.round(range[1])}h{pinned ? " · paused view" : " · following replay"}
        </span>
        <span className="dash-hint">Hover a chart for values · scroll to zoom · drag to pan</span>
      </div>

      <div className="dash-grid">
        <div
          className={`dash-card is-${countLevel}${selectedId === countId ? " is-selected" : ""}`}
          onClick={() => setSelectedId(countId)}
        >
          <button type="button" className="dash-card-head" aria-pressed={selectedId === countId}>
            <span className="dash-name" title={levelLabel[countLevel]}>
              Cell count
              <span className="sr-only"> · {levelLabel[countLevel]}</span>
            </span>
            <span className="dash-value">
              {countState.latest ? countState.latest.count!.toFixed(2) : "—"}
              <small>×10⁶ cells</small>
            </span>
          </button>
          {/* Fixed full run (0h to end of data), independent of the shared window. With a live
              stream the right edge would grow with the newest sample. */}
          <MiniChart title="Cell count" unit="×10⁶ cells" digits={2} samples={countSamples} actions={[]} hour={hour} range={extent} dots />
          <span className="dash-card-foot">
            {countState.latest
              ? `${culture.batchId(replicate)} · sampled ${countState.latest.hour}h${
                  countState.foldChange !== null ? ` · ${countState.foldChange.toFixed(1)}× since start` : ""
                }`
              : "No count measured yet"}
          </span>
        </div>
        {runs.map((run) => (
          <div
            key={run.variable.id}
            className={`dash-card is-${run.level}${run.variable.id === selectedId ? " is-selected" : ""}`}
            onClick={() => setSelectedId(run.variable.id)}
          >
            <button type="button" className="dash-card-head" aria-pressed={run.variable.id === selectedId}>
              <span className="dash-name" title={levelLabel[run.level]}>
                {run.variable.name}
                <span className="sr-only"> · {levelLabel[run.level]}</span>
              </span>
              <span className="dash-value">
                {format(run.variable, run.current.value)}
                <small>{run.variable.unit}</small>
              </span>
            </button>
            <MiniChart
              title={run.variable.name}
              unit={run.variable.unit}
              digits={run.variable.digits}
              samples={run.samples}
              actions={run.actions}
              settings={run.settings}
              hour={hour}
              range={range}
              onRange={setPinned}
            />
            <span className="dash-card-foot">
              {!run.settings.auto
                ? run.eta !== null
                  ? `Manual · action limit in ~${Math.round(run.eta)}h`
                  : "Manual · no limit approaching"
                : run.done.length
                  ? `${run.done.length} automated ${run.done.length === 1 ? "action" : "actions"} · last ${run.done.at(-1)!.hour}h`
                  : "Auto control armed"}
            </span>
          </div>
        ))}
      </div>

      {selected ? (
      <Panel
        title={selected.variable.name}
        className="dash-detail"
      >
        <div className="dash-detail-body">
        <InteractivePlot
          title={`${selected.variable.name} chart`}
          xExtent={[0, replayEndHour]}
          fromZero={false}
          values={[
            ...selected.visible.map((sample) => sample.value),
            ...limitLines(selected.settings).map((line) => line.value),
          ]}
          yLabel={`${selected.variable.name}${selected.variable.unit ? ` (${selected.variable.unit})` : ""}`}
          points={[
            ...selected.visible.map((sample) =>
              sampleTip(selected.variable.name, selected.variable.unit, selected.variable.digits, sample, selected.settings),
            ),
            ...selected.done.map((action) => actionTip(action, selected.variable.unit, selected.variable.digits)),
          ]}
        >
          {({ x, y, top, bottom, left, right }) => (
            <>
              {limitLines(selected.settings).map((line, i) => (
                <line key={i} x1={left} x2={right} y1={y(line.value)} y2={y(line.value)} className={`dash-limit is-${line.kind}`} />
              ))}
              {selected.done.map((action) => (
                <g key={`${action.hour}-${action.label}`} className="dash-marker">
                  <line x1={x(action.hour)} x2={x(action.hour)} y1={top + 10} y2={bottom} />
                  <path d={`M${x(action.hour)} ${top}l6 10h-12z`} />
                </g>
              ))}
              <polyline
                points={selected.visible.map((sample) => `${x(sample.hour)},${y(sample.value)}`).join(" ")}
                className="dash-line"
              />
            </>
          )}
        </InteractivePlot>
        <LimitEditor
          variable={selected.variable}
          settings={limits[selected.variable.id]}
          onChange={(next) => setLimits({ ...limits, [selected.variable.id]: next })}
        />
        </div>
      </Panel>
      ) : (
        <Panel title="Cell count" className="dash-detail">
          <div className="dash-detail-body">
            <InteractivePlot
              title="Cell count chart"
              xExtent={[0, replayEndHour]}
              values={countSamples.map((sample) => sample.value)}
              yLabel="Cell count (×10⁶ cells)"
              points={countSamples.map((sample) => ({
                x: sample.hour,
                y: sample.value,
                lines: [`${sample.hour}h`, `${sample.value.toFixed(2)} ×10⁶ cells`],
              }))}
            >
              {({ x, y }) => (
                <>
                  <polyline
                    points={countSamples.map((sample) => `${x(sample.hour)},${y(sample.value)}`).join(" ")}
                    className="dash-line"
                  />
                  {countSamples.map((sample) => (
                    <circle key={sample.hour} cx={x(sample.hour)} cy={y(sample.value)} r="3.5" className="dash-dot" />
                  ))}
                </>
              )}
            </InteractivePlot>
            <div className="dash-editor">
              <p className="dash-count-status">
                <Status status={countState.status} /> {culture.batchId(replicate)}
              </p>
              {countState.events.map((event) => (
                <p key={event.id} className="dash-count-event">
                  <strong>{event.hour}h</strong> · {event.reason}
                </p>
              ))}
              <p className="dash-count-note">
                Measured counts from the loaded batch data. Decline and stale-sample rules are set in{" "}
                <a href="#guard">Bioreactor Guard</a>; there is no automated correction for cell count.
              </p>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Automated action log" className="dash-log">
        {log.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Variable</th>
                  <th>Action</th>
                  <th className="numeric">Before</th>
                  <th className="numeric">After</th>
                </tr>
              </thead>
              <tbody>
                {log.map((action) => (
                  <tr key={`${action.variable.id}-${action.hour}-${action.label}`}>
                    <td>{action.hour}h</td>
                    <td>{action.variable.name}</td>
                    <td>{describe(action)}</td>
                    <td className="numeric">{format(action.variable, action.before)}</td>
                    <td className="numeric">
                      {format(action.variable, action.after)} {action.variable.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel-note">No automated actions yet. Advance the replay to see corrections.</p>
        )}
      </Panel>
    </>
  )
}
