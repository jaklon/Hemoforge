import assert from "node:assert/strict"
import test from "node:test"
import { exchangeAction, limitProblem, measuredSamples, processVariables, readings, reading, simulate, valueAt } from "./dashboard-sim.ts"

const defaults = Object.fromEntries(processVariables.map((variable) => [variable.id, variable.limits]))

test("automatic corrections move values toward the setpoint", () => {
  const results = simulate(defaults, 168)
  for (const variable of processVariables) {
    const { samples, actions } = results[variable.id]
    assert.equal(samples.length, 169)
    assert.equal(limitProblem(variable.limits), null, variable.id)
    for (const action of actions) {
      assert.ok(
        action.side === "low" ? action.after > action.before : action.after < action.before,
        `${variable.id} correction at ${action.hour}h moves toward the setpoint`,
      )
    }
  }
  const glucose = defaults.glucose
  assert.ok(results.glucose.actions.some((action) => action.label !== exchangeAction))
  const manual = simulate({ ...defaults, glucose: { ...glucose, auto: false } }, 168)
  assert.ok(manual.glucose.actions.every((action) => action.label === exchangeAction))
})

test("one medium exchange moves every fresh-medium variable at the same hour", () => {
  const results = simulate({ ...defaults, lactate: { ...defaults.lactate, actHigh: 10 } }, 168)
  const trigger = results.lactate.actions.find((action) => action.label === exchangeAction)!
  assert.equal(trigger.linkedFrom, undefined)
  for (const id of ["ammonia", "osmolality", "glucose", "glutamine"]) {
    const linked = results[id].actions.find((action) => action.hour === trigger.hour)
    assert.equal(linked?.linkedFrom, "lactate", id)
  }
  assert.ok(results.glucose.actions.find((action) => action.hour === trigger.hour)!.after > 0)
  assert.equal(results.ph.actions.some((action) => action.hour === trigger.hour && action.label === exchangeAction), false)
})

test("measured variables follow the batch data and are never corrected", () => {
  const rows = [
    { hour: 0, channels: { lactate_mmol_l: 0, glucose_mmol_l: 20 } },
    { hour: 24, channels: { lactate_mmol_l: 30, glucose_mmol_l: 5 } },
  ]
  const measured = measuredSamples(rows)
  assert.deepEqual(Object.keys(measured).sort(), ["glucose", "lactate"])
  assert.equal(valueAt(measured.lactate, 12), 15)
  assert.equal(valueAt(measured.lactate, 48), 30)
  const results = simulate(defaults, 48, measured)
  assert.equal(results.lactate.samples[12].value, 15)
  assert.ok(Math.abs(results.glucose.samples[0].value - 20 * 0.18016) < 1e-9)
  // Lactate passes its action limit and glucose its low limit, but measured data is left as recorded.
  assert.equal(results.lactate.actions.length, 0)
  assert.equal(results.glucose.actions.length, 0)
  assert.ok(results.ph.samples.length === 49)
})

test("readings land on whole seconds with bounded, repeatable noise", () => {
  const ph = processVariables.find((variable) => variable.id === "ph")!
  const trajectory = [{ hour: 0, value: 7.2 }, { hour: 1, value: 7.1 }]
  const window = readings(ph, trajectory, 0.5, 0.5 + 60 / 3600)
  assert.equal(window.length, 61)
  for (const sample of window) {
    assert.ok(Number.isInteger(Math.round(sample.hour * 3600 * 1e6) / 1e6))
    assert.ok(Math.abs(sample.value - valueAt(trajectory, sample.hour)) <= ph.noise / 2)
    assert.equal(sample.value, reading(ph, trajectory, sample.hour))
  }
  assert.ok(new Set(window.map((sample) => sample.value)).size > 50, "noise varies second to second")
  assert.ok(readings(ph, trajectory, 0, 1).length <= 302, "long windows are thinned")
})

test("live hour follows the clock from 24/10/2026 00:00 and stops at two days", async () => {
  const { liveEndHour, liveHour, liveStart, wallTime } = await import("./culture-monitoring.ts")
  const start = liveStart.getTime()
  assert.equal(liveHour(start - 1000), 0)
  assert.equal(liveHour(start + 90_500), 90 / 3600)
  assert.equal(liveHour(start + 100 * 3_600_000), liveEndHour)
  assert.equal(wallTime(liveEndHour - 1 / 3600), "25/10/2026, 23:59:59")
})
