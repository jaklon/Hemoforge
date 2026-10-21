import test from "node:test"
import assert from "node:assert/strict"
import {
  panRange,
  zoomRange,
  valueExtent,
  plotNumber,
} from "./plot-navigation.ts"

test("zoom preserves the pointer anchor and pan stays inside the source window", () => {
  assert.deepEqual(zoomRange([0, 100], [0, 100], 0.5, 0.25), [12.5, 62.5])
  assert.deepEqual(panRange([12.5, 62.5], [0, 100], 10), [50, 100])
  assert.deepEqual(zoomRange([30, 40], [0, 100], 100), [0, 100])
  assert.ok(zoomRange([0, 100], [0, 100], 0)[1] > 0)
})

test("logarithmic extents exclude non-positive values and support tiny positive values", () => {
  const extent = valueExtent([0, -1, 0.001, 1000], true)
  assert.ok(extent[0] < -3 && extent[1] > 3)
  assert.ok(valueExtent([1, 1], true)[0] < valueExtent([1, 1], true)[1])
  assert.deepEqual(valueExtent([], false), [0, 1])
  assert.equal(plotNumber(131.03666764444705), "131.04")
  assert.equal(plotNumber(0.00001), "1.00e-5")
})
