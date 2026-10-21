import { useEffect, useRef, useState } from "react"
import { cultureMeasurements } from "./culture-data"
import { createSmoothCurve } from "./smooth-curve"
import {
  forecastStartMaxHour,
  forecastStartMinHour,
  type CultureForecast,
} from "./culture-forecast"

export default function CultureForecastChart({
  forecast,
  replicate,
  onChangeStartHour,
}: {
  forecast: CultureForecast
  replicate: number
  onChangeStartHour: (hours: number) => void
}) {
  const chartRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(660)
  useEffect(() => {
    if (!chartRef.current) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    )
    observer.observe(chartRef.current)
    return () => observer.disconnect()
  }, [])
  const end = forecast.distribution[forecast.distribution.length - 1]
  const observed = cultureMeasurements.filter(
    (sample) => sample.hour <= forecast.fromHour,
  )
  // Keep the time scale fixed while the forecast boundary moves.
  const lastHour = forecastStartMaxHour + 72
  const right = width - 28
  const yMax =
    Math.ceil(
      Math.max(
        ...forecast.distribution.map((point) => point.upper95),
        ...observed.map((sample) => sample.counts[replicate - 1]),
      ) / 5,
    ) * 5
  const x = (hour: number) => 54 + (hour / lastHour) * (right - 54)
  const y = (count: number) => 228 - (count / yMax) * 188
  const line = (values: number[]) =>
    values
      .map((count, step) => `${x(forecast.fromHour + step)},${y(count)}`)
      .join(" ")
  const band = (lower: "lower95" | "lower80", upper: "upper95" | "upper80") =>
    forecast.distribution
      .map((point) => `${x(point.hour)},${y(point[upper])}`)
      .join(" ") +
    " " +
    [...forecast.distribution]
      .reverse()
      .map((point) => `${x(point.hour)},${y(point[lower])}`)
      .join(" ")
  const observedPath = createSmoothCurve(
    observed.map((sample) => ({
      x: x(sample.hour),
      y: y(sample.counts[replicate - 1]),
    })),
  ).path
  const tickStep = width < 500 ? 48 : 24
  const ticks = Array.from(
    { length: lastHour / tickStep + 1 },
    (_, i) => i * tickStep,
  )
  return (
    <div className="forecast-chart-shell">
      <svg
        ref={chartRef}
        className="forecast-chart"
        viewBox={`0 0 ${width} 284`}
        role="img"
        aria-label={`Historical Monte Carlo forecast: ${forecast.simulationCount} simulations from ${forecast.fromHour} to ${end.hour} hours, fitted to ${forecast.measurementCount} measurements through ${forecast.observedHour} hours. Endpoint median ${end.median.toFixed(2)}, 95 percent simulated range ${end.lower95.toFixed(2)} to ${end.upper95.toFixed(2)} million cells. Later measurements are excluded.`}
      >
        <defs>
          <clipPath id="forecast-plot">
            <rect x="54" y="36" width={right - 54} height="192" />
          </clipPath>
        </defs>
        <rect
          className="forecast-zone"
          x={x(forecast.fromHour)}
          y="36"
          width={x(end.hour) - x(forecast.fromHour)}
          height="192"
        />
        {[0, 1, 2, 3, 4].map((step) => (
          <g key={step}>
            <line
              className="forecast-grid"
              x1="54"
              x2={right}
              y1={y((yMax * step) / 4)}
              y2={y((yMax * step) / 4)}
            />
            <text
              className="forecast-axis-label"
              x="44"
              y={y((yMax * step) / 4) + 4}
              textAnchor="end"
            >
              {((yMax * step) / 4).toFixed(1)}
            </text>
          </g>
        ))}
        <text className="forecast-unit" x="54" y="20">
          Cell count · ×10⁶
        </text>
        <text
          className="forecast-region-label"
          x={(x(forecast.fromHour) + x(end.hour)) / 2}
          y="29"
          textAnchor="middle"
        >
          FUTURE
        </text>
        <g clipPath="url(#forecast-plot)">
          <polygon
            className="forecast-band-95"
            points={band("lower95", "upper95")}
          />
          <polygon
            className="forecast-band-80"
            points={band("lower80", "upper80")}
          />
          {forecast.paths.slice(0, 32).map((path, i) => (
            <polyline className="forecast-trial" key={i} points={line(path)} />
          ))}
          <polyline
            className="forecast-median"
            points={line(forecast.distribution.map((point) => point.median))}
          />
          <path className="forecast-observed" d={observedPath} />
          {forecast.observedHour < forecast.fromHour && (
            <line
              className="forecast-median"
              x1={x(forecast.observedHour)}
              x2={x(forecast.fromHour)}
              y1={y(forecast.observedCount)}
              y2={y(forecast.startCount)}
            />
          )}
        </g>
        {observed.map((sample) => (
          <circle
            className="bio-dot"
            key={sample.hour}
            cx={x(sample.hour)}
            cy={y(sample.counts[replicate - 1])}
            r="3.5"
          />
        ))}
        <g className="forecast-selection" aria-hidden="true">
          <line
            className="forecast-selection-line"
            x1={x(forecast.fromHour)}
            x2={x(forecast.fromHour)}
            y1="36"
            y2="228"
          />
          <rect
            className="forecast-selection-grip"
            x={x(forecast.fromHour) - 11}
            y="32"
            width="22"
            height="18"
            rx="4"
          />
          <path
            className="forecast-selection-grip-lines"
            d={`M${x(forecast.fromHour) - 3} 37v8 M${x(forecast.fromHour) + 3} 37v8`}
          />
          <circle
            className="forecast-selection-point"
            cx={x(forecast.fromHour)}
            cy={y(forecast.startCount)}
            r="4.5"
          />
        </g>
        {ticks.map((hour) => (
          <text
            className="forecast-axis-label"
            key={hour}
            x={x(hour)}
            y="249"
            textAnchor="middle"
          >
            {hour}h
          </text>
        ))}
        <text
          className="forecast-axis-label"
          x={(54 + right) / 2}
          y="275"
          textAnchor="middle"
        >
          Elapsed culture time · hours
        </text>
      </svg>
      <input
        type="range"
        className="forecast-scrub-input"
        min={forecastStartMinHour}
        max={forecastStartMaxHour}
        step="1"
        value={forecast.fromHour}
        onChange={(event) => onChangeStartHour(event.target.valueAsNumber)}
        aria-label="Forecast start hour"
        aria-valuetext={`Forecast starts at ${forecast.fromHour} hours and ends at ${end.hour} hours. Uses ${forecast.measurementCount} measurements through ${forecast.observedHour} hours.`}
        aria-describedby="forecast-drag-help"
        style={{
          left: x(forecastStartMinHour) - 16,
          width: x(forecastStartMaxHour) - x(forecastStartMinHour) + 32,
        }}
      />
      <p id="forecast-drag-help" className="forecast-drag-help">
        Drag the forecast start (48–168h) to rerun from that hour. Arrow keys
        move 1h.
      </p>
    </div>
  )
}
