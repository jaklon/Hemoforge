import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

test("laboratory GLB stays self-contained, static and within the browser budget", () => {
  const path = "../public/virtual-lab/laboratory/"
  const bytes = readFileSync(new URL(`${path}laboratory.glb`, import.meta.url))
  const manifest = JSON.parse(readFileSync(new URL(`${path}manifest.json`, import.meta.url), "utf8"))
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.equal(manifest.bytes, bytes.length)
  assert.ok(bytes.length < 2_500_000, "Keep the entire room including textures below 2.5MB")
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  assert.equal(doc.scenes.length, 1, "Preserved Blender scenes must not leak into the export")
  assert.ok(doc.meshes.length <= 18, "Merge static geometry by material")
  const primitives = doc.meshes.flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
  assert.ok(primitives.length <= 18, "Bound draw calls, not only Blender object count")
  const triangles = primitives.reduce((sum: number, p: { indices: number }) => sum + doc.accessors[p.indices].count / 3, 0)
  assert.equal(manifest.triangles, triangles)
  assert.ok(triangles < 45_000)
  assert.equal(doc.animations?.length ?? 0, 0, "Scenery cannot advance the simulation")
  assert.equal(doc.cameras?.length ?? 0, 0)
  assert.equal(doc.extensions?.KHR_lights_punctual, undefined)
  for (const resource of [...doc.buffers, ...(doc.images ?? [])]) assert.equal(resource.uri, undefined)
  for (const name of manifest.required_nodes) {
    const node = doc.nodes.find((n: { name: string }) => n.name === name)
    assert.ok(node, `Missing scenery group ${name}`)
  }
  const root = doc.nodes.find((n: { name: string }) => n.name === "HF_Laboratory")
  assert.deepEqual(root.translation ?? [0, 0, 0], [0, 0, 0])
  assert.deepEqual(root.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1])
  assert.equal(root.extras.license, "CC0-1.0")
})
