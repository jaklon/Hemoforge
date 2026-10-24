import assert from "node:assert/strict"
import test from "node:test"
import { transferPresentation, TransferVisualClock, transferFrameDelta } from "./transfer-visual.ts"
import { processPresentation } from "./process-animation.ts"
import type { LabSnapshot, LabIntervention } from "./lab-session.ts"

const action=(values:Partial<LabIntervention>={}) => ({
  id:"decision-1",kind:"feed",amount:10,feed_multiplier_ml:50,progress:.5,status:"executing",
  source_sample_id:"PAT-01500",outcome:null,...values,
}) as LabIntervention
const source=(item:LabIntervention|null=action(),values:Partial<LabSnapshot>={}) => ({
  working_volume_ml:12500, running:true,controller_connected:true,
  controller:{mode:"AUTO",outputs:{stirrer_rpm:100,oxygen_percent:21,base_output_percent:0,thermal_output_percent:0}},
  intervention_protocol:{max_volume_ml:50000},active_intervention:item,interventions:item ? [item] : [],
  ...values,
}) as LabSnapshot

test("feed visual conserves its approved dose without mutating recorded volume or sensor data",()=>{
  const s=source(),before=JSON.stringify(s),v=transferPresentation(s,true)!
  assert.equal(v.plannedMl,500)
  assert.equal(v.incomingMl,250)
  assert.equal(v.remainingMl,250)
  assert.equal(v.outgoingMl,0)
  assert.equal(v.visualVolumeMl,12750)
  assert.equal(v.recordedVolumeMl,12500)
  assert.equal(v.target,13000)
  assert.equal(JSON.stringify(s),before)
})

test("exchange has equal incoming and outgoing medium and retains constant reactor volume at every step",()=>{
  for(const progress of [0,.1,.5,.99]) {
    const s=source(action({kind:"medium_exchange",amount:25,progress}))
    const v=transferPresentation(s,true)!
    assert.equal(v.plannedMl,3125)
    assert.equal(v.incomingMl,v.outgoingMl)
    assert.equal(v.incomingMl+v.remainingMl,3125)
    assert.equal(v.visualVolumeMl,12500)
    assert.equal(v.target,12500)
    const p=processPresentation(s,true)
    assert.equal(p.rates.feed,1);assert.equal(p.rates.waste,1);assert.equal(p.rates.retentate,1)
  }
  const p=processPresentation(source(),true)
  assert.equal(p.rates.waste,0);assert.equal(p.rates.retentate,0)
})

test("queued decisions prepare a dose but cannot move pumps or apply volume",()=>{
  const s=source(action({status:"queued",progress:.4}))
  const v=transferPresentation(s,true)!
  assert.equal(v.progress,0);assert.equal(v.active,false)
  assert.equal(v.incomingMl,0);assert.equal(v.remainingMl,500)
  assert.equal(v.visualVolumeMl,12500)
  assert.equal(processPresentation(s,true).rates.feed,0)
})

test("applied receipts reconcile the visual with audited volume and never replay a transfer",()=>{
  const done=action({status:"applied",progress:1,outcome:{volume_before_ml:12500,volume_after_ml:13000,added_medium_ml:500,exchanged_medium_ml:0}})
  const s=source(null,{interventions:[done],working_volume_ml:13000,running:false})
  const v=transferPresentation(s,true)!
  assert.equal(v.progress,1);assert.equal(v.before,12500);assert.equal(v.target,13000)
  assert.equal(v.incomingMl,500);assert.equal(v.remainingMl,0)
  assert.equal(v.visualVolumeMl,v.recordedVolumeMl)
  assert.equal(v.active,false);assert.equal(processPresentation(s,true).rates.feed,0)
  const c=new TransferVisualClock()
  for(let i=0;i<120;i++) assert.equal(c.update(v,1/60,true),1)
})

test("cancellation restores the unchanged recorded volume with no fictional partial delivery",()=>{
  const stopped=action({status:"cancelled",progress:.7})
  const v=transferPresentation(source(null,{interventions:[stopped]}),true)!
  assert.equal(v.progress,0);assert.equal(v.incomingMl,0);assert.equal(v.visualVolumeMl,12500)
  assert.equal(v.active,false)
  const c=new TransferVisualClock();c.update(transferPresentation(source(),true),.1,true)
  assert.equal(c.update(v,.1,true),0)
})

test("visual smoothing never runs ahead of acknowledged progress and holds through pause or stalls",()=>{
  const c=new TransferVisualClock()
  const initial=transferPresentation(source(action({progress:0})),true)!
  c.update(initial,.1,true)
  const v=transferPresentation(source(action({progress:.6})),true)!
  const mid=c.update(v,.1,true)
  assert.ok(mid>0 && mid<.6)
  for(const [dt,active] of [[.1,false],[2,true],[NaN,true]] as const) assert.equal(c.update(v,dt,active),mid)
  assert.equal(transferPresentation(source(action({progress:.6})),true,1)!.shown,.6)
  assert.ok(c.update(v,.1,true)>mid)
  const next=transferPresentation(source(action({id:"decision-2",progress:0})),true)!
  assert.equal(c.update(next,.1,true),0)
})

test("offline and malformed transfer states do not invent flow, dose or target volume",()=>{
  for(const s of [source(action({progress:NaN})),source(action({progress:1.2})),source(action({amount:50})),source(action({feed_multiplier_ml:NaN})),source(action(),{working_volume_ml:NaN}),source(action(),{working_volume_ml:49900})]) {
    assert.equal(transferPresentation(s,true),null)
    assert.equal(processPresentation(s,true).rates.feed,0)
  }
  assert.equal(transferPresentation(source(),false)!.active,false)
  assert.equal(transferPresentation(source(),true)!.moving,true)
  assert.equal(transferPresentation(source(action(),{running:false}),true)!.moving,false)
  assert.equal(transferPresentation(source(null),true),null)
})

test("presentation slowdown preserves stalled-frame rejection and scales only an executing transfer",()=>{
  assert.equal(transferFrameDelta(.03,true,true),.01)
  assert.equal(transferFrameDelta(.03,false,true),.03)
  assert.equal(transferFrameDelta(.03,true,false),.03)
  for(const dt of [0,-1,.6,2,Infinity]) assert.equal(transferFrameDelta(dt,true,true),dt)
  assert.ok(Number.isNaN(transferFrameDelta(NaN,true,true)))
})
