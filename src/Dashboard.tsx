import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Badge, Button, NumberField, PageTitle, Panel, Status } from "./workspace-ui"
import InteractivePlot from "./InteractivePlot"
import { useCultureData } from "./workspace-context"
import { replayEndHour } from "./culture-monitoring"
import { boundRange, niceTicks, panRange, zoomRange, type Range } from "./plot-navigation"
import {
  exchangeAction,
  hoursToAction,
  level,
  limitProblem,
  processVariables,
  simulate,
  type Level,
  type Limits,
  type ProcessVariable,
  type Sample,
} from "./dashboard-sim"

// v2: exchange triggers store doseHigh as exchanged volume %, not a concentration.
const storageKey = "dashboard-limits-v2"

const defaults = () =>
  Object.fromEntries(processVariables.map((variable) => [variable.id, variable.limits]))

function loadLimits(): Record<string, Limits> {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") }
  } catch {
    return defaults()
  }
}

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

// Card chart: warning lines dashed, action lines solid, automated corrections as
// vertical markers with a triangle. Drag pans and Ctrl+wheel (or pinch) zooms the
// time range shared by every card.
function MiniChart({
  samples,
  actions,
  settings,
  hour,
  range,
  onRange,
  dots = false,
}: {
  samples: Sample[]
  actions: { hour: number; label: string }[]
  settings?: Limits
  hour: number
  dots?: boolean
  range: Range
  onRange: (next: Range) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; range: Range; moved: boolean } | null>(null)
  const width = 300,
    height = 120,
    pad = 6
  const lines = settings ? limitLines(settings) : []
  const inView = samples.filter(
    (sample) => sample.hour <= hour && sample.hour >= range[0] - 1 && sample.hour <= range[1] + 1,
  )
  // Scale to what is on screen, so zooming into a stretch shows its detail.
  const values = [...inView.map((sample) => sample.value), ...lines.map((line) => line.value)]
  const min = Math.min(...values),
    max = Math.max(...values)
  const span = max - min || 1
  const x = (h: number) => ((h - range[0]) / (range[1] - range[0])) * width
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)
  const last = inView.at(-1)

  // React wheel listeners are passive, so preventDefault needs a native one.
  const latest = useRef({ range, onRange })
  latest.current = { range, onRange }
  useEffect(() => {
    const element = svg.current!
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const anchor = (event.clientX - rect.left) / rect.width
      latest.current.onRange(zoomTo(latest.current.range, event.deltaY > 0 ? 1.25 : 0.8, anchor))
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [])

  return (
    <span className="dash-mini-wrap">
      <svg
        ref={svg}
        className="dash-mini"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, range, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          const dx = event.clientX - drag.current.x
          if (Math.abs(dx) > 3) drag.current.moved = true
          if (drag.current.moved)
            onRange(panRange(drag.current.range, extent, -dx / event.currentTarget.getBoundingClientRect().width))
        }}
        onPointerUp={() => {
          // Keep the flag until the click that follows, then clear it.
          setTimeout(() => (drag.current = null))
        }}
        onClickCapture={(event) => {
          // A drag ends in a click; do not let it reselect the card.
          if (drag.current?.moved) event.stopPropagation()
        }}
      >
        {x(hour) < width && (
          <rect x={Math.max(0, x(hour))} y={0} width={width - Math.max(0, x(hour))} height={height} className="dash-future" />
        )}
        {lines.map((line, i) => (
          <line key={i} x1={0} x2={width} y1={y(line.value)} y2={y(line.value)} className={`dash-limit is-${line.kind}`} />
        ))}
        {actions
          .filter((action) => action.hour <= hour && action.hour >= range[0] && action.hour <= range[1])
          .map((action) => (
            <g key={`${action.hour}-${action.label}`} className="dash-marker">
              <line x1={x(action.hour)} x2={x(action.hour)} y1={7} y2={height} />
              <path d={`M${x(action.hour)} 0l4 7h-8z`} />
            </g>
          ))}
        <polyline
          points={inView.map((sample) => `${x(sample.hour)},${y(sample.value)}`).join(" ")}
          className="dash-line"
        />
        {/* Zero-length round-capped strokes stay circular in the stretched viewBox. */}
        {dots
          ? inView.map((sample) => (
              <line key={sample.hour} x1={x(sample.hour)} x2={x(sample.hour)} y1={y(sample.value)} y2={y(sample.value)} className="dash-point" />
            ))
          : last?.hour === hour && (
              <line x1={x(last.hour)} x2={x(last.hour)} y1={y(last.value)} y2={y(last.value)} className="dash-point" />
            )}
      </svg>
      <span className="dash-ticks" aria-hidden="true">
        {niceTicks(range, 6)
          .filter((tick) => Number.isInteger(tick))
          .map((tick) => (
            <span key={tick} style={{ left: `${((tick - range[0]) / (range[1] - range[0])) * 100}%` }}>
              {tick}h
            </span>
          ))}
      </span>
    </span>
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
      localStorage.setItem(storageKey, JSON.stringify(limits))
    } catch {
      // Storage blocked: limits still apply for this visit.
    }
  }, [limits])

  // Invalid entries (NaN while typing) fall back to that variable's defaults.
  const runs = useMemo(() => {
    const safe = Object.fromEntries(
      processVariables.map((variable) => {
        const settings = limits[variable.id]
        const valid = Object.values(settings).every(
          (value) => value === null || typeof value === "boolean" || Number.isFinite(value),
        )
        return [variable.id, valid ? settings : variable.limits]
      }),
    )
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
        <span className="dash-hint">Drag a chart to pan · Ctrl+scroll to zoom</span>
      </div>

      <div className="dash-grid">
        <button
          type="button"
          className={`dash-card is-${countLevel}`}
          aria-pressed={selectedId === countId}
          onClick={() => setSelectedId(countId)}
        >
          <span className="dash-card-head">
            <span className="dash-name" title={levelLabel[countLevel]}>
              Cell count
              <span className="sr-only"> · {levelLabel[countLevel]}</span>
            </span>
            <span className="dash-value">
              {countState.latest ? countState.latest.count!.toFixed(2) : "—"}
              <small>×10⁶ cells</small>
            </span>
          </span>
          <MiniChart samples={countSamples} actions={[]} hour={hour} range={range} onRange={setPinned} dots />
          <span className="dash-card-foot">
            {countState.latest
              ? `${culture.batchId(replicate)} · sampled ${countState.latest.hour}h${
                  countState.foldChange !== null ? ` · ${countState.foldChange.toFixed(1)}× since start` : ""
                }`
              : "No count measured yet"}
          </span>
        </button>
        {runs.map((run) => (
          <button
            key={run.variable.id}
            type="button"
            className={`dash-card is-${run.level}`}
            aria-pressed={run.variable.id === selectedId}
            onClick={() => setSelectedId(run.variable.id)}
          >
            <span className="dash-card-head">
              <span className="dash-name" title={levelLabel[run.level]}>
                {run.variable.name}
                <span className="sr-only"> · {levelLabel[run.level]}</span>
              </span>
              <span className="dash-value">
                {format(run.variable, run.current.value)}
                <small>{run.variable.unit}</small>
              </span>
            </span>
            <MiniChart
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
          </button>
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
          yLabel={`${selected.variable.name} · ${selected.variable.unit}`}
          points={[
            ...selected.visible.map((sample) => ({
              x: sample.hour,
              y: sample.value,
              lines: [`${sample.hour}h`, `${format(selected.variable, sample.value)} ${selected.variable.unit}`],
            })),
            ...selected.done.map((action) => ({
              x: action.hour,
              y: action.after,
              lines: [
                `${action.hour}h · ${action.linkedFrom ? `${action.label} (from ${nameOf(action.linkedFrom)})` : action.label}`,
                `${format(selected.variable, action.before)} → ${format(selected.variable, action.after)} ${selected.variable.unit}`,
              ],
            })),
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
              yLabel="Cell count · ×10⁶ cells"
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
