import { useState } from "react"
import type { CultureForecast } from "./culture-forecast"
import type { Measurement } from "./culture-monitoring"
import InteractivePlot from "./InteractivePlot"
import { plotNumber } from "./plot-navigation"

export default function ForecastChart({
  result,
  samples,
  observedLabel = "Measured",
}: {
  result: CultureForecast
  samples: Measurement[]
  observedLabel?: string
}) {
  const [paths, setPaths] = useState(true)
  const [interval, setInterval] = useState("95")
  const last = result.distribution.at(-1)!
  const lower = (point: CultureForecast["distribution"][number]) =>
    interval === "95" ? point.lower95 : point.lower80
  const upper = (point: CultureForecast["distribution"][number]) =>
    interval === "95" ? point.upper95 : point.upper80
  const points = [
    ...samples.map((sample) => ({
      x: sample.hour,
      y: sample.count!,
      lines: [
        `${observedLabel} · ${plotNumber(sample.hour)}h`,
        `${plotNumber(sample.count!)} ×10⁶ cells`,
      ],
    })),
    ...result.distribution.map((point) => ({
      x: point.hour,
      y: point.median,
      lines: [
        `Simulated · ${plotNumber(point.hour)}h`,
        `Median ${point.median.toPrecision(4)} ×10⁶ cells`,
        `${interval}% range ${lower(point).toPrecision(3)}–${upper(point).toPrecision(3)}`,
      ],
    })),
  ]
  return (
    <>
      <InteractivePlot
        controls={
          <>
            <fieldset className="guard-segmented">
              <legend className="sr-only">Simulated interval</legend>
              {["95", "80"].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={interval === value}
                  onClick={() => setInterval(value)}
                >
                  {value}% range
                </button>
              ))}
            </fieldset>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={paths}
                onChange={(event) => setPaths(event.target.checked)}
              />
              Sample paths
            </label>
          </>
        }
        points={points}
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
        yLabel="Cell count (×10⁶ cells)"
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
              />
            ))}
            <polyline
              points={[
                // Bridge unobserved hours between the last sample and the simulation start.
                ...(result.observedHour < result.fromHour
                  ? [`${x(result.observedHour)},${y(result.observedCount)}`]
                  : []),
                ...result.distribution.map(
                  (point) => `${x(point.hour)},${y(point.median)}`,
                ),
              ].join(" ")}
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
          </>
        )}
      </InteractivePlot>
      <div className="guard-legend forecast-legend">
        <span>
          <i className="legend-measured" />
          {observedLabel}
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
    </>
  )
}
