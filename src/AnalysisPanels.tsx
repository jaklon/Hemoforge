import { useEffect, useRef, useState } from "react"

import ForecastChart from "./ForecastChart"

import InteractivePlot from "./InteractivePlot"

import pilotContextSprite from "./assets/pilot-context.svg"

import { plotNumber } from "./plot-navigation"

import { useCultureData, useWorkspace } from "./workspace-context"

import {
  channels,
  filterMarkers,
  type CultureRow,
  type ExperimentRow,
  type MarkerRow,
} from "./workspace-data"

import { conditionSummary, type ExperimentPlan } from "./experiment-model"

import {
  bloodGroups,
  bloodTargetError,
  cellsPerUnit,
  defaultBloodTarget,
  literatureGrowth,
  metaboliteLimits,
  metaboliteStatus,
  planBloodTarget,
  type BloodTargetPlan,
  type BloodTargetSettings,
} from "./blood-target"

import {
  Button,
  Panel,
  Badge,
  PageTitle,
  Details,
  NumberField,
} from "./workspace-ui"

import { csv, downloadFile } from "./workspace-utils"

import { growthSettingsError, planSettingsError } from "./research-settings"

export function SimulationPanel({
  replicate,

  hour,
}: {
  replicate: number

  hour: number
}) {
  const {
    simulate,

    simulation,

    growthSettings: settings,

    setGrowthSettings: setSettings,
  } = useWorkspace()

  const { batchMeasurements, batchId, source, analyze } = useCultureData()

  const { horizon, seed } = settings

  const [error, setError] = useState("")

  const [predicting, setPredicting] = useState(false)

  const samples = batchMeasurements(replicate)

  const state = analyze(samples, hour)

  const settingError = growthSettingsError(settings)

  const fitState = analyze(
    samples.filter(
      (sample) =>
        settings.lookbackHours === null ||
        sample.hour >= hour - settings.lookbackHours,
    ),

    hour,
  )

  const blocked =
    fitState.valid.length < 3 ||
    fitState.status === "needs_review" ||
    !!settingError

  const matching =
    simulation &&
    simulation.batchId === batchId(replicate) &&
    simulation.sourceHash === source.sha256 &&
    JSON.stringify(simulation.settings) === JSON.stringify(settings)
      ? simulation
      : null

  // Keep an earlier run while replay moves forward; a later run would reveal future samples.
  const current =
    matching && matching.result.fromHour <= hour ? matching : null

  const result = current?.result

  const stale = !!result && result.fromHour !== hour

  const outdated = !matching || matching.result.fromHour !== hour

  async function run() {
    if (predicting) return

    setPredicting(true)

    setError("")

    try {
      await simulate(replicate, hour, { ...settings })
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Simulation failed.",
      )
    } finally {
      setPredicting(false)
    }
  }

  const request = JSON.stringify([replicate, hour, source.sha256, settings])

  // A new cutoff, batch or setting clears the last error so the run retries.
  useEffect(() => setError(""), [request])

  // Runs automatically once the replay cursor or a setting settles.
  useEffect(() => {
    if (!outdated || blocked || predicting || error) return

    const timer = window.setTimeout(() => void run(), 250)

    return () => window.clearTimeout(timer)
  })

  const end = result?.distribution.at(-1)

  const placeholderTitle = settingError
    ? "Check your simulation settings"
    : fitState.status === "needs_review"
      ? "Review the source samples"
      : blocked
        ? "More context needed"
        : error
          ? "The chart couldn't load"
          : "Preparing your growth chart"

  const placeholderDescription = settingError
    ? "Fix the highlighted fields to prepare the growth chart."
    : fitState.status === "needs_review"
      ? "Review the flagged counts or select another batch before simulating growth."
      : blocked
        ? "Try advancing the replay with Play or Next. The chart needs at least 3 valid samples."
        : error
          ? "Review the error above, then adjust the replay or settings to try again."
          : "Using the available samples to calculate future growth paths."

  return (
    <Panel
      title="Simulate future growth"
      action={
        <div className="header-actions">
          <a className="method-link" href="#methods/growth">
            Equations &amp; references
          </a>
          <a className="method-link" href="#methods/intervals">
            Range &amp; log-axis formulas
          </a>
        </div>
      }
    >
      <div className="simulation-controls">
        <NumberField
          label="Future period (hours)"
          value={horizon}
          onChange={(value) => setSettings({ ...settings, horizon: value! })}
          min={1}
          max={720}
          step={1}
        />
        <NumberField
          label="Simulation paths"
          value={settings.paths}
          onChange={(value) => setSettings({ ...settings, paths: value! })}
          min={10}
          max={2000}
          step={1}
        />
        <NumberField
          label="Random seed"
          value={seed}
          onChange={(value) => setSettings({ ...settings, seed: value! })}
          min={0}
          max={2147483647}
          step={1}
        />
        <span className="simulation-status" role="status">
          {predicting ? "Updating…" : ""}
        </span>
      </div>
      <Details title="Growth assumptions & fitting window">
        <div className="settings-grid">
          <NumberField
            label="Lookback window (hours)"
            value={settings.lookbackHours}
            optional
            min={0.01}
            max={100000}
            hint="Blank uses all samples available at the replay cutoff."
            onChange={(value) =>
              setSettings({ ...settings, lookbackHours: value })
            }
          />
          <NumberField
            label="Log-growth rate override (per hour)"
            value={settings.drift}
            optional
            min={-1}
            max={1}
            hint="Blank fits from data. An override creates a researcher-defined scenario."
            onChange={(value) => setSettings({ ...settings, drift: value })}
          />
          <NumberField
            label="Volatility override (per √hour)"
            value={settings.volatility}
            optional
            min={0}
            max={2}
            hint="Blank fits from data; 0 produces deterministic growth."
            onChange={(value) =>
              setSettings({ ...settings, volatility: value })
            }
          />
        </div>
        <p>
          Local runs support at most 250,000 path points. Change the path count
          or period to adjust the workload.
        </p>
      </Details>
      {blocked && (
        <p className="panel-note" role="status">
          {settingError ||
            "Needs 3 valid samples in the chosen window. Review invalid counts, advance replay, or widen the lookback."}
        </p>
      )}
      {error && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}
      {!result || !end ? (
        <div
          className="simulation-empty"
          role="status"
          aria-busy={!blocked && !error}
        >
          <img
            className="simulation-sprite"
            src={pilotContextSprite}
            width="112"
            height="88"
            alt=""
            aria-hidden="true"
          />
          <h3>{placeholderTitle}</h3>
          <p>{placeholderDescription}</p>
          {blocked && !settingError && fitState.status !== "needs_review" && (
            <small>{fitState.valid.length} of 3 valid samples available</small>
          )}
        </div>
      ) : (
        <div className={predicting ? "simulation-result is-refreshing" : "simulation-result"} aria-busy={predicting}>
          <div className="guard-metrics">
            <div>
              <span>Projected median at {plotNumber(end.hour)}h</span>
              <strong>
                {end.median.toPrecision(4)}
                <small> ×10⁶ cells</small>
              </strong>
            </div>
            <div>
              <span>95% simulated range</span>
              <strong>
                {end.lower95.toPrecision(3)}–{end.upper95.toPrecision(3)}
              </strong>
            </div>
            <div>
              <span>Source samples used</span>
              <strong>{result.measurementCount}</strong>
            </div>
          </div>
          <ForecastChart
            key={current!.requestId}
            result={result}
            samples={stale ? analyze(samples, result.fromHour).valid : state.valid}
          />
          {stale && (
            <p className="panel-note" role="status">
              Showing the run from {plotNumber(result.fromHour)}h · updating to{" "}
              {plotNumber(hour)}h when replay pauses.
            </p>
          )}
        </div>
      )}
      <Details title="What this simulation assumes">
        {current && (
          <p>
            {current.engine} · {current.modelVersion} · Request{" "}
            {current.requestId}
          </p>
        )}
        <p>
          Changing input, time, or any growth setting reruns the simulation. Later
          recorded samples are excluded. Results are included in the JSON/HTML
          export.
        </p>
        <p>
          The model estimates average log growth and variability from the counts
          available in the fitting window, then draws {settings.paths} positive
          random paths. Rate and volatility overrides define a scenario instead
          of using the fitted values. It assumes those growth patterns continue.
          Feeding, contamination, interventions, and maturation are not modeled.
          Simulated intervals have no demonstrated predictive coverage. This is
          a working mathematical simulation, not a validated harvest forecast.
        </p>
      </Details>
    </Panel>
  )
}

