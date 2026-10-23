import assert from "node:assert/strict"
import test from "node:test"
import { overallHealth, plannedPhase, trendHealth } from "./pilot-insights.ts"

const row = (hour: number, count: number | null, channels: Record<string, number | null>) =>
  ({ hour, count, unit: "million", batch_id: "B", cell_line: "BEL-A", channels }) as never

const rows = [
  row(0, 1, { lactate_mmol_l: 2, glucose_mmol_l: 20, ph: 7.3 }),
  row(24, 2, { lactate_mmol_l: 6, glucose_mmol_l: 19.5, ph: 7.1 }),
  row(48, null, { lactate_mmol_l: null }),
]

test("judges each variable by its healthy direction", () => {
  const items = Object.fromEntries(trendHealth(rows, 48).map((item) => [item.key, item]))
  assert.equal(items.count.verdict, "improving")
  assert.equal(items.lactate_mmol_l.verdict, "worsening")
  assert.equal(items.glucose_mmol_l.verdict, "stable")
  assert.equal(items.ph.verdict, "worsening")
  assert.equal(items.ammonia_mmol_l.verdict, "no_data")
})

test("ignores samples after the replay hour", () => {
  const count = trendHealth(rows, 10).find((item) => item.key === "count")!
  assert.equal(count.verdict, "no_data")
  assert.equal(count.note, "Needs a second sample")
})

test("overall health flags worsening trends and open warnings", () => {
  const items = trendHealth(rows, 48)
  assert.equal(overallHealth(items, 0).tone, "warning")
  assert.equal(overallHealth(trendHealth(rows, 10), 0).tone, "no_data")
  assert.match(overallHealth(items.filter((item) => item.key === "count"), 2).label, /2 open Guard warnings/)
})

test("roadmap phases cover the 21 days", () => {
  assert.equal(plannedPhase(0).name, "Expansion")
  assert.equal(plannedPhase(200).name, "Differentiation")
  assert.equal(plannedPhase(600).name, "Maturation")
})
