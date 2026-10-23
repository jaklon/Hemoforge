import assert from "node:assert/strict"
import test from "node:test"
import { appPageFromHash } from "./app-routing.ts"
import {
  labSessionFromHash,
  liveModuleFromHash,
  pocLabHash,
  pocMonitorHash,
  pocRouteFromHash,
} from "./lab-session.ts"

test("PoC monitors have dedicated routes, and main module routes stay in the research workspace", () => {
  const id = "a".repeat(32)
  assert.equal(appPageFromHash("#poc"), "poc")
  assert.equal(appPageFromHash(pocLabHash()), "lab")
  assert.equal(labSessionFromHash(pocLabHash(id)), id)
  for (const module of ["dashboard", "guard", "pilot", "plan"] as const) {
    assert.equal(appPageFromHash(`#${module}`), "workspace")
    const hash = pocMonitorHash(id, module)
    assert.equal(appPageFromHash(hash), "live")
    assert.equal(labSessionFromHash(hash), id)
    assert.equal(liveModuleFromHash(hash), module)
    assert.equal(appPageFromHash(`#${module}/live/${id}`), "live")
    assert.equal(labSessionFromHash(`#${module}/live/${id}`), id)
  }
  assert.equal(appPageFromHash(""), "landing")
  assert.equal(appPageFromHash("#work-with-us"), "business")
})

test("invalid or incomplete PoC links cannot fall back into a demo module or create a session", () => {
  for (const hash of [
    "#poc/monitor",
    "#poc/lab/../../secrets",
    "#poc/monitor/invalid/guard",
    `#poc/monitor/${"a".repeat(32)}/data`,
    "#guard/live/invalid",
  ]) {
    assert.equal(appPageFromHash(hash), "poc")
    assert.equal(pocRouteFromHash(hash)?.kind, "invalid")
    assert.equal(labSessionFromHash(hash), null)
  }
  assert.throws(() => pocLabHash("../../secrets"))
  assert.throws(() => pocMonitorHash("wrong"))
  assert.equal(pocRouteFromHash("#dashboard"), null)
})
