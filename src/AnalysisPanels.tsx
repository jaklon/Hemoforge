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
  factorNames,
  type ExperimentRow,
  type MarkerRow,
} from "./workspace-data"

import {
  conditionSummary,
  factorLabel,
  type ExperimentPlan,
} from "./experiment-model"

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
  condition: {
    lactate: number
    ammonia: number
    source: "predicted" | "added"
  } | null
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
                    top-ranked condition{" "}
                    {condition.source === "predicted"
                      ? "is predicted to end at"
                      : "adds"}{" "}
                    {condition.lactate.toFixed(0)} mg/L lactate and{" "}
                    {condition.ammonia.toFixed(0)} mg/L ammonia, which is{" "}
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
                    ammonia inhibition onsets. The check needs{" "}
                    <code>measured_lactate_mg_l</code> and{" "}
                    <code>measured_ammonia_mg_l</code> for every condition.
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

// Measured outputs take priority; a spiking study's added amounts are the fallback.
function metaboliteCheck(candidate?: ExperimentPlan["candidates"][number]) {
  if (!candidate) return null
  const { metabolites, factors } = candidate
  if (metabolites.lactate_mg_l != null && metabolites.ammonia_mg_l != null)
    return {
      lactate: metabolites.lactate_mg_l,
      ammonia: metabolites.ammonia_mg_l,
      source: "predicted" as const,
    }
  if (factors.lactate_mg_l != null && factors.ammonia_mg_l != null)
    return {
      lactate: factors.lactate_mg_l,
      ammonia: factors.ammonia_mg_l,
      source: "added" as const,
    }
  return null
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

  const factors = factorNames(rows)

  const hasMeasured = summary.some(
    (row) => row.lactate != null || row.ammonia != null,
  )

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
      <ProductionTarget condition={metaboliteCheck(model?.candidates[0])} />
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
        caption={`From the dataset: ${factors.length} factor${factors.length === 1 ? "" : "s"} set in the medium and the measured response (${summary[0]?.unit ?? "unit not supplied"})${hasMeasured ? ", plus end-of-run lactate and ammonia" : ""}.`}
      >
        <div className="table-scroll compact-table">
          <table>
            <thead>
              <tr>
                <th>Condition</th>
                {factors.map((name) => (
                  <th key={name} className="numeric">
                    {factorLabel(name)}
                  </th>
                ))}
                <th className="numeric">Response</th>
                {hasMeasured && (
                  <>
                    <th className="numeric">Lactate out mg/L</th>
                    <th className="numeric">Ammonia out mg/L</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  {factors.map((name) => (
                    <td key={name} className="numeric">
                      {row.factors[name]}
                    </td>
                  ))}
                  <td className="numeric">
                    {row.mean.toFixed(2)}
                    {row.sd !== null && ` ± ${row.sd.toFixed(2)}`}
                    {row.n > 1 && ` (${row.n} runs)`}
                  </td>
                  {hasMeasured && (
                    <>
                      <td className="numeric">{row.lactate?.toFixed(0) ?? "—"}</td>
                      <td className="numeric">{row.ammonia?.toFixed(1) ?? "—"}</td>
                    </>
                  )}
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
            ? `Best ${Math.min(8, model.candidates.length)} of a ${model.gridSize}-point grid inside the tested range, already-tested conditions included · ${
                model.noise.source === "replicates"
                  ? `noise from pooled replicate SD ${model.noise.sd.toPrecision(3)} (${model.noise.dof} df)`
                  : model.noise.source === "setting"
                    ? "noise from your override"
                    : "no replicates: noise assumed"
              }`
            : "Fit the GP to rank new factor combinations by expected improvement."
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
                    {model.factorNames.map((name) => (
                      <th key={name} className="numeric">
                        {factorLabel(name)}
                      </th>
                    ))}
                    <th className="numeric">GP mean ± SD</th>
                    <th className="numeric">Expected improvement</th>
                    {model.candidates[0]?.metabolites.lactate_mg_l != null && (
                      <th className="numeric">Predicted lactate mg/L</th>
                    )}
                    {model.candidates[0]?.metabolites.ammonia_mg_l != null && (
                      <th className="numeric">Predicted ammonia mg/L</th>
                    )}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {model.candidates.slice(0, 8).map((row) => (
                    <tr key={JSON.stringify(row.factors)}>
                      {model.factorNames.map((name) => (
                        <td key={name} className="numeric">
                          {plotNumber(row.factors[name])}
                        </td>
                      ))}
                      <td className="numeric">
                        {row.prediction.toFixed(3)} ±{" "}
                        {row.uncertainty.toFixed(3)}
                      </td>
                      <td className="numeric">{row.ei.toPrecision(3)}</td>
                      {row.metabolites.lactate_mg_l != null && (
                        <td className="numeric">
                          {row.metabolites.lactate_mg_l.toFixed(0)}
                        </td>
                      )}
                      {row.metabolites.ammonia_mg_l != null && (
                        <td className="numeric">
                          {row.metabolites.ammonia_mg_l.toFixed(1)}
                        </td>
                      )}
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

// The four metabolites share mmol/L on the left axis; pH gets its own axis on the right.
const mvpSeries = [
  { key: "lactate_mmol_l", color: "#c2410c" },
  { key: "ammonia_mmol_l", color: "#7c3aed" },
  { key: "glucose_mmol_l", color: "#2563eb" },
  { key: "glutamine_mmol_l", color: "#0d8279" },
  { key: "ph", color: "#64748b", right: true },
]

// Axes span the whole run, so replay reveals points without rescaling the lines.
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

  const series = mvpSeries.map((item) => {
    const channel = channels.find((c) => c.key === item.key)!

    const all = rows.filter((row) => row.channels[item.key] != null)

    return {
      ...item,
      label: item.key === "ph" ? "pH medium" : channel.label,
      unit: channel.unit,
      all,
      values: all.filter((row) => row.hour <= hour),
      value: (row: CultureRow) => row.channels[item.key]!,
    }
  })

  const left = series.filter((item) => !item.right)

  const ph = series.find((item) => item.right)!

  return (
    <>
          <InteractivePlot
            controls={<h3>MVP variables</h3>}
            logScale={false}
            help={false}
            title={`Metabolites and pH through ${hour}h`}
            xExtent={[0, end]}
            values={left.flatMap((item) => item.all.map(item.value))}
            fromZero={false}
            yLabel="Metabolites (mmol/L)"
            y2={{ values: ph.all.map(ph.value), label: "pH" }}
            points={series.flatMap((item) =>
              item.values.map((row, index) => {
                const previous = item.values[index - 1]

                return {
                  x: row.hour,

                  y: item.value(row),

                  right: item.right,

                  lines: [
                    `${item.label} · ${plotNumber(row.hour)}h`,

                    `${plotNumber(item.value(row))} ${item.unit}`,

                    ...(previous
                      ? [
                          `${item.value(row) >= item.value(previous) ? "+" : ""}${plotNumber(
                            item.value(row) - item.value(previous),
                          )} vs ${plotNumber(previous.hour)}h`,
                        ]
                      : []),
                  ],
                }
              }),
            )}
          >
            {({ x, y, y2, top, bottom }) => (
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
                {series.map((item) => {
                  const toY = item.right ? y2 : y

                  return (
                    <g key={item.key} fill={item.color} stroke={item.color}>
                      <polyline
                        points={item.values
                          .map((row) => `${x(row.hour)},${toY(item.value(row))}`)
                          .join(" ")}
                        fill="none"
                        strokeWidth="2"
                        strokeDasharray={item.right ? "5 3" : undefined}
                      />
                      {item.values.map((row) => (
                        <circle
                          key={row.hour}
                          cx={x(row.hour)}
                          cy={toY(item.value(row))}
                          r="2.5"
                          stroke="none"
                        />
                      ))}
                    </g>
                  )
                })}
                {!series.some((item) => item.all.length) && (
                  <text x={x(end / 2)} y={(top + bottom) / 2} textAnchor="middle">
                    Not measured yet
                  </text>
                )}
              </>
            )}
          </InteractivePlot>
      <div className="guard-legend mvp-legend" aria-label="Chart series">
        {series.map((item) => (
          <span key={item.key}>
            <i style={{ borderTop: `2px ${item.right ? "dashed" : "solid"} ${item.color}` }} />
            {item.label}
            <small>
              {item.values.length
                ? `${item.value(item.values.at(-1)!).toPrecision(3)} ${item.unit}`
                : "No data"}
            </small>
          </span>
        ))}
      </div>
    </>
  )
}
