import assert from "node:assert/strict"
import test from "node:test"
import { exchangeAction, limitProblem, processVariables, simulate } from "./dashboard-sim.ts"

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
