import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultGrowthSettings,
  defaultPlanSettings,
  growthSettingsError,
  planSettingsError,
} from "./research-settings.ts"
import { analyzeMeasurements } from "./culture-monitoring.ts"

test("custom settings validate numeric boundaries and bounded local workloads", () => {
  assert.equal(
    growthSettingsError({
      ...defaultGrowthSettings,
      horizon: 37,
      paths: 123,
      drift: -0.01,
      volatility: 0,
    }),
    "",
  )
  assert.ok(
    growthSettingsError({
      ...defaultGrowthSettings,
      horizon: 720,
      paths: 2000,
    }),
  )
  assert.ok(growthSettingsError({ ...defaultGrowthSettings, seed: NaN }))
  assert.ok(growthSettingsError({ ...defaultGrowthSettings, lookbackHours: 0 }))
  assert.ok(planSettingsError({ ...defaultPlanSettings, noise: 0 }))
  assert.equal(planSettingsError({ ...defaultPlanSettings, noise: null }), "")
  assert.equal(
    planSettingsError({
      ...defaultPlanSettings,
      lengthScale: 1.2,
      noise: 0.1,
      exploration: 2,
    }),
    "",
  )
})

test("decline count, minimum percentage, disabling and missing-data breaks affect warnings", () => {
  const samples = [100, 95, 90, 80].map((count, hour) => ({
    count,
    hour,
    unit: "million cells",
  }))
  assert.equal(
    analyzeMeasurements(samples, 3, {
      declineCount: 1,
      dropPercent: 10,
      staleHours: null,
    }).events.length,
    1,
  )
  assert.equal(
    analyzeMeasurements(samples, 3, {
      declineCount: 3,
      dropPercent: 0,
      staleHours: null,
    }).events.length,
    1,
  )
  assert.equal(
    analyzeMeasurements(samples, 3, {
      declineCount: 0,
      dropPercent: 0,
      staleHours: null,
    }).events.length,
    0,
  )
  const broken = samples.map((sample, i) =>
    i === 1 ? { ...sample, count: null } : sample,
  )
  assert.ok(
    !analyzeMeasurements(broken, 3, {
      declineCount: 3,
      dropPercent: 0,
      staleHours: null,
    }).events.some((event) => event.status === "warning"),
  )
})
