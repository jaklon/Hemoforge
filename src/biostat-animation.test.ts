import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { renderedSeconds, stirrerAngle, liquidHeight } from "./biostat-animation.ts"

test("visual motion excludes pause, disconnect, hidden frames, and stalls", () => {
  assert.equal(renderedSeconds(1/60, false), 0)
  assert.equal(renderedSeconds(2, true), 0)
  assert.equal(renderedSeconds(NaN, true), 0)
  assert.equal(renderedSeconds(-1, true), 0)
  assert.equal(renderedSeconds(1/60, true), 1/60)
})

test("impeller integrates current RPM without jumping when RPM changes", () => {
  const first = stirrerAngle(0, 60, 0.1)
  assert.ok(Math.abs(first - Math.PI*0.2) < 1e-10)
  const changed = stirrerAngle(first, 120, 0.1)
  assert.ok(Math.abs(changed - Math.PI*0.6) < 1e-10)
  assert.equal(stirrerAngle(changed, 500, 0), changed)
  assert.equal(stirrerAngle(changed, NaN, 0.1), changed)
})

test("liquid level follows the current bounded volume, including a 500mL feed", () => {
  assert.equal(liquidHeight(12500), 0.35)
  assert.ok(Math.abs(liquidHeight(13000)-0.364) < 1e-10)
  assert.equal(liquidHeight(50000), 1.4)
  assert.equal(liquidHeight(100000), 1.4)
  assert.ok(liquidHeight(-100) > 0)
})

test("shipped Blender GLB contains neutral runtime bindings and self-contained textures", () => {
  const bytes = readFileSync(new URL("../public/virtual-lab/biostat/biostat-gen2.glb", import.meta.url))
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.ok(bytes.length < 2_000_000, "Keep the hero asset within the 2MB budget")
  const doc = JSON.parse(bytes.subarray(20, 20+bytes.readUInt32LE(12)).toString())
  assert.equal(doc.scenes.length, 1)
  for (const name of ["HF_Impeller", "HF_Liquid", "HF_Bag", "HF_ViaMass_Legacy"]) {
    const node = doc.nodes.find((node: { name: string }) => node.name === name)
    assert.ok(node, `Missing animation binding ${name}`)
    assert.deepEqual(node.scale ?? [1,1,1], [1,1,1])
    assert.deepEqual(node.rotation ?? [0,0,0,1], [0,0,0,1])
  }
  assert.ok(doc.meshes.length <= 24, "Merge static geometry by material")
  for (const resource of [...doc.buffers, ...(doc.images ?? [])]) {
    assert.equal(resource.uri, undefined, "No external texture or buffer requests")
  }
})
