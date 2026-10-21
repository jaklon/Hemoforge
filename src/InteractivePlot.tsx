import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Button } from "./workspace-ui"
import {
  boundRange,
  panRange,
  niceTicks,
  plotNumber,
  valueExtent,
  zoomRange,
  type Range,
} from "./plot-navigation"

export interface PlotCoordinates {
  x: (value: number) => number
  y: (value: number) => number
  top: number
  bottom: number
  left: number
  right: number
}

export default function InteractivePlot({
  title,
  xExtent,
  values,
  yLabel,
  children,
}: {
  title: string
  xExtent: Range
  values: number[]
  yLabel: string
  children: (coordinates: PlotCoordinates) => ReactNode
}) {
  const svg = useRef<SVGSVGElement>(null)
  const id = useId().replace(/:/g, "")
  const [width, setWidth] = useState(700)
  const [logarithmic, setLogarithmic] = useState(false)
  const [axes, setAxes] = useState("both")
  const [view, setView] = useState<{
    x: Range
    y: Range
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const pointers = useRef(
    new Map<number, {
      x: number
      y: number
    }>(),
  )
  const yExtent = valueExtent(values, logarithmic)
  const extentKey = `${xExtent.join(",")}:${yExtent.join(",")}:${logarithmic}`
  const extentRef = useRef(extentKey)
  // New observations or axis transforms fit the data again; resizing preserves the view.
  const current =
    extentRef.current === extentKey && view
      ? { x: boundRange(view.x, xExtent), y: boundRange(view.y, yExtent) }
      : { x: xExtent, y: yExtent }
  useEffect(() => {
    extentRef.current = extentKey
    setView(null)
  }, [extentKey])
  useEffect(() => {
    if (!svg.current) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, entry.contentRect.width)),
    )
    observer.observe(svg.current)
    return () => observer.disconnect()
  }, [])
  const left = 66,
    right = width - 22,
    top = 30,
    bottom = 260
  const transform = (value: number) => (logarithmic ? Math.log10(value) : value)
  const inverse = (value: number) => (logarithmic ? 10 ** value : value)
  const x = (value: number) =>
    left +
    ((value - current.x[0]) / (current.x[1] - current.x[0])) * (right - left)
  const y = (value: number) =>
    bottom -
    ((transform(value) - current.y[0]) / (current.y[1] - current.y[0])) *
      (bottom - top)
  function zoom(factor: number, anchor = { x: 0.5, y: 0.5 }) {
    setView({
      x:
        axes === "y"
          ? current.x
          : zoomRange(current.x, xExtent, factor, anchor.x),
      y:
        axes === "x"
          ? current.y
          : zoomRange(current.y, yExtent, factor, 1 - anchor.y),
    })
  }
  function pan(dx: number, dy: number) {
    setView({
      x: panRange(current.x, xExtent, dx),
      y: panRange(current.y, yExtent, dy),
    })
  }
  function position(clientX: number, clientY: number) {
    const rect = svg.current!.getBoundingClientRect()
    return {
      x: Math.max(
        0,
        Math.min(
          1,
          (((clientX - rect.left) / rect.width) * width - left) /
            (right - left),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          1,
          (((clientY - rect.top) / rect.height) * 302 - top) / (bottom - top),
        ),
      ),
    }
  }
  useEffect(() => {
    const element = svg.current
    if (!element) return
    function wheel(event: WheelEvent) {
      const factor = Math.exp(
        Math.max(-0.7, Math.min(0.7, event.deltaY * 0.002)),
      )
      // Zooming out a fully fitted chart scrolls the page instead of trapping it.
      const fitted =
        current.x[0] <= xExtent[0] &&
        current.x[1] >= xExtent[1] &&
        current.y[0] <= yExtent[0] &&
        current.y[1] >= yExtent[1]
      if (factor > 1 && fitted) return
      event.preventDefault()
      zoom(factor, position(event.clientX, event.clientY))
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  })
  const zoomed = (xExtent[1] - xExtent[0]) / (current.x[1] - current.x[0])
  function endPointer(pointerId: number) {
    pointers.current.delete(pointerId)
    setDragging(pointers.current.size > 0)
  }
  return (
    <div className="interactive-plot">
      <div className="plot-toolbar" aria-label={`${title} controls`}>
        <label>
          Y axis
          <select
            value={logarithmic ? "log" : "linear"}
            onChange={(event) => setLogarithmic(event.target.value === "log")}
          >
            <option value="linear">Linear</option>
            <option value="log">Logarithmic (log₁₀)</option>
          </select>
        </label>
        <label>
          Zoom axes
          <select
            value={axes}
            onChange={(event) => setAxes(event.target.value)}
          >
            <option value="both">Both axes</option>
            <option value="x">Time only</option>
            <option value="y">Y axis only</option>
          </select>
        </label>
        <div className="plot-buttons" role="group" aria-label="Zoom controls">
          <Button onClick={() => zoom(0.7)} aria-label="Zoom in">
            +
          </Button>
          <Button onClick={() => zoom(1 / 0.7)} aria-label="Zoom out">
            −
          </Button>
          <Button onClick={() => setView(null)}>Reset view</Button>
        </div>
      </div>
      <svg
        ref={svg}
        className={`interactive-plot-svg${dragging ? " is-dragging" : ""}`}
        viewBox={`0 0 ${width} 302`}
        tabIndex={0}
        role="group"
        aria-label={title}
        aria-describedby={`${id}-help ${id}-range`}
        onDoubleClick={() => setView(null)}
        onKeyDown={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
              "Home",
              "Escape",
            ].includes(event.key)
          )
            event.preventDefault()
          if (event.key === "ArrowLeft") pan(-0.2, 0)
          if (event.key === "ArrowRight") pan(0.2, 0)
          if (event.key === "ArrowUp") pan(0, 0.2)
          if (event.key === "ArrowDown") pan(0, -0.2)
          if (event.key === "+" || event.key === "=") zoom(0.7)
          if (event.key === "-") zoom(1 / 0.7)
          if (event.key === "Home" || event.key === "Escape") setView(null)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.focus({ preventScroll: true })
          event.currentTarget.setPointerCapture(event.pointerId)
          pointers.current.set(
            event.pointerId,
            position(event.clientX, event.clientY),
          )
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const previous = pointers.current.get(event.pointerId)
          if (!previous) return
          const next = position(event.clientX, event.clientY)
          const other = [...pointers.current.entries()].find(
            ([key]) => key !== event.pointerId,
          )?.[1]
          if (other) {
            const oldDistance = Math.hypot(
              previous.x - other.x,
              previous.y - other.y,
            )
            const newDistance = Math.hypot(next.x - other.x, next.y - other.y)
            const center = {
              x: (next.x + other.x) / 2,
              y: (next.y + other.y) / 2,
            }
            if (newDistance > 0.01) zoom(oldDistance / newDistance, center)
          } else pan(previous.x - next.x, next.y - previous.y)
          pointers.current.set(event.pointerId, next)
        }}
        onPointerUp={(event) => endPointer(event.pointerId)}
        onPointerCancel={(event) => endPointer(event.pointerId)}
        onLostPointerCapture={(event) => endPointer(event.pointerId)}
      >
        <title>{title}</title>
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={left} y={top} width={right - left} height={bottom - top} />
          </clipPath>
        </defs>
        <text x={left} y="16" className="axis-title">
          {yLabel}
          {logarithmic ? " · log₁₀ scale" : ""}
        </text>
        {niceTicks(current.y, 6).map((value) => {
          const cy =
            bottom -
            ((value - current.y[0]) / (current.y[1] - current.y[0])) *
              (bottom - top)
          return (
            <g key={value}>
              <line
                x1={left}
                x2={right}
                y1={cy}
                y2={cy}
                className="chart-grid"
              />
              <text x={left - 9} y={cy + 4} textAnchor="end">
                {plotNumber(inverse(value))}
              </text>
            </g>
          )
        })}
        <g clipPath={`url(#${id}-clip)`}>
          {children({ x, y, top, bottom, left, right })}
        </g>
        {niceTicks(current.x, width < 500 ? 4 : 7).map((value) => (
          <text key={value} x={x(value)} y="281" textAnchor="middle">
            {plotNumber(value)}h
          </text>
        ))}
        <text x={right} y="299" textAnchor="end" className="axis-title">
          Time (hours)
        </text>
      </svg>
      <div className="plot-footer">
        <p id={`${id}-help`}>
          Scroll to zoom · Drag to pan · Double-click to reset
        </p>
        <span id={`${id}-range`} aria-live="polite">
          {plotNumber(current.x[0])}–{plotNumber(current.x[1])}h ·{" "}
          {plotNumber(zoomed)}× time zoom
        </span>
      </div>
    </div>
  )
}
