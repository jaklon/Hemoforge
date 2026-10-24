import assert from "node:assert/strict"
import test from "node:test"
import {
  AnimationClock,
  labSessionFromHash,
  liveModuleFromHash,
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
    schema_version: 3,
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
    assay_stage: "complete",
    protocol: {
      animation_seconds: 8,
      culture_minutes: 4.5,
      analyzed_volume_ml: 0.275,
    },
    scenario: "balanced",
    seed: 42,
    working_volume_ml: 499,
    withdrawn_volume_ml: 1,
    added_volume_ml: 0,
    exchanged_volume_ml: 0,
    operator_paired: false,
    interventions: [],
    active_intervention: null,
    intervention_protocol: {
      animation_seconds: 4,
      culture_minutes: 3,
      max_volume_ml: 550,
      decision_max_age_hours: 24,
    },
    uncertainty_model: {
      density_cv: 0.025,
      chemistry_cv: 0.02,
      ph_sd: 0.01,
      viability_sd_percentage_points: 0.5,
    },
    assays: [],
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
        count: 998,
        unit: "million cells",
        channels: { ph: 7.2, lactate_mmol_l: 3.48 },
        volume_ml: 499,
        viable_cell_density_million_ml: 2,
        model_version: "test-v1",
        evidence: "software_test_only",
        withdrawal_ml: 1,
        analyzed_volume_ml: 0.275,
        reactor_volume_before_ml: 500,
        reactor_volume_after_ml: 499,
        mixed: true,
        quality: { status: "passed", flags: [] },
        uncertainty: {
          density_cv: 0.025,
          chemistry_cv: 0.02,
          ph_sd: 0.01,
          viability_sd_percentage_points: 0.5,
        },
      },
    ],
  }
  const file = liveCultureFile(source)
  assert.equal(file.evidence, "software_test_only")
  assert.equal(file.rows[0].hour, 24)
  assert.equal(file.rows[0].unit, "million cells")
  assert.equal(file.rows[0].count, 998)
  assert.equal(file.sha256, source.measurements_sha256)
  assert.equal(liveCultureFile({ ...source, measurements: [] }).rows.length, 0)
  assert.equal(
    liveCultureFile({ ...source, culture_hours: 24.074 }).rows.length,
    0,
  )
  assert.equal(
    liveCultureFile({
      ...source,
      measurements: [
        {
          ...source.measurements[0],
          quality: {
            status: "rejected",
            flags: ["insufficient_sample_volume"],
          },
        },
      ],
    }).rows.length,
    0,
  )
})

test("session routes and assay actions cannot skip a workflow stage", () => {
  const id = "a".repeat(32)
  assert.equal(labSessionFromHash(`#guard/live/${id}`), id)
  assert.equal(labSessionFromHash(`#pilot/live/${id}`), id)
  assert.equal(labSessionFromHash(`#plan/live/${id}`), id)
  assert.equal(liveModuleFromHash(`#pilot/live/${id}`), "pilot")
  assert.equal(liveModuleFromHash(`#plan/live/${id}`), "plan")
  assert.equal(labSessionFromHash("#pilot"), null)
  assert.equal(labSessionFromHash(`#lab/${id}`), id)
  assert.equal(labSessionFromHash("#guard/live/../../secrets"), null)
  assert.equal(nextLabAction("idle"), "collect")
  assert.equal(nextLabAction("collected"), "load")
  assert.equal(nextLabAction("loaded"), "analyze")
  assert.equal(nextLabAction("analyzing"), null)
  assert.equal(nextLabAction("intervening"), null)
})
