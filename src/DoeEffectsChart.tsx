import { useEffect, useRef, useState } from "react"
import { doeEffects, formatDoeValue } from "./culture-doe"

const effectViews = [
  {
    id: "lactate",
    label: "Lactate",
    effect: doeEffects.lactate.effect,
    levels: ["0", "850"],
    axis: "Lactate · mg/L",
    note: "Mean response across ammonia levels.",
    series: [
      {
        label: "Mean response",
        values: [doeEffects.lactate.low, doeEffects.lactate.high],
        tone: "red",
      },
    ],
  },
  {
    id: "ammonia",
    label: "Ammonia",
    effect: doeEffects.ammonia.effect,
    levels: ["0", "41"],
    axis: "Ammonia · mg/L",
    note: "Mean response across lactate levels.",
    series: [
      {
        label: "Mean response",
        values: [doeEffects.ammonia.low, doeEffects.ammonia.high],
        tone: "teal",
      },
    ],
  },
  {
    id: "interaction",
    label: "Interaction",
    effect: doeEffects.interaction.effect,
    levels: ["0", "850"],
    axis: "Lactate · mg/L",
    note: "Response at each ammonia level; factorial interaction effect shown above.",
    series: [
      {
        label: "Ammonia 0 mg/L",
        values: doeEffects.interaction.ammoniaLow,
        tone: "indigo",
      },
      {
        label: "Ammonia 41 mg/L",
        values: doeEffects.interaction.ammoniaHigh,
        tone: "amber",
      },
    ],
  },
]

export default function DoeEffectsChart() {
  const [viewId, setViewId] = useState("lactate")
  const view = effectViews.find((item) => item.id === viewId)!
  const chartRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    if (!chartRef.current) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, entry.contentRect.width)),
    )
    observer.observe(chartRef.current)
    return () => observer.disconnect()
  }, [])
  const left = 64
  const right = width - 36
  const y = (value: number) => 184 - (value / 9) * 136
  return (
    <div className="doe-effects">
      <fieldset className="portal-reps">
        <legend>Effect view</legend>
        <div className="replicate-options">
          {effectViews.map((item) => (
            <label key={item.id}>
              <input
                type="radio"
                name="doe-effect"
                value={item.id}
                checked={viewId === item.id}
                onChange={() => setViewId(item.id)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="doe-effect-summary">
        <span>{view.label} effect</span>
        <strong>
          {view.effect > 0 ? "+" : ""}
          {formatDoeValue(view.effect)}
        </strong>
      </div>
      {view.series.length > 1 && (
        <div className="doe-series-legend">
          {view.series.map((series) => (
            <span key={series.label}>
              <i className={`doe-${series.tone}`} />
              {series.label}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={chartRef}
        className="doe-effect-plot"
        viewBox={`0 0 ${width} 236`}
        role="img"
        aria-label={`${view.label} effect ${formatDoeValue(view.effect)}. ${view.series.map((series) => `${series.label}: ${formatDoeValue(series.values[0])} to ${formatDoeValue(series.values[1])}`).join("; ")}. ${view.note}`}
      >
        {[0, 3, 6, 9].map((value) => (
          <g key={value}>
            <line
              className="doe-plot-grid"
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              className="doe-plot-label"
              x={left - 14}
              y={y(value) + 4}
              textAnchor="end"
            >
              {value}
            </text>
          </g>
        ))}
        <text className="doe-plot-label" x={left} y="20">
          Mean response · source units
        </text>
        {view.series.map((series, seriesIndex) => (
          <g key={series.label}>
            <line
              className={`doe-plot-line doe-${series.tone}`}
              x1={left}
              x2={right}
              y1={y(series.values[0])}
              y2={y(series.values[1])}
            />
            {series.values.map((value, i) => (
              <g key={i}>
                <circle
                  className={`doe-plot-point doe-${series.tone}`}
                  cx={i === 0 ? left : right}
                  cy={y(value)}
                  r="4"
                />
                <text
                  className="doe-point-value"
                  x={i === 0 ? left + 10 : right - 10}
                  y={y(value) + (seriesIndex === 0 ? -12 : 20)}
                  textAnchor={i === 0 ? "start" : "end"}
                >
                  {formatDoeValue(value)}
                </text>
              </g>
            ))}
          </g>
        ))}
        {view.levels.map((level, i) => (
          <text
            className="doe-plot-label"
            key={level}
            x={i === 0 ? left : right}
            y="205"
            textAnchor="middle"
          >
            {level}
          </text>
        ))}
        <text
          className="doe-plot-label"
          x={(left + right) / 2}
          y="229"
          textAnchor="middle"
        >
          {view.axis}
        </text>
      </svg>
      <p className="doe-effect-note">{view.note}</p>
    </div>
  )
}
