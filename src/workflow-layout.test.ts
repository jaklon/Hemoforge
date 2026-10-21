import assert from "node:assert/strict"
import test from "node:test"
import { clampWorkflowView, getWorkflowLayout } from "./workflow-layout.ts"

test("all workflow nodes and labels fit phone, panel, and desktop widths", () => {
  for (const width of [250, 280, 320, 341, 550, 819, 820, 960, 1040]) {
    const layout = getWorkflowLayout(width)
    for (const point of Object.values(layout.points)) {
      assert.ok(point.x - layout.nodeWidth / 2 >= 8, `left edge at ${width}`)
      assert.ok(
        point.x + layout.nodeWidth / 2 <= width - 8,
        `right edge at ${width}`,
      )
      assert.ok(point.y - (layout.stacked ? 50 : 38) >= 20)
      assert.ok(point.y + 90 <= layout.height)
    }
    assert.equal(layout.connections.length, 5)
    assert.equal(
      layout.connections.filter((edge) => edge.from === "erythropilot").length,
      2,
    )
    assert.equal(
      layout.connections.filter((edge) => edge.to === "harvest").length,
      2,
    )
    assert.ok(layout.connections.every((edge) => !edge.path.includes("NaN")))
  }
})

test("zoom and pan stay bounded and fitting restores the entire map", () => {
  assert.deepEqual(clampWorkflowView({ zoom: 1, x: 200, y: -200 }, 600, 520), {
    zoom: 1,
    x: 0,
    y: 0,
  })
  assert.deepEqual(
    clampWorkflowView({ zoom: 1.5, x: 1000, y: -1000 }, 600, 520),
    { zoom: 1.5, x: 150, y: -130 },
  )
  assert.equal(clampWorkflowView({ zoom: 10, x: 0, y: 0 }, 600, 520).zoom, 2)
  assert.equal(
    clampWorkflowView({ zoom: 0.1, x: 0, y: 0 }, 600, 520).zoom,
    0.75,
  )
  assert.deepEqual(
    clampWorkflowView({ zoom: 0.75, x: 100, y: 100 }, 600, 520),
    { zoom: 0.75, x: 0, y: 0 },
  )
})
