export type Range = [number, number]

export function boundRange(range: Range, extent: Range): Range {
  const full = extent[1] - extent[0]
  const size = Math.min(full, Math.max(full / 1000, range[1] - range[0]))
  const start = Math.max(extent[0], Math.min(extent[1] - size, range[0]))
  return [start, start + size]
}

export function zoomRange(
  range: Range,
  extent: Range,
  factor: number,
  anchor = 0.5,
): Range {
  const pivot = range[0] + (range[1] - range[0]) * anchor
  return boundRange(
    [pivot - (pivot - range[0]) * factor, pivot + (range[1] - pivot) * factor],
    extent,
  )
}

export function panRange(range: Range, extent: Range, fraction: number): Range {
  const delta = (range[1] - range[0]) * fraction
  return boundRange([range[0] + delta, range[1] + delta], extent)
}

export function plotNumber(value: number) {
  if (!Number.isFinite(value)) return "—"
  if (value !== 0 && (Math.abs(value) >= 100000 || Math.abs(value) < 0.01))
    return value.toExponential(2)
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

export function valueExtent(values: number[], logarithmic: boolean): Range {
  const finite = values.filter(
    (value) => Number.isFinite(value) && (!logarithmic || value > 0),
  )
  if (!finite.length) return logarithmic ? [-1, 1] : [0, 1]
  let min = Infinity
  let max = -Infinity
  for (const value of finite) {
    const transformed = logarithmic ? Math.log10(value) : value
    min = Math.min(min, transformed)
    max = Math.max(max, transformed)
  }
  const padding = (max - min || Math.abs(max) || 1) * 0.08
  return [logarithmic ? min - padding : Math.min(0, min), max + padding]
}

// Round axis ticks (1, 2, 2.5, 5 × 10ⁿ) inside the visible range.
export function niceTicks([min, max]: Range, target = 5): number[] {
  const span = max - min
  if (!(span > 0)) return [min]
  const raw = span / (target - 1)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10]
    .map((factor) => factor * magnitude)
    .find((value) => value >= raw)!
  const ticks: number[] = []
  for (let i = Math.ceil(min / step); i * step <= max + step * 1e-9; i++)
    ticks.push(Number((i * step).toPrecision(12)))
  return ticks
}
