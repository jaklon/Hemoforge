import test from "node:test"
import assert from "node:assert/strict"
import { emptyEvo2Draft, evo2Payload, evo2ExportUrl, evo2VariantsUrl, evo2DatasetPayload } from "./evo2-data.ts"

test("paired sequence preparation excludes VCF and inference settings", () => {
  const payload = evo2Payload({ ...emptyEvo2Draft, start: "", alternate_fasta: ">ALT\nACGT", vcf_text: "stale VCF" })
  assert.equal(payload.reference_start_1based, null)
  assert.equal("vcf_text" in payload, false)
  assert.equal("inference_enabled" in payload, false)
  assert.equal("provider_url" in payload, false)
})

test("public dataset filters stay on the local API and encode search text", () => {
  const url = new URL(evo2VariantsUrl("KEL", "test", "rs123&limit=1000", 20), "http://localhost")
  assert.equal(url.pathname, "/api/v1/evo2/dataset/variants")
  assert.equal(url.searchParams.get("limit"), "20")
  assert.equal(url.searchParams.get("q"), "rs123&limit=1000")
  assert.equal(url.searchParams.get("gene"), "KEL")
  assert.equal(url.searchParams.get("split"), "test")
  assert.equal(url.searchParams.get("offset"), "20")
})

test("dataset preparation submits bounded unique IDs without sequence or provider controls", () => {
  const ids = ["KEL:rs1:100:A:G"]
  const payload = evo2DatasetPayload(ids)
  ids.push("SLC14A1:rs2:200:G:A")
  assert.deepEqual(payload, { variant_ids: ["KEL:rs1:100:A:G"] })
  assert.throws(() => evo2DatasetPayload([]), /1–20/)
  assert.throws(() => evo2DatasetPayload(Array(21).fill("id")), /1–20/)
  assert.throws(() => evo2DatasetPayload(["id", "id"]), /unique/)
})

test("VCF preparation requires an explicit integer coordinate", () => {
  assert.throws(() => evo2Payload({ ...emptyEvo2Draft, mode: "vcf_window" }), /coordinate/)
  assert.throws(() => evo2Payload({ ...emptyEvo2Draft, mode: "vcf_window", start: "1.5" }), /whole-number/)
  const payload = evo2Payload({ ...emptyEvo2Draft, mode: "vcf_window", start: "1000" })
  assert.equal(payload.reference_start_1based, 1000)
  assert.equal("alternate_fasta" in payload, false)
  assert.equal(evo2ExportUrl("../bad"), "/api/v1/evo2/preparations/..%2Fbad/export")
})
