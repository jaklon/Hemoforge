import assert from "node:assert/strict"
import test from "node:test"
import { createSmoothCurve } from "./smooth-curve.ts"

test("smooth curves preserve turning points and continuous slopes without overshoot", () => {
  const points = [
    { x: 0, y: 1 },
    { x: 24, y: 3 },
    { x: 48, y: 2 },
    { x: 72, y: 2 },
    { x: 96, y: 5 },
  ]
  const curve = createSmoothCurve(points)
  for (const point of points) {
    assert.equal(curve.at(point.x).value, point.y)
  }
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1]
    const end = points[i]
    for (let x = start.x; x <= end.x; x += 0.1) {
      assert.ok(curve.at(x).value >= Math.min(start.y, end.y) - 1e-12)
      assert.ok(curve.at(x).value <= Math.max(start.y, end.y) + 1e-12)
    }
    if (i < points.length - 1) {
      assert.ok(
        Math.abs(
          curve.at(end.x - 0.0001).slope - curve.at(end.x + 0.0001).slope,
        ) < 0.0001,
      )
    }
  }
  assert.equal(curve.at(24).slope, 0)
  assert.equal(curve.at(60).value, 2)
  assert.equal(curve.at(-5).value, 1)
  assert.equal(curve.at(100).value, 5)
  assert.equal((curve.path.match(/ C/g) ?? []).length, points.length - 1)
  assert.ok(!curve.path.includes("NaN"))
})
