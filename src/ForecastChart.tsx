import { useState } from "react"
import type { CultureForecast } from "./culture-forecast"
import type { Measurement } from "./culture-monitoring"
import InteractivePlot from "./InteractivePlot"
import { plotNumber } from "./plot-navigation"

export default function ForecastChart({
  result,
  samples,
}: {
  result: CultureForecast
  samples: Measurement[]
}) {
  const [paths, setPaths] = useState(true)
  const [interval, setInterval] = useState("95")
  const [inspection, setInspection] = useState("")
  const last = result.distribution.at(-1)!
  const options = [
    ...samples.map((sample) => ({
      hour: sample.hour,
      kind: "Measured",
      value: sample.count!,
      lower: null as number | null,
      upper: null as number | null,
    })),
    ...result.distribution.map((point) => ({
      hour: point.hour,
      kind: "Simulated",
      value: point.median,
      lower: point.lower95,
      upper: point.upper95,
    })),
  ]
  const selected =
    options.find((point) => `${point.kind}-${point.hour}` === inspection) ??
    options.at(-1)!
  const lower = (point: CultureForecast["distribution"][number]) =>
    interval === "95" ? point.lower95 : point.lower80
  const upper = (point: CultureForecast["distribution"][number]) =>
    interval === "95" ? point.upper95 : point.upper80
  return (
    <>
      <div className="forecast-display-controls">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={paths}
            onChange={(event) => setPaths(event.target.checked)}
          />
          Show sample paths (up to 24)
        </label>
        <label>
          Simulated interval
          <select
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
          >
            <option value="95">95%</option>
            <option value="80">80%</option>
          </select>
        </label>
        <a href="#methods/intervals">Range & log-axis formulas ↗</a>
      </div>
      <InteractivePlot
        title="Growth simulation chart"
        xExtent={[Math.min(0, samples[0]?.hour ?? 0), last.hour]}
        values={[
          ...samples.map((point) => point.count!),
          ...result.distribution.flatMap((point) => [
            point.lower95,
            point.upper95,
          ]),
          ...(paths ? result.paths.slice(0, 24).flat() : []),
        ]}
        yLabel="Cell count · ×10⁶ cells"
      >
        {({ x, y, top, bottom }) => (
          <>
            <polygon
              points={[
                ...result.distribution.map(
                  (point) => `${x(point.hour)},${y(upper(point))}`,
                ),
                ...[...result.distribution]
                  .reverse()
                  .map((point) => `${x(point.hour)},${y(lower(point))}`),
              ].join(" ")}
              className="forecast-band"
            />
            {paths &&
              result.paths
                .slice(0, 24)
                .map((path, i) => (
                  <polyline
                    key={i}
                    points={path
                      .map(
                        (value, step) =>
                          `${x(result.fromHour + step)},${y(value)}`,
                      )
                      .join(" ")}
                    className="forecast-path"
                  />
                ))}
            <polyline
              points={samples
                .map((point) => `${x(point.hour)},${y(point.count!)}`)
                .join(" ")}
              className="forecast-observed"
            />
            {samples.map((point) => (
              <circle
                key={point.hour}
                cx={x(point.hour)}
                cy={y(point.count!)}
                r="3.5"
                className="forecast-observation"
              >
                <title>
                  Measured · {plotNumber(point.hour)}h · {point.count} million
                  cells
                </title>
              </circle>
            ))}
            <polyline
              points={result.distribution
                .map((point) => `${x(point.hour)},${y(point.median)}`)
                .join(" ")}
              className="forecast-median"
            />
            <line
              x1={x(result.fromHour)}
              x2={x(result.fromHour)}
              y1={top}
              y2={bottom}
              className="replay-line"
            />
            <text
              x={x(result.fromHour) + 7}
              y={top + 14}
              className="forecast-cutoff"
            >
              Simulation starts
            </text>
            <line
              x1={x(selected.hour)}
              x2={x(selected.hour)}
              y1={top + 20}
              y2={bottom}
              className="guard-inspection-line"
            />
            <circle
              cx={x(selected.hour)}
              cy={y(selected.value)}
              r="5"
              className={
                selected.kind === "Measured"
                  ? "forecast-observation"
                  : "forecast-inspected"
              }
            />
          </>
        )}
      </InteractivePlot>
      <div className="forecast-legend">
        <span>
          <i className="legend-measured" />
          Measured
        </span>
        <span>
          <i className="legend-median" />
          Simulated median
        </span>
        <span>
          <i className="legend-band" />
          {interval}% simulated range
        </span>
      </div>
      <div className="plot-inspector">
        <label>
          Inspect a time point
          <select
            value={`${selected.kind}-${selected.hour}`}
            onChange={(event) => setInspection(event.target.value)}
          >
            {options.map((point) => (
              <option
                key={`${point.kind}-${point.hour}`}
                value={`${point.kind}-${point.hour}`}
              >
                {plotNumber(point.hour)}h · {point.kind}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span>
            {selected.kind === "Measured"
              ? "Measured count"
              : "Simulated median"}
          </span>
          <strong>
            {selected.value.toPrecision(5)} <small>×10⁶ cells</small>
          </strong>
        </div>
        <div>
          <span>95% simulated range</span>
          <strong>
            {selected.lower !== null
              ? `${selected.lower.toPrecision(4)}–${selected.upper!.toPrecision(4)}`
              : "Observed source value"}
          </strong>
        </div>
      </div>
    </>
  )
}
