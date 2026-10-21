import { useEffect, useMemo, useRef, useState } from "react"

import { useCultureData, useWorkspace } from "./workspace-context"

import { analyzeMeasurements } from "./culture-monitoring"

import {
  channels,
  filterMarkers,
  type ExperimentRow,
  type MarkerRow,
} from "./workspace-data"

import { fitExperimentPlan, conditionSummary } from "./experiment-model"

import { Button, Panel, Badge, PageTitle, Details } from "./workspace-ui"

import { csv, downloadFile } from "./workspace-utils"

import type { ForecastHorizon } from "./culture-forecast"
import Evo2Preparation from "./Evo2Preparation"

export function SimulationPanel({
  replicate,

  hour,
}: {
  replicate: number

  hour: number
}) {
  const { simulate, simulation } = useWorkspace()

  const { batchMeasurements, batchId, source } = useCultureData()

  const [horizon, setHorizon] = useState<ForecastHorizon>(
    simulation?.horizon ?? 72,
  )

  const [seed, setSeed] = useState(simulation?.result.seed ?? 42)

  const [error, setError] = useState("")
  const [predicting, setPredicting] = useState(false)

  const samples = batchMeasurements(replicate)

  const state = analyzeMeasurements(samples, hour)

  const blocked =
    state.valid.length < 3 ||
    state.status === "needs_review" ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 2147483647

  const current =
    simulation &&
    simulation.batchId === batchId(replicate) &&
    simulation.sourceHash === source.sha256 &&
    simulation.result.fromHour === hour &&
    simulation.horizon === horizon &&
    simulation.result.seed === seed
      ? simulation
      : null

  const chartRef = useRef<SVGSVGElement>(null)

  const [width, setWidth] = useState(650)

  useEffect(() => {
    if (!chartRef.current) return

    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    )

    observer.observe(chartRef.current)

    return () => observer.disconnect()
  }, [current])

  const result = current?.result

  const end = result?.distribution.at(-1)

  const yMax = result
    ? Math.max(
        ...state.valid.map((p) => p.count!),

        ...result.distribution.map((p) => p.upper95),

        0.01,
      ) * 1.08
    : 1

  const xmax = hour + horizon || 1

  const x = (value: number) => 58 + (value / xmax) * (width - 84)

  const y = (value: number) => 224 - (value / yMax) * 170

  const band = result
    ? [
        ...result.distribution.map((p) => `${x(p.hour)},${y(p.upper95)}`),

        ...[...result.distribution]

          .reverse()

          .map((p) => `${x(p.hour)},${y(p.lower95)}`),
      ].join(" ")
    : ""

  return (
    <Panel title="Simulate future growth">
      <div className="simulation-controls">
        <label>
          Future period
          <select
            value={horizon}
            disabled={predicting}
            onChange={(event) =>
              setHorizon(Number(event.target.value) as ForecastHorizon)
            }
          >
            <option value="24">24 hours</option>
            <option value="48">48 hours</option>
            <option value="72">72 hours</option>
          </select>
        </label>
        <label>
          Random seed
          <input
            type="number"
            disabled={predicting}
            min="0"
            max="2147483647"
            step="1"
            value={Number.isNaN(seed) ? "" : seed}
            onChange={(event) =>
              setSeed(
                event.target.value === "" ? NaN : Number(event.target.value),
              )
            }
          />
        </label>
        <Button
          primary
          disabled={blocked || predicting}
          onClick={async () => {
            if (predicting) return
            setPredicting(true)
            setError("")

            try {
              await simulate(replicate, hour, horizon, seed)
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
      {blocked && (
        <p className="panel-note">
          Needs 3 valid samples and an integer seed (0–2147483647). Advance
          replay if needed.
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
              <span>Projected median at {end.hour}h</span>
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
          <svg
            ref={chartRef}
            className="simulation-chart"
            viewBox={`0 0 ${width} 265`}
            role="img"
            aria-label={`500 simulated growth paths from ${hour}h, using only ${result.measurementCount} source samples. Dashed median and shaded 95 percent range.`}
          >
            <text x="58" y="24">
              Cell count · ×10⁶
            </text>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <g key={fraction}>
                <line
                  x1="58"
                  x2={width - 26}
                  y1={y(fraction * yMax)}
                  y2={y(fraction * yMax)}
                  stroke="#e6ebf0"
                />
                <text x="48" y={y(fraction * yMax) + 4} textAnchor="end">
                  {(fraction * yMax).toPrecision(2)}
                </text>
              </g>
            ))}
            <polygon points={band} fill="#dce9ed" />
            {result.paths.slice(0, 24).map((path, i) => (
              <polyline
                key={i}
                points={path

                  .map((v, step) => `${x(hour + step)},${y(v)}`)

                  .join(" ")}
                fill="none"
                stroke="#91adb5"
                strokeWidth=".65"
                opacity=".5"
              />
            ))}
            <polyline
              points={state.valid

                .map((p) => `${x(p.hour)},${y(p.count!)}`)

                .join(" ")}
              fill="none"
              stroke="#b4232b"
              strokeWidth="2.5"
            />
            {state.valid.map((p) => (
              <circle
                key={p.hour}
                cx={x(p.hour)}
                cy={y(p.count!)}
                r="3"
                fill="#b4232b"
              />
            ))}
            <polyline
              points={result.distribution

                .map((p) => `${x(p.hour)},${y(p.median)}`)

                .join(" ")}
              fill="none"
              stroke="#376979"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
            <line
              x1={x(hour)}
              x2={x(hour)}
              y1="45"
              y2="224"
              stroke="#8495a7"
              strokeDasharray="3 4"
            />
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <text
                x={x(xmax * fraction)}
                y="250"
                textAnchor="middle"
                key={fraction}
              >
                {Math.round(xmax * fraction)}h
              </text>
            ))}
          </svg>
          <p className="panel-note">
            Red: measured · Dashed blue: simulated median · Shading: 95% range
          </p>
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
          Changing input, time, horizon, or seed requires a new run. Later
          recorded samples are excluded. Results are included in the JSON/HTML
          export.
        </p>
        <p>
          The model estimates average log growth and variability from the counts
          available at the selected hour, then draws 500 positive random paths.
          It assumes those growth patterns continue. Feeding, contamination,
          interventions, and maturation are not modeled. Simulated intervals
          have no demonstrated predictive coverage. This is a working
          mathematical simulation, not a validated harvest forecast.
        </p>
      </Details>
    </Panel>
  )
}

