import assert from "node:assert/strict"
import test from "node:test"
import {
  summarizeGuardBatch,
  guardSeries,
  guardEventInfo,
  sampleSteps,
} from "./guard-insights.ts"
import { defaultMonitoringSettings } from "./research-settings.ts"

const samples = [1, 2, 1.8, 1.6, 4].map((count, i) => ({
  hour: i * 12,
  count,
  unit: "million cells",
}))

test("Guard summarizes only measurements at the cutoff and distinguishes decline from missing data", () => {
  const state = summarizeGuardBatch(samples, 36.5)
  assert.equal(state.latest?.count, 1.6)
  assert.equal(state.sampleAge, 0.5)
  assert.ok(Math.abs(state.percentChange! - ((1.6 - 1.8) / 1.8) * 100) < 1e-10)
  assert.equal(state.trend, "Declining")
  assert.equal(state.priority, 2)
  assert.equal(summarizeGuardBatch([], 36).trend, "Awaiting comparison")
  assert.equal(
    summarizeGuardBatch([{ ...samples[0], count: null }], 36).percentChange,
    null,
  )
  assert.equal(summarizeGuardBatch(samples, 12).events.length, 0)
})

test("chart segments never bridge missing rows or reveal future samples", () => {
  const broken = samples.map((sample, i) =>
    i === 2 ? { ...sample, count: null } : sample,
  )
  const state = summarizeGuardBatch(broken, 36)
  const segments = guardSeries(state, 0, "count")
  assert.deepEqual(
    segments.map((segment) => segment.map((point) => point.hour)),
    [[0, 12], [36]],
  )
  assert.deepEqual(guardSeries(state, 0, "fold"), [])
  const valid = summarizeGuardBatch(samples, 36)
  assert.equal(guardSeries(valid, 0, "fold")[0][1].value, 2)
  assert.deepEqual(
    guardSeries(valid, 24, "count")[0].map((point) => point.hour),
    [24, 36],
  )
})

test("sample navigation preserves irregular and fractional source times", () => {
  const irregular = [0, 2.5, 9.75].map((hour) => ({
    hour,
    count: 1,
    unit: "million cells",
  }))
  assert.deepEqual(sampleSteps(irregular, 2.5), {
    previous: 0,
    next: 9.75,
    last: 9.75,
  })
  assert.equal(sampleSteps(irregular, 0).previous, null)
  assert.equal(sampleSteps(irregular, 10).next, null)
})

test("warning labels follow the configured rule and distinguish stale samples", () => {
  const settings = {
    ...defaultMonitoringSettings,
    declineCount: 1,
    staleHours: 1,
  }
  const state = summarizeGuardBatch(samples, 37.5, settings)
  assert.equal(
    guardEventInfo(
      state.events.find((event) => event.variable === "sample_age")!,
      settings,
    ).title,
    "Sample age exceeds your limit",
  )
  assert.equal(
    guardEventInfo(
      state.events.find((event) => event.variable === "cell_count")!,
      settings,
    ).title,
    "1 consecutive decline",
  )
})
