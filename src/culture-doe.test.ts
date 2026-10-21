import assert from "node:assert/strict"
import test from "node:test"
import { doeEffects, formatDoeValue } from "./culture-doe.ts"

test("DOE plots and effect values agree with the four recorded condition means", () => {
  assert.equal(formatDoeValue(doeEffects.lactate.low), "7.13")
  assert.equal(formatDoeValue(doeEffects.lactate.high), "4.59")
  assert.equal(formatDoeValue(doeEffects.lactate.effect), "−2.54")
  assert.equal(formatDoeValue(doeEffects.ammonia.effect), "−1.39")
  assert.equal(formatDoeValue(doeEffects.interaction.effect), "0.05")
  assert.deepEqual(doeEffects.interaction.ammoniaLow, [7.84, 5.26])
  assert.deepEqual(doeEffects.interaction.ammoniaHigh, [6.41, 3.92])
})
