import assert from "node:assert/strict"
import test from "node:test"
import {
  AnimationClock,
  labSessionFromHash,
  liveCultureFile,
  nextLabAction,
  type LabSnapshot,
} from "./lab-session.ts"

test("animation clock excludes stalls, hidden time, pauses, and invalid frame durations", () => {
  const clock = new AnimationClock()
  assert.equal(clock.frame(0.1, true), 0)
  assert.equal(clock.frame(0.15, true), 0.25)
  assert.equal(clock.frame(30, true), 0)
  assert.equal(clock.frame(0.2, false), 0)
  assert.equal(clock.frame(Number.NaN, true), 0)
  assert.equal(clock.frame(0.1, true), 0)
})

test("Guard adapter consumes released observations at collection time and preserves units", () => {
  const source: LabSnapshot = {
    type: "snapshot",
    schema_version: 1,
    session_id: "a".repeat(32),
    model_version: "test-v1",
    revision: 1,
    ack_seq: 1,
    end_hour: 168,
    speed: 6,
    running: false,
    phase: "complete",
    controller_connected: true,
    reason: "test",
    analysis_progress: 1,
    sample: null,
    batch_id: "VL-A",
    created_at: "2026-10-23T00:00:00Z",
    measurements_sha256: "a".repeat(64),
    culture_hours: 24.075,
    measurements: [
      {
        sample_id: "FLEX2-001",
        collected_at_hour: 24,
        available_at_hour: 24.075,
        count: 1000,
        unit: "million cells",
        channels: { ph: 7.2, lactate_mmol_l: 3.48 },
        volume_ml: 500,
        viable_cell_density_million_ml: 2,
        model_version: "test-v1",
        evidence: "software_test_only",
      },
    ],
  }
  const file = liveCultureFile(source)
  assert.equal(file.evidence, "software_test_only")
  assert.equal(file.rows[0].hour, 24)
  assert.equal(file.rows[0].unit, "million cells")
  assert.equal(file.rows[0].count, 1000)
  assert.equal(file.sha256, source.measurements_sha256)
  assert.equal(liveCultureFile({ ...source, measurements: [] }).rows.length, 0)
})

test("session routes and assay actions cannot skip a workflow stage", () => {
  const id = "a".repeat(32)
  assert.equal(labSessionFromHash(`#guard/live/${id}`), id)
  assert.equal(labSessionFromHash(`#lab/${id}`), id)
  assert.equal(labSessionFromHash("#guard/live/../../secrets"), null)
  assert.equal(nextLabAction("idle"), "collect")
  assert.equal(nextLabAction("collected"), "load")
  assert.equal(nextLabAction("loaded"), "analyze")
  assert.equal(nextLabAction("analyzing"), null)
})
