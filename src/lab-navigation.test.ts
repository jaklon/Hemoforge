import assert from "node:assert/strict"
import test from "node:test"
import { LAB_BOUNDS, LAB_OBSTACLES, PLAYER_RADIUS, WALK_SPAWN, canStand, mouseLook, walkStep } from "./lab-navigation.ts"

test("walking uses horizontal camera yaw and normalized diagonals at a fixed speed", () => {
  const start = { x: 0,z: 3 }
  const forward = walkStep(start,1,0,0,.1)
  assert.ok(Math.abs(forward.z-2.84)<1e-10)
  assert.equal(forward.x,0)
  const left = walkStep(start,1,0,Math.PI/2,.1)
  assert.ok(left.x<0 && Math.abs(left.z-3)<1e-10)
  const diagonal = walkStep(start,1,1,0,.1)
  assert.ok(Math.abs(Math.hypot(diagonal.x-start.x,diagonal.z-start.z)-.16)<1e-10)
  assert.deepEqual(walkStep(start,0,0,0,.1),start)
  assert.deepEqual(start,{ x:0,z:3 })
})

test("player stays inside room bounds and cannot tunnel through equipment", () => {
  assert.ok(canStand(WALK_SPAWN.x,WALK_SPAWN.z))
  for (const o of LAB_OBSTACLES) assert.equal(canStand((o.minX+o.maxX)/2,(o.minZ+o.maxZ)/2),false,o.name)
  let player = { x: .8,z: 3.2 }
  for (let i=0;i<100;i++) player = walkStep(player,0,1,0,.25)
  assert.ok(player.x<=LAB_BOUNDS.maxX-PLAYER_RADIUS)
  player = { x: 2,z: -.65 }
  for (let i=0;i<30;i++) player = walkStep(player,1,0,0,.25)
  assert.ok(player.z>=-.91+PLAYER_RADIUS-1e-10,"Trace table blocks approach even at large accepted frame steps")
  assert.ok(canStand(player.x,player.z))
  const slide = walkStep(player,1,1,0,.2)
  assert.ok(slide.x>player.x,"A blocked forward direction still permits sliding")
  assert.ok(canStand(slide.x,slide.z))
})

test("long or invalid frame gaps do not teleport the player", () => {
  for (const delta of [NaN,Infinity,-1,0,.251,10]) assert.deepEqual(walkStep(WALK_SPAWN,1,1,0,delta),WALK_SPAWN)
  assert.equal(canStand(NaN,0),false)
  assert.deepEqual(walkStep(WALK_SPAWN,NaN,0,0,.1),WALK_SPAWN)
})

test("mouse look supports a full turn while limiting vertical pitch", () => {
  assert.ok(mouseLook(0,0,100,0).yaw<0)
  assert.ok(mouseLook(0,0,0,100).pitch<0)
  assert.equal(mouseLook(0,0,0,-10000).pitch,1.1)
  assert.equal(mouseLook(0,0,0,10000).pitch,-1.1)
  assert.ok(Math.abs(mouseLook(0,0,100000,0).yaw)<Math.PI*2)
  assert.deepEqual(mouseLook(0,0,NaN,1),{yaw:0,pitch:0})
})
