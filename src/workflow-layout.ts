type Point = Record<"x" | "y", number>

export type WorkflowView = Record<"zoom" | "x" | "y", number>

export function clampWorkflowView(
  view: WorkflowView,
  width: number,
  height: number,
): WorkflowView {
  const zoom = Math.max(0.75, Math.min(2, view.zoom))
  const limitX = Math.max(0, ((zoom - 1) * width) / 2)
  const limitY = Math.max(0, ((zoom - 1) * height) / 2)
  return {
    zoom,
    x: limitX === 0 ? 0 : Math.max(-limitX, Math.min(limitX, view.x)),
    y: limitY === 0 ? 0 : Math.max(-limitY, Math.min(limitY, view.y)),
  }
}

export function getWorkflowLayout(width: number) {
  const stacked = width < 820
  const nodeWidth = stacked ? Math.min(160, (width - 32) / 2) : 160
  const points: Record<string, Point> = stacked
    ? {
        rarematch: { x: width * 0.25, y: 74 },
        erythropilot: { x: width * 0.75, y: 74 },
        cultureplan: { x: width * 0.25, y: 244 },
        bioreactor: { x: width * 0.75, y: 244 },
        harvest: { x: width * 0.5, y: 414 },
      }
    : {
        rarematch: { x: width * 0.115, y: 150 },
        erythropilot: { x: width * 0.35, y: 150 },
        cultureplan: { x: width * 0.615, y: 70 },
        bioreactor: { x: width * 0.615, y: 240 },
        harvest: { x: width * 0.885, y: 150 },
      }
  const connections = [
    ["rarematch", "erythropilot"],
    ["erythropilot", "cultureplan"],
    ["erythropilot", "bioreactor"],
    ["cultureplan", "harvest"],
    ["bioreactor", "harvest"],
  ].map(([from, to]) => {
    const horizontal = !stacked || from === "rarematch"
    const source = points[from]
    const target = points[to]
    const start = horizontal
      ? { x: source.x + (stacked ? nodeWidth / 2 : 38), y: source.y }
      : { x: source.x, y: source.y + 50 }
    const end = horizontal
      ? { x: target.x - (stacked ? nodeWidth / 2 : 38), y: target.y }
      : { x: target.x, y: target.y - 50 }
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2
    return {
      from,
      to,
      path: horizontal
        ? `M${start.x} ${start.y} C${midX} ${start.y} ${midX} ${end.y} ${end.x} ${end.y}`
        : `M${start.x} ${start.y} C${start.x} ${midY} ${end.x} ${midY} ${end.x} ${end.y}`,
    }
  })
  return {
    stacked,
    nodeWidth,
    height: stacked ? 520 : 340,
    points,
    connections,
  }
}
