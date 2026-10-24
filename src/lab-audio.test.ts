import assert from "node:assert/strict"
import test from "node:test"
import { BEEP_INTERVAL, labSoundState } from "./lab-audio.ts"
import type { LabAlert, LabSnapshot, SensorReading } from "./lab-session.ts"
const reading = (
  device: SensorReading["device"],
  channels: Record<string, number>,
) =>
  ({
    id: device,
    device,
    source_kind: "virtual_sensor",
    stage: "expansion",
    volume_ml: 12500,
    model_version: "test",
    channels,
    quality: { status: "passed", flags: [] },
    measured_at_hour: 1,
    available_at_hour: 1,
    expires_at_hour: 3,
  }) as SensorReading
const base = {
  running: true,
  culture_hours: 2,
  training_scenarios: { limit: 12, runs: [] },
  lab_alerts: [],
  sensor_readings: [
    reading("core", { ph: 7.3, dissolved_oxygen: 40 }),
    reading("trace", { glucose_mmol_l: 10 }),
  ],
} as unknown as LabSnapshot
const sound = (s: LabSnapshot = base) => labSoundState(s, true, true, true, 0.4)
test("normal beeps require a running culture and fresh released sensors", () => {
  assert.equal(sound().beep, "normal")
  assert.equal(sound({ ...base, running: false }).beep, "silent")
  assert.equal(sound({ ...base, culture_hours: 10 }).beep, "silent")
  assert.equal(sound({ ...base, sensor_faults: ["core"] }).beep, "warning")
})
test("warning and critical rhythm stay fast after acknowledgement until measured recovery", () => {
  const a = {
    id: "ph-1",
    metric: "ph",
    status: "active",
    severity: "warning",
    acknowledged: true,
  } as LabAlert
  assert.equal(sound({ ...base, lab_alerts: [a] }).beep, "warning")
  assert.equal(
    sound({ ...base, lab_alerts: [{ ...a, severity: "critical" }] }).beep,
    "critical",
  )
  assert.equal(
    sound({ ...base, lab_alerts: [{ ...a, status: "resolved" }] }).beep,
    "normal",
  )
  assert.equal(
    sound({ ...base, lab_alerts: [{ ...a, status: "hold" }] }).beep,
    "warning",
  )
  assert.ok(
    BEEP_INTERVAL.critical < BEEP_INTERVAL.warning &&
      BEEP_INTERVAL.warning < BEEP_INTERVAL.normal,
  )
  assert.equal(BEEP_INTERVAL.warning, 0.5)
  assert.equal(BEEP_INTERVAL.critical, 0.3)
})
test("hidden/offline/muted sound cannot schedule a process beep", () => {
  assert.equal(labSoundState(base, true, false, true, 0.4).beep, "silent")
  assert.equal(labSoundState(base, false, true, true, 0.4).beep, "silent")
  assert.equal(labSoundState(base, true, true, false, 0.4).beep, "silent")
})
