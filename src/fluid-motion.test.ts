import assert from "node:assert/strict"
import test from "node:test"
import { FLUID_BASE, FLUID_RADIUS, SPARGER_HEIGHT, FluidClock, fluidShape, surfaceProfile, surfaceOffset, bubblePoint, circulationPoint, hoseDistance } from "./fluid-motion.ts"

test("fluid level uses audited volume and stirring requires an immersed lower blade", () => {
  assert.equal(fluidShape(12500,100).height,.35)
  assert.ok(Math.abs(fluidShape(13000,100).height-.364)<1e-12)
  assert.equal(fluidShape(3000,100).drive,0)
  assert.ok(fluidShape(12500,220).drive > fluidShape(12500,100).drive)
  for(const v of [NaN,Infinity,0,-50]) assert.equal(fluidShape(v,100).present,false)
  assert.equal(fluidShape(12500,NaN).drive,0)
  assert.equal(fluidShape(12500,900).drive,1)
})

test("fluid clocks hold exactly on pause, hidden/disconnected/reduced motion and stalls", () => {
  const c=new FluidClock()
  c.advance(.1,true,.5,1)
  const saved={...c}
  for(const [dt,active] of [[.1,false],[0,true],[-1,true],[2,true],[NaN,true]] as const) {
    c.advance(dt,active,1,1)
    assert.deepEqual({...c},saved)
  }
  c.advance(.1,true,1,1)
  assert.ok(c.mix>saved.mix)
  assert.ok(c.gas>saved.gas)
})

test("exact response integration is frame-rate independent and command changes have no phase reset", () => {
  const slow=new FluidClock(),fast=new FluidClock()
  for(let i=0;i<30;i++) slow.advance(1/30,true,.6,1)
  for(let i=0;i<120;i++) fast.advance(1/120,true,.6,1)
  assert.ok(Math.abs(slow.mix-fast.mix)<1e-12)
  assert.ok(Math.abs(slow.drive-fast.drive)<1e-12)
  assert.ok(Math.abs(slow.gas-fast.gas)<1e-12)
  const phase=slow.mix
  slow.advance(.1,true,1,0)
  assert.ok(slow.mix>phase && slow.mix<phase+.1)
  const gas=slow.gas
  slow.advance(.1,true,0,0)
  assert.equal(slow.gas,gas)
})

test("shallow vortex and waves preserve the disk's mean level and remain within depth bounds", () => {
  for(const height of [.001,.1,.35,1.4]) for(const drive of [0,.5,1]) {
    const p=surfaceProfile(height,drive,1.7)
    let mean=0,max=0,count=0
    // Equal area annuli sample the analytic disk integral, including angular waves.
    for(let r=0;r<40;r++) for(let a=0;a<64;a++) {
      const radius=Math.sqrt((r+.5)/40)*FLUID_RADIUS,angle=a/64*Math.PI*2
      const y=surfaceOffset(radius*Math.cos(angle),radius*Math.sin(angle),p.depth,p.wave,p.phase)
      mean+=y; max=Math.max(max,Math.abs(y)); count++
    }
    assert.ok(Math.abs(mean/count)<1e-12)
    assert.ok(max <= Math.min(height*.055,.012)+1e-12)
    if(!drive) assert.equal(max,0)
  }
})

test("bubbles stay inside the wetted bag and originate at twenty fixed sparger apertures", () => {
  const c=new FluidClock(),p={x:0,y:0,z:0,radius:0}
  for(const height of [.12,.35,1.4]) for(let frame=0;frame<40;frame++) {
    c.advance(.1,true,.8,1)
    for(let i=0;i<144;i++) {
      bubblePoint(p,i,c,height)
      assert.ok(p.y>=SPARGER_HEIGHT && p.y+p.radius<FLUID_BASE+height)
      assert.ok(Math.hypot(p.x,p.z)+p.radius<FLUID_RADIUS)
      assert.ok(p.radius>=0 && p.radius<.01)
    }
  }
  const start=bubblePoint(p,0,new FluidClock(),.35)
  assert.equal(start.y,SPARGER_HEIGHT)
  assert.ok(Math.abs(Math.hypot(start.x,start.z)-.29)<1e-12)
})

test("circulation tracers remain submerged and fixed when their visual clock holds", () => {
  const p={x:0,y:0,z:0,radius:0}
  for(const height of [.01,.35,1.4]) for(let i=0;i<80;i++) {
    circulationPoint(p,i,2.3,height)
    assert.ok(p.y-p.radius>FLUID_BASE && p.y+p.radius<FLUID_BASE+height)
    assert.ok(Math.hypot(p.x,p.z)<FLUID_RADIUS)
    const saved={...p}
    circulationPoint(p,i,2.3,height)
    assert.deepEqual(p,saved)
  }
})

test("all hose segments transport highlights at the same bounded speed and hold closed lines", () => {
  assert.equal(hoseDistance(.5,0,.1,true),.5)
  assert.equal(hoseDistance(.5,1,.1,false),.5)
  assert.equal(hoseDistance(.5,1,2,true),.5)
  assert.equal(hoseDistance(.5,NaN,.1,true),.5)
  assert.ok(Math.abs(hoseDistance(.5,1,.1,true)-.524)<1e-12)
  let x=0,y=0
  for(let i=0;i<60;i++) x=hoseDistance(x,.7,1/60,true)
  for(let i=0;i<120;i++) y=hoseDistance(y,.7,1/120,true)
  assert.ok(Math.abs(x-y)<1e-12)
})
