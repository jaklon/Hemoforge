import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { instrumentPresentation } from "./biopat-instrument.ts"
import type { LabSnapshot, SensorReading } from "./lab-session.ts"

const trace: SensorReading = {
  id: "TRACE-00200", device: "trace", source_kind: "virtual_sensor",
  measured_at_hour: 2, available_at_hour: 2.1, expires_at_hour: 7,
  channels: { glucose_mmol_l: 23.456, lactate_mmol_l: 1.234 },
  quality: { status: "passed", flags: [] }, stage: "expansion", volume_ml: 12500, model_version: "test",
}
const via: SensorReading = { ...trace, id: "VIAMASS-00200", device: "viamass", channels: { capacitance_pf_cm: 1.25 } }
const source = (values: Partial<LabSnapshot> = {}) => ({
  culture_hours: 2.2, running: true, sensor_readings: [trace, via], sensor_faults: [],
  ...values,
}) as LabSnapshot

test("instrument screens use only released device-specific receipts and original units", () => {
  const s = source({ sensor_readings: [trace, via, { ...trace, id: "FUTURE", available_at_hour: 3, channels: { glucose_mmol_l: 999, lactate_mmol_l: 999 } }] })
  assert.deepEqual(instrumentPresentation(s, "trace", true).values, ["GLU 23.456 mmol/L", "LAC 1.234 mmol/L"])
  assert.deepEqual(instrumentPresentation(s, "viamass", true).values, ["CAP 1.250 pF/cm"])
  assert.equal(instrumentPresentation(s, "trace", true).receipt, trace.id)
})

test("fault, stale, missing and disconnected instruments never show live numerical values", () => {
  for (const [s,connected,state] of [
    [source({ sensor_faults: ["trace"] }),true,"fault"],
    [source({ culture_hours: 8 }),true,"stale"],
    [source({ sensor_readings: [] }),true,"waiting"],
    [source(),false,"offline"],
    [source({ sensor_readings: [{ ...trace, quality: { status: "rejected", flags: ["QC"] } }] }),true,"fault"],
    [source({ sensor_readings: [{ ...trace, channels: { glucose_mmol_l: NaN } }] }),true,"unavailable"],
  ] as const) {
    const view=instrumentPresentation(s,"trace",connected)
    assert.equal(view.state,state)
    assert.ok(view.values.every(value=>value.includes("--")))
    if (state!=="waiting") assert.equal(view.flowing,false)
  }
})

test("paused instruments preserve valid last readings and stop fluid animation; recovery resumes", () => {
  const paused=instrumentPresentation(source({ running:false }),"trace",true)
  assert.equal(paused.flowing,false)
  assert.equal(paused.status,"QC PASSED / PAUSED")
  assert.equal(paused.values[0],"GLU 23.456 mmol/L")
  assert.equal(instrumentPresentation(source(),"trace",true).flowing,true)
  assert.equal(instrumentPresentation(null,"viamass",true).state,"offline")
})

test("PAT exports retain display UVs, rotor pivots, local origins and a bounded offline payload", () => {
  for (const [file,names,budget] of [
    ["biopat-trace.glb",["HF_Trace_Display","HF_Trace_PumpA","HF_Trace_PumpB","HF_Trace_Status"],1_400_000],
    ["biopat-viamass.glb",["HF_ViaMass_Display","HF_ViaMass_Status"],800_000],
  ] as const) {
    const bytes=readFileSync(new URL(`../public/virtual-lab/biopat/${file}`,import.meta.url))
    assert.equal(bytes.readUInt32LE(0),0x46546c67)
    assert.equal(bytes.readUInt32LE(8),bytes.length)
    assert.ok(bytes.length<budget)
    const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
    assert.equal(doc.scenes.length,1,"Other selected Blender scenes must not leak into the export")
    assert.ok(doc.meshes.length<=(file.includes("trace")?20:12))
    for (const name of names) {
      const node=doc.nodes.find((node:{name:string})=>node.name===name)
      assert.ok(node,`Missing ${name}`)
      assert.deepEqual(node.rotation??[0,0,0,1],[0,0,0,1])
      if (name.endsWith("Display")) assert.ok(doc.meshes[node.mesh].primitives[0].attributes.TEXCOORD_0!==undefined)
    }
    const root=doc.nodes[doc.scenes[doc.scene??0].nodes[0]]
    assert.deepEqual(root.translation??[0,0,0],[0,0,0])
    for (const resource of [...doc.buffers,...(doc.images??[])]) assert.equal(resource.uri,undefined)
  }
})
