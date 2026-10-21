import { useEffect, useState } from "react"

import ForecastChart from "./ForecastChart"

import { plotNumber } from "./plot-navigation"

import { useCultureData, useWorkspace } from "./workspace-context"

import {
  channels,
  filterMarkers,
  type ExperimentRow,
  type MarkerRow,
} from "./workspace-data"

import { fitExperimentPlan, conditionSummary } from "./experiment-model"

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

  const current =
    simulation &&
    simulation.batchId === batchId(replicate) &&
    simulation.sourceHash === source.sha256 &&
    simulation.result.fromHour === hour &&
    JSON.stringify(simulation.settings) === JSON.stringify(settings)
      ? simulation
      : null

  const result = current?.result

  const end = result?.distribution.at(-1)

  return (
    <Panel
      title="Simulate future growth"
      caption="Runs in Python using measurements available at the cutoff."
      action={
        <a className="method-link" href="#methods/growth">
          Equations &amp; references
        </a>
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
          disabled={predicting}
        />
        <NumberField
          label="Simulation paths"
          value={settings.paths}
          onChange={(value) => setSettings({ ...settings, paths: value! })}
          min={10}
          max={2000}
          step={1}
          disabled={predicting}
        />
        <NumberField
          label="Random seed"
          value={seed}
          onChange={(value) => setSettings({ ...settings, seed: value! })}
          min={0}
          max={2147483647}
          step={1}
          disabled={predicting}
        />
        <Button
          primary
          disabled={blocked || predicting}
          onClick={async () => {
            if (predicting) return

            setPredicting(true)

            setError("")

            try {
              await simulate(replicate, hour, { ...settings })
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Simulation failed.",
              )
            } finally {
              setPredicting(false)
            }
          }}
        >
          {predicting ? "Running in Python…" : "Run growth simulation"}
        </Button>
      </div>
      <Details title="Growth assumptions & fitting window">
        <div className="settings-grid">
          <NumberField
            label="Lookback window (hours)"
            value={settings.lookbackHours}
            optional
            min={0.01}
            max={100000}
            disabled={predicting}
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
            disabled={predicting}
            hint="Blank fits from data. An override creates a researcher-defined scenario."
            onChange={(value) => setSettings({ ...settings, drift: value })}
          />
          <NumberField
            label="Volatility override (per √hour)"
            value={settings.volatility}
            optional
            min={0}
            max={2}
            disabled={predicting}
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
      {result && end ? (
        <>
          <div className="growth-metrics">
            <div>
              <span>Projected median at {plotNumber(end.hour)}h</span>
              <strong>
                {end.median.toPrecision(4)}
                <small>×10⁶ cells</small>
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
            samples={state.valid}
          />
        </>
      ) : (
        <div className="empty-state simulation-empty">
          <strong>
            {simulation
              ? "Run again for these settings"
              : "No simulation run yet"}
          </strong>
          <p>Choose a batch and replay time, then run.</p>
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
          Changing input, time, or any growth setting requires a new run. Later
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

export function ExperimentPlanner({
  candidate,

  setCandidate,

  onEditData,
}: {
  candidate: number | null

  setCandidate: (value: number) => void

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
    useState<ReturnType<typeof fitExperimentPlan> | null>(null)

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

  const selected = candidate === null ? null : summary[candidate]

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
            label="Normalized noise SD"
            value={settings.noise}
            min={0.0001}
            max={10}
            disabled={fitting}
            onChange={(value) => setSettings({ ...settings, noise: value! })}
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
      <div className="plan-grid">
        <Panel
          title="Observed experimental results"
          caption={`One row per condition · response unit: ${summary[0]?.unit ?? "not supplied"}`}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Condition</th>
                  <th className="numeric">Lactate mg/L</th>
                  <th className="numeric">Ammonia mg/L</th>
                  <th className="numeric">Runs</th>
                  <th className="numeric">Mean ± SD</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row, index) => (
                  <tr
                    key={row.id}
                    className={candidate === index ? "selected-row" : ""}
                  >
                    <td>{row.id}</td>
                    <td className="numeric">{row.lactate}</td>
                    <td className="numeric">{row.ammonia}</td>
                    <td className="numeric">{row.n}</td>
                    <td className="numeric">
                      {row.mean.toFixed(3)} ± {row.sd?.toFixed(3) ?? "N/A"}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        aria-pressed={candidate === index}
                        onClick={() => setCandidate(index)}
                      >
                        {candidate === index ? "Selected" : "Review"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Candidate review">
          <div className="candidate-review">
            {selected ? (
              <>
                <h3>{selected.id}</h3>
                <p>
                  Lactate {selected.lactate} mg/L · Ammonia {selected.ammonia}{" "}
                  mg/L.
                </p>
                <p>
                  Observed mean {selected.mean.toFixed(3)} {selected.unit} from{" "}
                  {selected.n} run(s).
                </p>
              </>
            ) : (
              <p>Select a condition in the table to inspect it.</p>
            )}
            <Details title="How to read these results">
              <p>
                A condition is a combination of lab settings. The response is
                what the experiment produced. The fitted model estimates
                response and uncertainty; expected improvement ranks possible
                repeat measurements within the uploaded conditions.
              </p>
            </Details>
          </div>
        </Panel>
      </div>
      {model && (
        <>
          <Panel
            title="GP estimates & next-test rankings"
            action={
              <a className="method-link" href="#methods/improvement">
                Expected improvement equation
              </a>
            }
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th className="numeric">GP mean</th>
                    <th className="numeric">Uncertainty SD</th>
                    <th className="numeric">Expected improvement</th>
                  </tr>
                </thead>
                <tbody>
                  {model.ranked.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td className="numeric">{row.prediction.toFixed(4)}</td>
                      <td className="numeric">{row.uncertainty.toFixed(4)}</td>
                      <td className="numeric">{row.ei.toPrecision(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Held-out condition check"
            action={
              <a className="method-link" href="#methods/validation">
                Validation formulas
              </a>
            }
          >
            <div className="growth-metrics">
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

export function ChannelPanel({
  replicate,

  hour,

  onImport,
}: {
  replicate: number

  hour: number

  onImport?: () => void
}) {
  const { batchMeasurements, batchId } = useCultureData()

  const [selected, setSelected] = useState(channels[0].key)

  const rows = batchMeasurements(replicate).filter(
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
