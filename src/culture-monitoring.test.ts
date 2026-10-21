import test from "node:test"
import assert from "node:assert/strict"
import {
  analyzeMeasurements,
  batchMeasurements,
  checkpointReports,
  demoSource,
  screenProfiles,
} from "./culture-monitoring.ts"

test("replay never exposes future measurements or warnings", () => {
  for (let cursor = 0; cursor <= 168; cursor++) {
    const result = analyzeMeasurements(batchMeasurements(1), cursor)
    assert.ok(result.visible.every((sample) => sample.hour <= cursor))
    assert.ok(result.events.every((event) => event.hour <= cursor))
    assert.equal(result.events.length, cursor >= 120 ? 1 : 0)
  }
  const result = analyzeMeasurements(batchMeasurements(1), 120)
  assert.equal(result.latest?.count, 3.31)
  assert.equal(result.foldChange, 3.31 / 1.02)
  assert.equal(result.growthRate, Math.log(3.31 / 3.62) / 24)
})

test("missing, zero, duplicate, out-of-order and wrong-unit data never yield derived results", () => {
  const start = { hour: 0, count: 1, unit: demoSource.unit }
  for (const bad of [
    { hour: 24, count: 0, unit: demoSource.unit },
    { hour: 24, count: null, unit: demoSource.unit },
    { hour: 0, count: 2, unit: demoSource.unit },
    { hour: -1, count: 2, unit: demoSource.unit },
    { hour: 24, count: 2, unit: "cells/mL" },
  ]) {
    const result = analyzeMeasurements([start, bad], 48)
    assert.equal(result.status, "needs_review")
    assert.equal(result.foldChange, null)
    assert.equal(result.growthRate, null)
  }
  assert.equal(analyzeMeasurements([], 0).status, "no_data")
  assert.equal(analyzeMeasurements([start], 0).growthRate, null)
  assert.equal(
    analyzeMeasurements([{ ...start, hour: 24 }, start], 48).status,
    "needs_review",
  )
})

test("three-hour reports retain the original measurement times and say when there is no new data", () => {
  const reports = checkpointReports(1, 120, "2026-10-21T00:00:00Z")
  assert.equal(reports.length, 40)
  assert.equal(reports[6].checkpoint_hour, 21)
  assert.equal(reports[6].last_measurement_hour, 0)
  assert.match(reports[6].summary, /No new measurements/)
  assert.equal(reports[7].checkpoint_hour, 24)
  assert.equal(reports[7].new_measurements, 1)
  assert.equal(reports[7].change_since_previous, 1.47 - 1.02)
  for (const report of reports) {
    assert.ok(report.last_measurement_hour! <= report.checkpoint_hour)
    assert.ok(
      report.open_warnings.every(
        (event) => event.hour <= report.checkpoint_hour,
      ),
    )
    assert.equal(report.quality_flag, "software_test_only")
    assert.equal(report.generated_at, "2026-10-21T00:00:00Z")
  }
  assert.equal(checkpointReports(1, 504).length, 56)
})

test("screening recomputes from both selectors and unknown calls are never matched", () => {
  const initial = screenProfiles("G/A", "G/G")
  assert.equal(initial.filter((row) => row.status === "match").length, 2)
  assert.equal(initial.filter((row) => row.status === "unknown").length, 2)
  assert.equal(
    screenProfiles("G/G", "G/A").filter((row) => row.status === "match").length,
    1,
  )
  assert.equal(
    screenProfiles("A/A", "A/A").filter((row) => row.status === "match").length,
    0,
  )
})
