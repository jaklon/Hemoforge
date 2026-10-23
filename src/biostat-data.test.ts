import assert from "node:assert/strict"
import test from "node:test"
import { biostatProcessData } from "./biostat-data.ts"
import {
  liveCultureFile,
  liveSensorRows,
  type LabSnapshot,
  type SensorReading,
} from "./lab-session.ts"
import { decisionBlockReason } from "./lab-interventions.ts"
import { liveAnalysisHold, liveSegment } from "./lab-live-analytics.ts"

function reading(
  device: SensorReading["device"],
  channels: Record<string, number>,
): SensorReading {
  return {
    id: `${device.toUpperCase()}-00100`,
    device,
    source_kind: "virtual_sensor",
    measured_at_hour: 1,
    available_at_hour: 1.1,
    expires_at_hour: 4,
    channels,
    quality: { status: "passed", flags: [] },
    stage: "expansion",
    volume_ml: 12500,
    model_version: "test",
  }
}
function state(): LabSnapshot {
  return {
    schema_version: 4,
    batch_id: "VL-TEST",
    created_at: "test",
    culture_hours: 2,
    end_hour: 168,
    device_profile: { id: "biostat-str-gen2", feed_multiplier_ml: 50 },
    stage: "expansion",
    stage_start_hour: 0,
    controller: { events: [] },
    controller_connected: true,
    active_intervention: null,
    phase: "complete",
    working_volume_ml: 12500,
    interventions: [],
    assays: [],
    intervention_protocol: {
      culture_minutes: 3,
      max_volume_ml: 50000,
      decision_max_age_hours: 3,
    },
    measurements_sha256: "a".repeat(64),
    sensor_readings: [
      reading("core", { ph: 7.3, dissolved_oxygen: 40, temperature: 37 }),
      reading("trace", { glucose_mmol_l: 12, lactate_mmol_l: 2 }),
      reading("viamass", { capacitance_pf_cm: 1.2 }),
    ],
    measurements: [
      {
        sample_id: "PAT-00100",
        collected_at_hour: 1,
        available_at_hour: 1.02,
        count: 15000,
        viable_cell_density_million_ml: 1.2,
        unit: "million cells",
        source_kind: "model_estimate",
        source_sensor_ids: ["VIAMASS-00100", "TRACE-00100"],
        quality: { status: "passed", flags: [] },
        channels: { ph: 7.3, glucose_mmol_l: 12 },
      },
    ],
  } as unknown as LabSnapshot
}

test("PAT dashboard separates six sensor signals, two estimates and six missing assays", () => {
  const rows = biostatProcessData(state())
  assert.equal(
    rows.filter((r) => r.origin === "virtual_sensor" && r.latest).length,
    6,
  )
  assert.equal(
    rows.filter((r) => r.origin === "model_estimate" && r.latest).length,
    2,
  )
  assert.equal(
    rows.filter((r) => r.origin === "unmeasured" && !r.latest).length,
    6,
  )
  assert.equal(rows.find((r) => r.id === "count")!.latest!.value, 15000)
  assert.equal(
    rows.find((r) => r.id === "capacitance_pf_cm")!.latest!.value,
    1.2,
  )
})

test("future releases, QC faults and expired sensors cannot become current values", () => {
  const s = state()
  s.sensor_readings!.find((r) => r.device === "trace")!.available_at_hour = 3
  assert.equal(
    biostatProcessData(s).find((r) => r.id === "glucose_mmol_l")!.latest,
    null,
  )
  s.sensor_readings!.push({
    ...reading("trace", {}),
    quality: { status: "rejected", flags: ["fault"] },
  })
  assert.equal(
    biostatProcessData(s).find((r) => r.id === "lactate_mmol_l")!.status,
    "fault",
  )
  s.culture_hours = 5
  assert.equal(
    biostatProcessData(s).find((r) => r.id === "count")!.status,
    "stale",
  )
  assert.equal(
    biostatProcessData(s).find((r) => r.id === "count")!.latest,
    null,
  )
})

test("Guard count input is attributed as estimated; chemistry retains its own timestamps", () => {
  const s = state()
  s.sensor_readings![1].measured_at_hour = 0
  const file = liveCultureFile(s)
  assert.match(file.name, /estimated cell count/)
  assert.match(file.rows[0].cell_line, /uncalibrated/)
  assert.deepEqual(file.rows[0].channels, {})
  const rows = liveSensorRows(s)
  assert.equal(rows[0].hour, 0)
  assert.equal(rows[0].channels.glucose_mmol_l, 12)
  assert.equal(rows[0].count, null)
  assert.equal(rows[1].channels.do_percent, 40)
  assert.equal(rows[1].channels.temperature_c, 37)
  assert.equal(rows[1].channels.glucose_mmol_l, undefined)
})

test("Guard accepts fresh reviewed PAT sources, scales feed volume and blocks failed sensors", () => {
  const s = state()
  assert.equal(decisionBlockReason(s, "feed", 10, "PAT-00100"), "")
  assert.match(
    decisionBlockReason({ ...s, working_volume_ml: 49900 }, "feed", 10),
    /50000/,
  )
  s.sensor_readings!.push({
    ...reading("trace", {}),
    quality: { status: "rejected", flags: ["fault"] },
  })
  assert.match(decisionBlockReason(s, "feed", 10), /QC/)
  assert.match(liveAnalysisHold(s), /ditahan/)
})

test("AUTO outputs do not reset analysis; material setpoints and differentiation do", () => {
  const s = state()
  assert.equal(liveSegment(s), "initial:expansion:initial")
  s.controller!.events.push({ id: "SP-1", hour: 1, setpoints: { ph: 7.2 } })
  assert.equal(liveSegment(s), "initial:expansion:SP-1")
  s.stage = "differentiation"
  assert.match(liveAnalysisHold(s), /RBC matang/)
})