export function ExperimentPlanner({
  candidate,

  setCandidate,
}: {
  candidate: number | null

  setCandidate: (value: number) => void
}) {
  const { inputs, run, refitPlan } = useWorkspace()

  const source = inputs.experiments

  const rows = source.rows as ExperimentRow[]

  const summary = conditionSummary(rows)

  const [objective, setObjective] = useState<"maximize" | "minimize">(
    run?.plan?.objective ?? "maximize",
  )

  const [model, setModel] =
    useState<ReturnType<typeof fitExperimentPlan> | null>(null)

  const [error, setError] = useState("")

  const [fitting, setFitting] = useState(false)

  useEffect(() => {
    setModel(run?.plan ?? null)
    setObjective(run?.plan?.objective ?? "maximize")

    setError(run?.planError ?? "")
  }, [run?.id, source])

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
              setObjective(event.target.value as "maximize" | "minimize")

              setModel(null)
            }}
          >
            <option value="maximize">Larger response is better</option>
            <option value="minimize">Smaller response is better</option>
          </select>
        </label>
        <Button
          primary
          disabled={summary.length < 3 || fitting}
          onClick={async () => {
            setFitting(true)

            try {
              await refitPlan(objective)

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
          <Panel title="GP estimates & next-test rankings">
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
          <Panel title="Held-out condition check">
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
                outcomes. Small datasets and fixed model settings limit
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

export function MarkerScreen({
  kel,

  setKel,

  slc,

  setSlc,

  checks,

  setChecks,
}: {
  kel: string

  setKel: (value: string) => void

  slc: string

  setSlc: (value: string) => void

  checks: boolean[]

  setChecks: (value: boolean[]) => void
}) {
  const { inputs } = useWorkspace()

  const source = inputs.markers

  const rows = filterMarkers(source.rows as MarkerRow[], kel, slc)

  const [matchesOnly, setMatchesOnly] = useState(false)

  const [page, setPage] = useState(0)

  const filtered = matchesOnly
    ? rows.filter((row) => row.status === "match")
    : rows

  const maxPage = Math.max(0, Math.ceil(filtered.length / 25) - 1)

  const safePage = Math.min(page, maxPage)

  useEffect(() => setPage(0), [kel, slc, matchesOnly, source])

  return (
    <>
      <PageTitle
        title="RareMatch"
        description="Find profiles with your selected markers."
        action={
          <Badge>
            {source.evidence === "user_supplied"
              ? "Imported marker data"
              : "Synthetic demo"}
          </Badge>
        }
      />
      <p className="context-strip">
        Source: <b>{source.name}</b>
      </p>
      <div className="marker-controls">
        {[
          { label: "KEL · rs8176058", value: kel, set: setKel },

          { label: "SLC14A1 · rs1058396", value: slc, set: setSlc },
        ].map((marker) => (
          <label key={marker.label}>
            {marker.label}
            <select
              value={marker.value}
              onChange={(event) => marker.set(event.target.value)}
            >
              <option>G/G</option>
              <option>G/A</option>
              <option>A/A</option>
            </select>
          </label>
        ))}
      </div>
      <div className="screening-stats">
        <span>
          <b>{rows.length}</b> profiles
        </span>
        <span>
          <b>{rows.filter((r) => r.status === "match").length}</b> matches
        </span>
        <span>
          <b>{rows.filter((r) => r.status === "excluded").length}</b> excluded
        </span>
        <span>
          <b>{rows.filter((r) => r.status === "unknown").length}</b> unknown
        </span>
      </div>
      <Panel
        title="Marker screening results"
        caption="Missing or ambiguous calls remain unknown"
        action={
          <Button
            icon="download"
            onClick={() =>
              downloadFile(
                "hemogpt-marker-results.csv",

                csv([
                  ["sample_id", "kel", "slc", "status", "source", "sha256"],

                  ...filtered.map((row) => [
                    row.id,

                    row.kel,

                    row.slc,

                    row.status,

                    source.name,

                    source.sha256,
                  ]),
                ]),

                "text/csv;charset=utf-8",
              )
            }
          >
            Export results CSV
          </Button>
        }
      >
        <label className="inline-check table-filter">
          <input
            type="checkbox"
            checked={matchesOnly}
            onChange={(event) => setMatchesOnly(event.target.checked)}
          />
          Show signature matches only
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Sample ID</th>
                <th>KEL rs8176058</th>
                <th>SLC14A1 rs1058396</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.slice(safePage * 25, safePage * 25 + 25).map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.kel}</td>
                    <td>{row.slc}</td>
                    <td>
                      <Badge
                        tone={
                          row.status === "match"
                            ? "brand"
                            : row.status === "unknown"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    No profiles match this signature. Change the target or clear
                    the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <Button
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </Button>
          <span>
            {filtered.length} results · page {safePage + 1} / {maxPage + 1}
          </span>
          <Button
            disabled={safePage === maxPage}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </Panel>
      <Panel
        title="Post-harvest verification"
        caption="Laboratory requests"
        action={<Badge tone="warning">Lab results pending</Badge>}
      >
        <div className="qc-checklist">
          {[
            "Request paired post-harvest genotyping / sequencing",

            "Request phenotype / serology confirmation",

            "Reconcile laboratory results with the initial marker profile",
          ].map((text, i) => (
            <label key={text}>
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(event) =>
                  setChecks(
                    checks.map((checked, j) =>
                      i === j ? event.target.checked : checked,
                    ),
                  )
                }
              />
              <span>{text}</span>
            </label>
          ))}
        </div>
        <Details title="Screening limits">
          <p>
            Marker inputs are independent of culture batches. Allele orientation
            requires independent verification.
          </p>
          <p>
            Two SNPs do not determine full blood type, genetic stability, or
            transfusion compatibility. Those questions need additional
            laboratory tests. The app cannot pass QC through a checklist.
          </p>
        </Details>
      </Panel>
      <Evo2Preparation />
    </>
  )
}

export function ChannelPanel({
  replicate,

  hour,
}: {
  replicate: number

  hour: number
}) {
  const { batchMeasurements, batchId } = useCultureData()

  const [selected, setSelected] = useState(channels[0].key)

  const rows = batchMeasurements(replicate).filter(
    (sample) => sample.hour <= hour,
  )

  const available = (key: string) =>
    rows.filter((row) => row.channels[key] != null)

  const values = available(selected)

  const channel = channels.find((item) => item.key === selected)!

  const minimum = values.length
    ? Math.min(...values.map((row) => row.channels[selected]!))
    : 0

  const maximum = values.length
    ? Math.max(...values.map((row) => row.channels[selected]!))
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
        {channels.map((item) => {
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
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {channels.map((item) => (
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

              .map((p) => `${x(p.hour)},${y(p.channels[selected]!)}`)

              .join(" ")}
            fill="none"
            stroke="#0d8279"
            strokeWidth="2"
          />
          {values.map((p) => (
            <circle
              key={p.hour}
              cx={x(p.hour)}
              cy={y(p.channels[selected]!)}
              r="3"
              fill="#0d8279"
            >
              <title>
                {p.hour}h · {p.channels[selected]} {channel.unit}
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
          Values are laboratory samples, not a continuous sensor stream. Missing
          channels remain No data. No contamination or leak diagnosis is
          inferred.
        </p>
      </Details>
    </Panel>
  )
}
