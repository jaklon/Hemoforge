import assert from "node:assert/strict"
import test from "node:test"
import { processPresentation, flowPhase } from "./process-animation.ts"
import type { LabSnapshot, LabIntervention, SensorReading } from "./lab-session.ts"

const reading: SensorReading = {
  id: "TRACE-1", device: "trace", source_kind: "virtual_sensor", measured_at_hour: 1,
  available_at_hour: 1.1, expires_at_hour: 3, channels: { glucose_mmol_l: 20, lactate_mmol_l: 2 },
  quality: { status: "passed", flags: [] }, stage: "expansion", volume_ml: 12500, model_version: "test",
}
const source = (values: Partial<LabSnapshot> = {}) => ({
  running: true, controller_connected: true, culture_hours: 1.2, sensor_readings: [reading],
  controller: { mode: "AUTO", setpoints: { ph: 7.3, dissolved_oxygen: 40, temperature: 37 },
    outputs: { stirrer_rpm: 100, oxygen_percent: 25, base_output_percent: 30, acid_output_percent: 0, thermal_output_percent: -15 }, events: [] },
  active_intervention: null, ...values,
}) as LabSnapshot
const action = (values: Partial<LabIntervention> = {}) => ({
  id: "decision-1", kind: "feed", status: "executing", amount: 25, progress: .4, ...values,
}) as LabIntervention

test("normal AUTO motion runs mixer, gas blend and Trace, with feed/waste closed", () => {
  const p = processPresentation(source(),true)
  assert.equal(p.rpm,100)
  assert.equal(p.rates.oxygen,.25)
  assert.equal(p.rates.nitrogen,.75)
  assert.equal(p.rates.base,.3)
  assert.equal(p.rates.acid,0)
  assert.equal(p.thermal,-15)
  assert.equal(p.rates.trace,1)
  assert.equal(p.rates.feed,0)
  assert.equal(p.rates.waste,0)
})

test("only an executing valid transfer opens feed; only exchange opens outlet/retention", () => {
  for(const kind of ["feed","medium_exchange"] as const) {
    const p = processPresentation(source({active_intervention:action({kind})}),true)
    assert.equal(p.rates.feed,1)
    assert.equal(p.rates.waste,kind === "medium_exchange" ? 1 : 0)
  }
  for(const invalid of [
    action({status:"queued"}),action({status:"applied"}),action({status:"cancelled"}),
    action({progress:1}),action({progress:NaN}),action({progress:-1}),action({amount:NaN as 25}),
  ]) {
    const p = processPresentation(source({active_intervention:invalid}),true)
    assert.equal(p.rates.feed,0)
    assert.equal(p.rates.waste,0)
  }
})

test("pause preserves commanded paths but freezes all motion; offline never fabricates commands", () => {
  const p = processPresentation(source({running:false,active_intervention:action()}),true)
  assert.equal(p.rates.feed,1)
  assert.equal(p.running,false)
  assert.equal(flowPhase(.42,p.rates.feed,.1,p.running),.42)
  for(const [s,connected] of [[null,true],[source(),false],[source({controller_connected:false}),true],[source({controller:undefined}),true]] as const) {
    const off = processPresentation(s,connected)
    assert.equal(off.rpm,0)
    assert.equal(off.running,false)
    assert.ok(Object.values(off.rates).every(rate=>rate===0))
  }
})

test("Trace QC hold affects its loop, not the controller's independent actuator commands", () => {
  for(const s of [source({sensor_faults:["trace"]}),source({culture_hours:4}),source({sensor_readings:[{...reading,quality:{status:"rejected",flags:["QC"]}}]})]) {
    const p = processPresentation(s,true)
    assert.equal(p.rates.trace,0)
    assert.equal(p.rates.traceData,0)
    assert.equal(p.rpm,100)
    assert.equal(p.rates.gas,1)
  }
  assert.equal(processPresentation(source({sensor_faults:["core"]}),true).rates.gas,1)
  const future = {...reading,available_at_hour:2}
  const waiting = processPresentation(source({sensor_readings:[future]}),true)
  assert.equal(waiting.rates.trace,1)
  assert.equal(waiting.rates.traceData,0)
})

test("missing and malformed output values cannot invent gas or motor motion", () => {
  const s = source()
  s.controller!.outputs = {stirrer_rpm:NaN,oxygen_percent:NaN,base_output_percent:-1,acid_output_percent:200,thermal_output_percent:Infinity}
  const p = processPresentation(s,true)
  assert.equal(p.rpm,0)
  assert.equal(p.rates.gas,0)
  assert.equal(p.rates.nitrogen,0)
  assert.equal(p.rates.base,0)
  assert.equal(p.rates.acid,1)
  assert.equal(p.thermal,0)
})

test("flow integration is independent of frame count, continuous on rate changes and holds long gaps", () => {
  let p = .25
  for(let i=0;i<60;i++) p = flowPhase(p,1,1/60,true)
  assert.ok(Math.abs(p-.47)<1e-12)
  assert.ok(Math.abs(flowPhase(p,.5,.1,true)-.481)<1e-12)
  for(const dt of [0,-1,NaN,Infinity,2]) assert.equal(flowPhase(.3,1,dt,true),.3)
  assert.equal(flowPhase(.3,0,.1,true),.3)
  assert.equal(flowPhase(.3,1,.1,false),.3)
  assert.equal(flowPhase(.3,NaN,.1,true),.3)
})
