import test from "node:test"
import assert from "node:assert/strict"
import { botPayload, botExportUrl } from "./hemobot-api.ts"
import { initialInputs } from "./workspace-data.ts"

test("HemoBot submits source records and exact active context, without browser result assertions", () => {
  const context = { batch_id: "DEMO-R2", replay_elapsed_hours: 96, kel: "A/A", slc: "G/G",
    objective: "minimize" as const, verification_requests: [true, true, true] }
  const body = botPayload(initialInputs, context, "  Review marker evidence  ", "match", "template")
  assert.equal(body.query_en, "Review marker evidence")
  assert.deepEqual(body.active_context, context)
  assert.deepEqual(body.inputs.culture.rows, initialInputs.culture.rows)
  assert.equal("loaded_at" in body.inputs.culture, false)
  assert.equal("plan" in body, false)
  assert.equal("completed_lab_results" in body.active_context, false)
  assert.equal(body.language, "en")
})

test("audit export paths encode untrusted response IDs", () => {
  assert.equal(botExportUrl("../bad?x=1", "html"), "/api/v1/hemobot/analyses/..%2Fbad%3Fx%3D1/export?format=html")
})
