import test from "node:test"
import assert from "node:assert/strict"
import { emptyEvo2Draft, evo2Payload, evo2ExportUrl } from "./evo2-data.ts"

test("paired sequence preparation excludes VCF and inference settings", () => {
  const payload = evo2Payload({ ...emptyEvo2Draft, start: "", alternate_fasta: ">ALT\nACGT", vcf_text: "stale VCF" })
  assert.equal(payload.reference_start_1based, null)
  assert.equal("vcf_text" in payload, false)
  assert.equal("inference_enabled" in payload, false)
  assert.equal("provider_url" in payload, false)
})

test("VCF preparation requires an explicit integer coordinate", () => {
  assert.throws(() => evo2Payload({ ...emptyEvo2Draft, mode: "vcf_window" }), /coordinate/)
  assert.throws(() => evo2Payload({ ...emptyEvo2Draft, mode: "vcf_window", start: "1.5" }), /whole-number/)
  const payload = evo2Payload({ ...emptyEvo2Draft, mode: "vcf_window", start: "1000" })
  assert.equal(payload.reference_start_1based, 1000)
  assert.equal("alternate_fasta" in payload, false)
  assert.equal(evo2ExportUrl("../bad"), "/api/v1/evo2/preparations/..%2Fbad/export")
})
