import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { canInspect, InspectionClock, inspectionPose } from "./operator-hands.ts"
import type { LabSnapshot, SensorReading } from "./lab-session.ts"

const core: SensorReading = {
  id: "CORE-00200", device: "core", source_kind: "virtual_sensor", measured_at_hour: 2,
  available_at_hour: 2.02, expires_at_hour: 3, channels: { ph: 7.3, dissolved_oxygen: 40, temperature: 37 },
  quality: { status: "passed", flags: [] }, stage: "expansion", volume_ml: 12500, model_version: "test",
}
const trace: SensorReading = { ...core, id: "TRACE-00200", device: "trace", channels: { glucose_mmol_l: 22, lactate_mmol_l: 3 } }
const source = (values: Partial<LabSnapshot> = {}) => ({ culture_hours: 2.2, running: true, sensor_readings: [core, trace], sensor_faults: [], active_intervention: null, ...values }) as LabSnapshot

test("inspection requires running, connected, released valid device data and never mutates the snapshot", () => {
  const s = source(), before = structuredClone(s)
  assert.equal(canInspect(s, true, "bioreactor"), true)
  assert.equal(canInspect(s, true, "trace"), true)
  assert.equal(canInspect(s, true, "viamass"), false)
  assert.equal(canInspect(s, true, "overview"), false)
  assert.equal(canInspect(s, false, "trace"), false)
  for (const changes of [
    { running: false }, { sensor_faults: ["trace"] }, { culture_hours: 4 },
    { sensor_readings: [{ ...trace, available_at_hour: 3 }] },
    { sensor_readings: [{ ...trace, quality: { status: "rejected", flags: ["QC"] } }] },
    { sensor_readings: [{ ...trace, channels: { glucose_mmol_l: NaN } }] },
    { active_intervention: { status: "executing" } },
  ]) assert.equal(canInspect(source(changes as Partial<LabSnapshot>), true, "trace"), false)
  assert.equal(canInspect(source({ sensor_faults: ["core"] }), true, "bioreactor"), false)
  assert.deepEqual(s, before)
})

test("operator gesture freezes on pause, QC hold, hidden time, disconnect and stalls, then resumes without jumping", () => {
  const clock = new InspectionClock()
  assert.equal(clock.start(), true)
  assert.equal(clock.start(), false)
  for (let i = 0; i < 15; i++) clock.advance(.1, true)
  const saved = inspectionPose(clock.seconds)
  for (const delta of [.1, 2, -1, NaN]) assert.deepEqual(clock.advance(delta, false), saved)
  assert.deepEqual(clock.advance(2, true), saved)
  clock.advance(.1, true)
  assert.ok(Math.abs(clock.seconds-1.6) < 1e-10)
  for (let i = 0; i < 60; i++) clock.advance(.1, true)
  assert.equal(clock.active, false)
  assert.equal(clock.advance(.1, true).reach, 0)
  clock.start()
  clock.advance(.1, true)
  clock.reset()
  assert.equal(clock.active, false)
  assert.equal(clock.seconds, 0)
  for (let t = 0; t <= 6; t += .01) {
    const p = inspectionPose(t)
    for (const value of [p.lean,p.reach,p.tap]) assert.ok(value >= 0 && value <= 1)
  }
})

test("operator GLB contains two bounded skinned hands and all finger joints without remote assets or a baked timeline", () => {
  const bytes = readFileSync(new URL("../public/virtual-lab/hands/operator-hands.glb", import.meta.url))
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.ok(bytes.length < 300_000)
  const doc = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  assert.equal(doc.scenes.length, 1)
  assert.equal(doc.skins.length, 2)
  assert.equal(doc.meshes.length, 2)
  const primitives = doc.meshes.flatMap((m: { primitives: unknown[] }) => m.primitives)
  assert.equal(primitives.length, 4, "Two material submissions per hand")
  for (const p of primitives) {
    assert.notEqual(p.attributes.JOINTS_0, undefined)
    assert.notEqual(p.attributes.WEIGHTS_0, undefined)
  }
  const triangles = primitives.reduce((sum: number,p: { indices: number }) => sum+doc.accessors[p.indices].count/3,0)
  assert.ok(triangles < 9000)
  for (const side of ["L","R"]) {
    assert.ok(doc.nodes.some((n: { name: string }) => n.name === `HF_Hand_${side}`))
    for (const finger of ["Index","Middle","Ring","Little","Thumb"]) for (const joint of [1,2,3]) {
      const index = doc.nodes.findIndex((n: { name: string }) => n.name === `HF_${side}_${finger}${joint}`)
      assert.ok(index >= 0)
      assert.ok(doc.skins.some((s: { joints: number[] }) => s.joints.includes(index)), "Exported joints must bind to a skin")
    }
  }
  assert.equal(doc.animations?.length ?? 0, 0)
  for (const r of [...doc.buffers,...(doc.images ?? [])]) assert.equal(r.uri, undefined)
})