const wholeCells = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 3,
})

function ProductionTarget({
  condition,
}: {
  condition: { lactate: number; ammonia: number } | null
}) {
  const { batchIndexes, batchId, batchMeasurements } = useCultureData()

  const [batch, setBatch] = useState(1)

  const [settings, setSettings] = useState<BloodTargetSettings>({
    ...defaultBloodTarget,
  })

  const settingError = bloodTargetError(settings)

  let plan: BloodTargetPlan | null = null

  let planError = ""

  try {
    if (!settingError) plan = planBloodTarget(settings, batchMeasurements(batch))
  } catch (failure) {
    planError = failure instanceof Error ? failure.message : "Planning failed."
  }

  const metabolites = condition
    ? metaboliteStatus(condition.lactate, condition.ammonia)
    : null

  return (
    <Panel
      title="Production target"
      caption="State how much blood you want and the planner works back to culture time, stages and safe metabolite limits."
      action={
        <a className="method-link" href="#methods/target">
          Target equations &amp; references
        </a>
      }
    >
      <div className="settings-grid target-form">
        <NumberField
          label="Target (adult units)"
          value={settings.units}
          min={0.01}
          max={1000}
          hint={`1 unit = ${wholeCells.format(cellsPerUnit)} red cells (Bayley et al. 2018).`}
          onChange={(value) => setSettings({ ...settings, units: value! })}
        />
        <label>
          Blood group (label only)
          <select
            value={settings.group}
            onChange={(event) =>
              setSettings({
                ...settings,

                group: event.target.value as BloodTargetSettings["group"],
              })
            }
          >
            {bloodGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <small>Tags the plan only; screen donor profiles in RareMatch.</small>
        </label>
        <label>
          Growth rate
          <select
            value={settings.rate}
            onChange={(event) =>
              setSettings({
                ...settings,

                rate: event.target.value as BloodTargetSettings["rate"],
              })
            }
          >
            <option value="fitted">Fitted from this batch</option>
            <option value="static">
              Published static flask · {literatureGrowth.static.perHour}/h
            </option>
            <option value="stirred">
              Published stirred tank · {literatureGrowth.stirred.perHour}/h
            </option>
          </select>
        </label>
        <label>
          Starting batch
          <select
            value={batch}
            onChange={(event) => setBatch(Number(event.target.value))}
          >
            {batchIndexes.map((index) => (
              <option key={index} value={index}>
                {batchId(index)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(settingError || planError) && (
        <p role="alert" className="import-error">
          {settingError || planError}
        </p>
      )}
      {plan && (
        <>
          <div className="guard-metrics target-metrics">
            <div>
              <span>Cells needed</span>
              <strong>{wholeCells.format(plan.targetCells)}</strong>
              <small>
                from {wholeCells.format(plan.startCells)} at {plan.startHour}h
              </small>
            </div>
            <div>
              <span>Fold expansion</span>
              <strong>{wholeCells.format(plan.fold)}×</strong>
              <small>{plan.doublings.toFixed(1)} population doublings</small>
            </div>
            <div>
              <span>Doubling time</span>
              <strong>{plan.doublingHours.toFixed(1)} h</strong>
              <small>
                {plan.rate.perHour.toPrecision(3)}/h ·{" "}
                {plan.rate.source === "fitted"
                  ? "fitted from this batch"
                  : plan.rate.source === "stirred"
                    ? literatureGrowth.stirred.label
                    : literatureGrowth.static.label}
              </small>
            </div>
            <div>
              <span>Time to target</span>
              <strong>{plan.days.toFixed(1)} days</strong>
              <small>
                {plan.hours.toFixed(0)} h in about {plan.stages} stage
                {plan.stages === 1 ? "" : "s"}
              </small>
            </div>
          </div>
          <div className="candidate-review target-plan">
            <h3>
              Plan for {plan.units} unit{plan.units === 1 ? "" : "s"} ·{" "}
              {plan.group}
            </h3>
            <ol>
              <li>
                Start from {batchId(batch)} at {plan.startHour}h with{" "}
                {wholeCells.format(plan.startCells)} cells.
              </li>
              <li>
                Expand {plan.doublings.toFixed(1)} doublings at{" "}
                {plan.doublingHours.toFixed(1)} h each:{" "}
                {plan.hours.toFixed(0)} h of growth, about{" "}
                {plan.days.toFixed(1)} days.
              </li>
              <li>
                Split and exchange medium every {plan.stageWindowHours} h, so
                about {plan.stages} stage{plan.stages === 1 ? "" : "s"}; static
                BEL-A counts decline past that window.
              </li>
              <li>
                {metabolites && condition ? (
                  <>
                    Hold lactate under{" "}
                    {metaboliteLimits.lactate.inhibitory.toFixed(0)} mg/L and
                    ammonia under{" "}
                    {metaboliteLimits.ammonia.inhibitory.toFixed(0)} mg/L. The
                    top-ranked condition ({condition.lactate} / {condition.ammonia}{" "}
                    mg/L) is{" "}
                    <Badge
                      tone={
                        metabolites.worst === "below"
                          ? "success"
                          : metabolites.worst === "inhibitory"
                            ? "warning"
                            : "warning"
                      }
                    >
                      {metabolites.worst === "below"
                        ? "below both inhibition onsets"
                        : metabolites.worst === "inhibitory"
                          ? "above an inhibition onset"
                          : "in the range reported to mediate cell death"}
                    </Badge>
                  </>
                ) : (
                  <>
                    Fit the GP below to get a ranked condition, then check it
                    against the {metaboliteLimits.lactate.inhibitory.toFixed(0)}{" "}
                    mg/L lactate and{" "}
                    {metaboliteLimits.ammonia.inhibitory.toFixed(0)} mg/L
                    ammonia inhibition onsets.
                  </>
                )}
              </li>
              <li>
                Tag the run and the donor line {plan.group}; confirm the group
                and any rare antigens in RareMatch before any lab work.
              </li>
            </ol>
          </div>
          {plan.warnings.map((warning) => (
            <p key={warning} className="panel-note">
              {warning}
            </p>
          ))}
          <p className="panel-note">
            Exponential-growth arithmetic over unverified demo data: it omits
            differentiation, enucleation, viability loss, feeding and medium
            volume, so it is a planning estimate to test, not a production or
            clinical protocol.{" "}
            <a className="method-link" href="#methods/target">
              Equations and sources
            </a>
          </p>
        </>
      )}
    </Panel>
  )
}

export function ExperimentPlanner({
  onEditData,
}: {
  onEditData: () => void
}) {
  const {
    inputs,

    run,

    refitPlan,

    planSettings: settings,

    setPlanSettings: setSettings,
  } = useWorkspace()

  const source = inputs.experiments

  const rows = source.rows as ExperimentRow[]

  const summary = conditionSummary(rows)

  const objective = settings.objective

  const settingError = planSettingsError(settings)

  const [model, setModel] =
    useState<ExperimentPlan | null>(null)

  const [error, setError] = useState("")

  const [fitting, setFitting] = useState(false)

  useEffect(() => {
    setModel(
      run?.plan && JSON.stringify(run.settings) === JSON.stringify(settings)
        ? run.plan
        : null,
    )

    setError(run?.planError ?? "")
  }, [run?.id, source, settings])

  return (
    <>
      <PageTitle
        title="CulturePlan"
        description="Compare settings and choose what to test next."
        action={
          <Badge>
            {source.evidence === "user_supplied"
              ? "Imported experiment data"
              : "Synthetic demo"}
          </Badge>
        }
      />
      <div className="context-strip">
        <a className="method-link" href="#methods/gp">
          GP equations &amp; references
        </a>
        <span>
          Source: <b>{source.name}</b> · {rows.length} runs · {summary.length}{" "}
          conditions
        </span>
        <label>
          Goal
          <select
            value={objective}
            disabled={fitting}
            onChange={(event) => {
              setSettings({
                ...settings,

                objective: event.target.value as "maximize" | "minimize",
              })

              setModel(null)
            }}
          >
            <option value="maximize">Larger response is better</option>
            <option value="minimize">Smaller response is better</option>
          </select>
        </label>
        <Button
          primary
          disabled={summary.length < 3 || fitting || !!settingError}
          onClick={async () => {
            setFitting(true)

            try {
              await refitPlan({ ...settings })

              setError("")
            } catch (failure) {
              setError(
                failure instanceof Error ? failure.message : "Fit failed.",
              )
            } finally {
              setFitting(false)
            }
          }}
        >
          {fitting ? "Running analysis…" : "Fit GP & rank conditions"}
        </Button>
      </div>
      <ProductionTarget
        condition={
          model?.candidates[0]
            ? {
                lactate: model.candidates[0].lactate,
                ammonia: model.candidates[0].ammonia,
              }
            : null
        }
      />
      {settingError && (
        <p role="alert" className="import-error">
          {settingError}
        </p>
      )}

      {error && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}
      <Panel
        title="Tested conditions"
        caption={`From the dataset: lactate and ammonia added to the medium, and the measured response (${summary[0]?.unit ?? "unit not supplied"}).`}
      >
        <div className="table-scroll compact-table">
          <table>
            <thead>
              <tr>
                <th className="numeric">Lactate mg/L</th>
                <th className="numeric">Ammonia mg/L</th>
                <th className="numeric">Response</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.id}>
                  <td className="numeric">{row.lactate}</td>
                  <td className="numeric">{row.ammonia}</td>
                  <td className="numeric">
                    {row.mean.toFixed(2)}
                    {row.sd !== null && ` ± ${row.sd.toFixed(2)}`}
                    {row.n > 1 && ` (${row.n} runs)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel
        title="Ranked conditions"
        caption={
          model
            ? `Best ${Math.min(8, model.candidates.length)} of a ${model.candidates.length}-point grid inside the tested range, already-tested conditions included · ${
                model.noise.source === "replicates"
                  ? `noise from pooled replicate SD ${model.noise.sd.toPrecision(3)} (${model.noise.dof} df)`
                  : model.noise.source === "setting"
                    ? "noise from your override"
                    : "no replicates: noise assumed"
              }`
            : "Fit the GP to rank new lactate and ammonia combinations by expected improvement."
        }
        action={
          <a className="method-link" href="#methods/improvement">
            Expected improvement equation
          </a>
        }
      >
        <Details title="Model settings">
          <div className="settings-grid">
            <NumberField
              label="Normalized length scale"
              value={settings.lengthScale}
              min={0.001}
              max={100}
              disabled={fitting}
              onChange={(value) =>
                setSettings({ ...settings, lengthScale: value! })
              }
            />
            <NumberField
              label="Noise SD override (normalized)"
              value={settings.noise}
              optional
              min={0.0001}
              max={10}
              disabled={fitting}
              hint="Blank estimates noise from the pooled replicate SD."
              onChange={(value) => setSettings({ ...settings, noise: value })}
            />
            <NumberField
              label="Exploration margin (response units)"
              value={settings.exploration}
              min={0}
              max={1000000}
              disabled={fitting}
              onChange={(value) =>
                setSettings({ ...settings, exploration: value! })
              }
            />
          </div>
          <p>
            Changing any parameter requires a new fit. Edit factor levels,
            responses, and replicates in{" "}
            <a
              href="#data"
              onClick={(event) => {
                event.preventDefault()

                onEditData()
              }}
            >
              scenario data
            </a>
            .
          </p>
        </Details>
        {model ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="numeric">Lactate mg/L</th>
                    <th className="numeric">Ammonia mg/L</th>
                    <th className="numeric">GP mean ± SD</th>
                    <th className="numeric">Expected improvement</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {model.candidates.slice(0, 8).map((row) => (
                    <tr key={`${row.lactate}-${row.ammonia}`}>
                      <td className="numeric">{plotNumber(row.lactate)}</td>
                      <td className="numeric">{plotNumber(row.ammonia)}</td>
                      <td className="numeric">
                        {row.prediction.toFixed(3)} ±{" "}
                        {row.uncertainty.toFixed(3)}
                      </td>
                      <td className="numeric">{row.ei.toPrecision(3)}</td>
                      <td>
                        <Badge tone={row.tested ? "neutral" : "success"}>
                          {row.tested ? "Tested" : "New"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {model.noise.source === "default" && (
              <p className="panel-note">
                No condition has replicates, so measurement noise is assumed.
                Repeat at least one condition to estimate it.
              </p>
            )}
          </>
        ) : (
          <p className="panel-note">
            No ranking yet. Choose a goal and run the fit above.
          </p>
        )}
      </Panel>
      {model && (
        <>
          <Panel
            title="Held-out condition check"
            action={
              <a className="method-link" href="#methods/validation">
                Validation formulas
              </a>
            }
          >
            <div className="guard-metrics">
              <div>
                <span>GP mean absolute error</span>
                <strong>{model.mae.toFixed(4)}</strong>
              </div>
              <div>
                <span>Simple mean baseline error</span>
                <strong>{model.baselineMAE.toFixed(4)}</strong>
              </div>
            </div>
            <Details title="Model method & evaluation">
              <p>{model.method}</p>
              <p>All replicates of each condition are left out together.</p>
              <p>
                Lower error is better. These are calculated from the uploaded
                outcomes. Small datasets and the chosen model settings limit
                conclusions; repeated-measurement rankings are not validated
                production recipes.
              </p>
            </Details>
          </Panel>
        </>
      )}
    </>
  )
}

export { default as MarkerScreen } from "./MarkerScreen"

const mvpKeys = [
  "lactate_mmol_l",
  "ammonia_mmol_l",
  "glucose_mmol_l",
  "glutamine_mmol_l",
  "ph",
]

// Small multiples: each variable keeps its own y-scale so pH and mmol/L stay readable.
// Axes span the whole run, so replay reveals points without rescaling the lines.
function MvpChart({
  rows,

  channelKey,

  hour,

  end,
}: {
  rows: CultureRow[]

  channelKey: string

  hour: number

  end: number
}) {
  const box = useRef<HTMLDivElement>(null)

  const [height, setHeight] = useState(150)

  useEffect(() => {
    if (!box.current) return

    const observer = new ResizeObserver(([entry]) =>
      setHeight(Math.max(130, entry.contentRect.height)),
    )

    observer.observe(box.current)

    return () => observer.disconnect()
  }, [])

  const channel = channels.find((item) => item.key === channelKey)!

  const label = channelKey === "ph" ? "pH medium" : channel.label

  const all = rows.filter((row) => row.channels[channelKey] != null)

  const values = all.filter((row) => row.hour <= hour)

  const value = (row: CultureRow) => row.channels[channelKey]!

  return (
    <figure>
      <figcaption>
        {label}
        <small>
          {values.length
            ? `${value(values.at(-1)!).toPrecision(3)} ${channel.unit}`
            : "No data"}
        </small>
      </figcaption>
      <div className="mvp-chart-box" ref={box}>
        <InteractivePlot
          compact
          height={height}
          title={`${label} through ${hour}h`}
          xExtent={[0, end]}
          // Full-run values fix the y-axis, so replay reveals points without rescaling.
          values={all.map(value)}
          fromZero={false}
          yLabel={channel.unit || "pH"}
          points={values.map((row, index) => {
            const previous = values[index - 1]

            return {
              x: row.hour,

              y: value(row),

              lines: [
                `${label} · ${plotNumber(row.hour)}h`,

                `${plotNumber(value(row))} ${channel.unit}`,

                ...(previous
                  ? [
                      `${value(row) >= value(previous) ? "+" : ""}${plotNumber(
                        value(row) - value(previous),
                      )} vs ${plotNumber(previous.hour)}h`,
                    ]
                  : []),
              ],
            }
          })}
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
              <polyline
                points={values
                  .map((row) => `${x(row.hour)},${y(value(row))}`)
                  .join(" ")}
                fill="none"
                stroke="#0d8279"
                strokeWidth="2"
              />
              {values.map((row) => (
                <circle
                  key={row.hour}
                  cx={x(row.hour)}
                  cy={y(value(row))}
                  r="3"
                  fill="#0d8279"
                />
              ))}
              {!all.length && (
                <text x={x(end / 2)} y={(top + bottom) / 2} textAnchor="middle">
                  Not measured yet
                </text>
              )}
            </>
          )}
        </InteractivePlot>
      </div>
    </figure>
  )
}

export function MvpCharts({
  rowsOverride,
  replicate,

  hour,
}: {
  rowsOverride?: CultureRow[]
  replicate: number

  hour: number
}) {
  const { batchMeasurements, replayEndHour } = useCultureData()

  const rows = rowsOverride ?? batchMeasurements(replicate)

  const end = Math.max(replayEndHour, rows.at(-1)?.hour ?? 0, 1)

  return (
    <div className="mvp-charts">
      {mvpKeys.map((key) => (
        <MvpChart key={key} rows={rows} channelKey={key} hour={hour} end={end} />
      ))}
    </div>
  )
}

export function ChannelPanel({
  rowsOverride,
  replicate,

  hour,

  onImport,
}: {
  rowsOverride?: CultureRow[]
  replicate: number

  hour: number

  onImport?: () => void
}) {
  const { batchMeasurements, batchId } = useCultureData()

  const [selected, setSelected] = useState(channels[0].key)

  const rows = (rowsOverride ?? batchMeasurements(replicate)).filter(
    (sample) => sample.hour <= hour,
  )

  const available = (key: string) =>
    rows.filter((row) => row.channels[key] != null)

  const sampledChannels = channels.filter(
    (channel) => available(channel.key).length,
  )

  const activeKey = available(selected).length
    ? selected
    : (sampledChannels[0]?.key ?? selected)

  const values = available(activeKey)

  const channel = channels.find((item) => item.key === activeKey)!

  const minimum = values.length
    ? Math.min(...values.map((row) => row.channels[activeKey]!))
    : 0

  const maximum = values.length
    ? Math.max(...values.map((row) => row.channels[activeKey]!))
    : 1

  const padding = Math.max(
    (maximum - minimum) * 0.15,

    Math.abs(maximum) * 0.03,

    0.05,
  )

  const low = minimum - padding

  const high = maximum + padding

  const x = (t: number) => 60 + (t / Math.max(hour, 1)) * 500

  const y = (v: number) => 177 - ((v - low) / (high - low)) * 130

  if (!sampledChannels.length)
    return (
      <Panel
        title="Environment & metabolites"
        caption={`${batchId(replicate)} · through ${hour}h`}
        action={<Badge>No data</Badge>}
      >
        <div className="guard-sensor-empty">
          <div className="guard-sensor-symbol">—</div>
          <h3>No environment samples at this cutoff</h3>
          <p>
            Import pH, temperature, oxygen, or metabolite values to inspect
            their trends alongside cell growth.
          </p>
          {onImport && (
            <Button icon="data" onClick={onImport}>
              Add environment data
            </Button>
          )}
        </div>
        <Details title="Available environment columns">
          <p>
            {channels.map((channel) => channel.key).join(", ")}. Values must
            come from source measurements; missing channels remain unmeasured.
          </p>
        </Details>
      </Panel>
    )

  return (
    <Panel
      title="Environment & metabolites"
      caption={`${batchId(replicate)} · original sample times only`}
      action={
        <Badge>
          {channels.some((c) => available(c.key).length)
            ? "Sampled values"
            : "No data"}
        </Badge>
      }
    >
      <div className="channel-grid">
        {sampledChannels.map((item) => {
          const sample = available(item.key).at(-1)

          return (
            <div key={item.key}>
              <span>{item.label}</span>
              <strong>
                {sample ? sample.channels[item.key]!.toPrecision(4) : "—"}
              </strong>
              <small>
                {sample ? `${item.unit} · sampled ${sample.hour}h` : "No data"}
              </small>
            </div>
          )
        })}
      </div>
      <label className="channel-picker">
        Trend to inspect
        <select
          value={activeKey}
          onChange={(event) => setSelected(event.target.value)}
        >
          {sampledChannels.map((item) => (
            <option value={item.key} key={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {values.length ? (
        <svg
          className="channel-chart"
          viewBox="0 0 600 215"
          role="img"
          aria-label={`${channel.label} at original measurement times, through ${hour}h`}
        >
          <text x="60" y="22">
            {channel.label} {channel.unit}
          </text>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1="60"
                x2="560"
                y1={y(low + (high - low) * f)}
                y2={y(low + (high - low) * f)}
                stroke="#e6ebf0"
              />
              <text x="50" y={y(low + (high - low) * f) + 4} textAnchor="end">
                {(low + (high - low) * f).toPrecision(3)}
              </text>
            </g>
          ))}
          <polyline
            points={values

              .map((p) => `${x(p.hour)},${y(p.channels[activeKey]!)}`)

              .join(" ")}
            fill="none"
            stroke="#0d8279"
            strokeWidth="2"
          />
          {values.map((p) => (
            <circle
              key={p.hour}
              cx={x(p.hour)}
              cy={y(p.channels[activeKey]!)}
              r="3"
              fill="#0d8279"
            >
              <title>
                {p.hour}h · {p.channels[activeKey]} {channel.unit}
              </title>
            </circle>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} x={x(hour * f)} y="203" textAnchor="middle">
              {(hour * f).toFixed(1)}h
            </text>
          ))}
        </svg>
      ) : (
        <p className="panel-note">
          No {channel.label.toLowerCase()} data at this time. Add its column to
          your culture file.
        </p>
      )}
      <Details title="Measurement context">
        <p>
          Values are laboratory samples, not a continuous sensor stream.
          Unmeasured channels:{" "}
          {channels

            .filter((channel) => !sampledChannels.includes(channel))

            .map((channel) => channel.label)

            .join(", ") || "none"}
          . No contamination or leak diagnosis is inferred.
        </p>
      </Details>
    </Panel>
  )
}
