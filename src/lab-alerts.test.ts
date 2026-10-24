import assert from "node:assert/strict"
import test from "node:test"
import {
  alarmPresentation,
  alarmSoundKey,
  correctionPending,
} from "./lab-alerts.ts"
import { labSoundState } from "./lab-audio.ts"
import { processPresentation } from "./process-animation.ts"
import type { LabAlert, LabSnapshot } from "./lab-session.ts"
const alert = {
  id: "do-1",
  metric: "do",
  status: "active",
  severity: "critical",
  acknowledged: false,
  value: 12,
  measured_at_hour: 2,
} as LabAlert
const source = (values: Partial<LabSnapshot> = {}) =>
  ({
    running: true,
    culture_hours: 2.2,
    lab_alerts: [alert],
    controller_connected: true,
    training_scenarios: { limit: 12, runs: [] },
    controller: {
      mode: "AUTO",
      outputs: {
        stirrer_rpm: 180,
        oxygen_percent: 70,
        base_output_percent: 0,
        thermal_output_percent: 0,
      },
    },
    ...values,
  }) as LabSnapshot
test("active, acknowledged, held and resolved alarms preserve distinct meanings", () => {
  assert.equal(alarmPresentation(source(), true).tone, "critical")
  assert.equal(
    alarmPresentation(
      source({ lab_alerts: [{ ...alert, acknowledged: true }] }),
      true,
    ).tone,
    "critical",
  )
  const off = alarmPresentation(source(), false)
  assert.equal(off.current[0].status, "hold")
  assert.equal(off.current[0].value, null)
  assert.equal(
    alarmPresentation(
      source({ lab_alerts: [{ ...alert, status: "resolved" }] }),
      true,
    ).current.length,
    0,
  )
  assert.equal(
    alarmPresentation(source({ sensor_readings: [], lab_alerts: [] }), true)
      .title,
    "Menunggu sensor valid",
  )
})
test("sound keys identify unacknowledged episodes/escalations, never periodic snapshots or QC holds", () => {
  assert.equal(alarmSoundKey(alert), "do-1/critical")
  assert.equal(alarmSoundKey({ ...alert, acknowledged: true }), null)
  assert.equal(alarmSoundKey({ ...alert, status: "hold" }), null)
  assert.equal(alarmSoundKey({ ...alert, status: "resolved" }), null)
  assert.notEqual(
    alarmSoundKey({ ...alert, severity: "warning" }),
    alarmSoundKey(alert),
  )
})
test("corrective action remains pending until a later sensor observation", () => {
  const s = source({
    alert_events: [
      {
        seq: 1,
        kind: "correction",
        alert_id: "do-1",
        metric: "do",
        severity: "critical",
        hour: 2.2,
      },
    ],
  })
  assert.equal(correctionPending(s, alert), true)
  assert.equal(correctionPending(s, { ...alert, measured_at_hour: 2.5 }), false)
})
test("ambience is explicitly enabled, bounded and silent on hidden/disconnected pages", () => {
  assert.equal(labSoundState(source(), true, true, false, 0.2).audible, false)
  assert.equal(labSoundState(source(), true, false, true, 0.2).audible, false)
  assert.equal(labSoundState(source(), false, true, true, 0.2).audible, false)
  assert.equal(labSoundState(null, true, true, true, 0.2).audible, false)
  assert.equal(labSoundState(source(), true, true, true, 99).volume, 0.6)
  assert.equal(labSoundState(source(), true, true, true, NaN).volume, 0)
  const pause = labSoundState(source({ running: false }), true, true, true, 0.2)
  assert.equal(pause.audible, true)
  assert.equal(pause.motor, 0)
  assert.equal(pause.gas, 0)
})
test("restricted gas lowers qualitative transport/density without interpreting O2 blend as measured flow", () => {
  const normal = source(),
    restricted = source({
      process_disturbance: {
        acid_load_active: false,
        aeration_restricted: true,
      },
    })
  assert.equal(processPresentation(normal, true).rates.gas, 1)
  assert.equal(processPresentation(restricted, true).rates.gas, 0.12)
  assert.equal(processPresentation(restricted, true).oxygen, 70)
  assert.equal(labSoundState(restricted, true, true, true, 0.2).gas, 0.12)
})
