import assert from "node:assert/strict"
import test from "node:test"
import {
  bloodTargetError,
  cellsPerUnit,
  defaultBloodTarget,
  literatureGrowth,
  metaboliteStatus,
  planBloodTarget,
  stageWindowHours,
} from "./blood-target.ts"
import { batchMeasurements } from "./culture-monitoring.ts"

test("fold expansion, doublings and time to target follow the log-growth fit", () => {
  const plan = planBloodTarget({ ...defaultBloodTarget, units: 2 }, [
    { hour: 0, count: 1, unit: "million cells" },
    { hour: 24, count: 2, unit: "million cells" },
    { hour: 48, count: 4, unit: "million cells" },
  ])
  assert.equal(plan.startCells, 4e6)
  assert.equal(plan.targetCells, 2 * cellsPerUnit)
  assert.equal(plan.fold, 1e6)
  assert.ok(Math.abs(plan.doublings - Math.log2(1e6)) < 1e-9)
  // A clean doubling every 24 h must come back as a 24 h doubling time.
  assert.ok(Math.abs(plan.doublingHours - 24) < 1e-9)
  assert.ok(Math.abs(plan.hours - plan.doublings * 24) < 1e-6)
  assert.equal(plan.stages, Math.ceil(plan.hours / stageWindowHours))
  assert.equal(plan.rate.source, "fitted")
  assert.equal(plan.group, "O−")
})

test("a non-growing batch falls back to the published static rate with a warning", () => {
  const plan = planBloodTarget(defaultBloodTarget, [
    { hour: 0, count: 4, unit: "million cells" },
    { hour: 24, count: 2, unit: "million cells" },
    { hour: 48, count: 1, unit: "million cells" },
  ])
  assert.equal(plan.rate.source, "static")
  assert.equal(plan.rate.perHour, literatureGrowth.static.perHour)
  assert.ok(plan.warnings.some((note) => note.includes("not positive")))
})

test("the bundled batch needs a multi-stage plan for one unit", () => {
  const plan = planBloodTarget(defaultBloodTarget, batchMeasurements(1))
  assert.equal(plan.startHour, 168)
  assert.ok(plan.fold > 1e5)
  assert.ok(plan.stages > 1)
  assert.ok(plan.warnings.some((note) => note.includes("expansion stages")))
})

test("targets outside the supported range are refused", () => {
  assert.equal(bloodTargetError({ ...defaultBloodTarget, units: 0 }), "Target must be between 0 and 1,000 adult units.")
  assert.equal(bloodTargetError({ ...defaultBloodTarget, units: 1001 }), "Target must be between 0 and 1,000 adult units.")
  assert.equal(bloodTargetError(defaultBloodTarget), "")
  assert.throws(() => planBloodTarget({ ...defaultBloodTarget, units: -1 }, batchMeasurements(1)))
  assert.throws(() =>
    planBloodTarget(defaultBloodTarget, [
      { hour: 0, count: null, unit: "million cells" },
    ]),
  )
})

test("metabolite thresholds separate below, inhibitory and lethal conditions", () => {
  assert.equal(metaboliteStatus(0, 0).worst, "below")
  assert.equal(metaboliteStatus(850, 41).worst, "below")
  assert.equal(metaboliteStatus(1400, 41).lactate.status, "inhibitory")
  assert.equal(metaboliteStatus(1400, 41).worst, "inhibitory")
  assert.equal(metaboliteStatus(0, 70).ammonia.status, "inhibitory")
  assert.equal(metaboliteStatus(2700, 41).worst, "lethal")
  assert.equal(metaboliteStatus(0, 129).worst, "lethal")
})
