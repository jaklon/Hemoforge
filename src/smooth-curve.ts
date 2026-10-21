type CurvePoint = {
  x: number
  y: number
}

// Limit tangents at turning points so smoothing cannot invent peaks or dips.
export function createSmoothCurve(points: readonly CurvePoint[]) {
  const secants = points
    .slice(1)
    .map((point, i) => (point.y - points[i].y) / (point.x - points[i].x))
  const tangents = points.map((point, i) => {
    if (i === 0) return secants[0]
    if (i === points.length - 1) return secants[i - 1]
    const before = secants[i - 1]
    const after = secants[i]
    if (before * after <= 0) return 0
    const leftWidth = point.x - points[i - 1].x
    const rightWidth = points[i + 1].x - point.x
    const leftWeight = 2 * rightWidth + leftWidth
    const rightWeight = rightWidth + 2 * leftWidth
    return (
      (leftWeight + rightWeight) / (leftWeight / before + rightWeight / after)
    )
  })
  const segments = points.slice(1).map((end, i) => {
    const start = points[i]
    const width = end.x - start.x
    return {
      start,
      end,
      width,
      startSlope: tangents[i],
      endSlope: tangents[i + 1],
      a: (tangents[i] + tangents[i + 1] - 2 * secants[i]) / width ** 2,
      b: (3 * secants[i] - 2 * tangents[i] - tangents[i + 1]) / width,
    }
  })
  return {
    path:
      `M${points[0].x},${points[0].y}` +
      segments
        .map(
          ({ start, end, width, startSlope, endSlope }) =>
            ` C${start.x + width / 3},${start.y + (startSlope * width) / 3} ${end.x - width / 3},${end.y - (endSlope * width) / 3} ${end.x},${end.y}`,
        )
        .join(""),
    at(x: number) {
      const boundedX = Math.max(
        points[0].x,
        Math.min(points[points.length - 1].x, x),
      )
      const segment =
        segments.find(({ end }) => end.x >= boundedX) ??
        segments[segments.length - 1]
      const offset = boundedX - segment.start.x
      return {
        value:
          offset === segment.width
            ? segment.end.y
            : segment.start.y +
              offset *
                (segment.startSlope +
                  offset * (segment.b + offset * segment.a)),
        slope:
          offset === segment.width
            ? segment.endSlope
            : segment.startSlope +
              offset * (2 * segment.b + 3 * segment.a * offset),
        from: segment.start.x,
        to: segment.end.x,
      }
    },
  }
}
