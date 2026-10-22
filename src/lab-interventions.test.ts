import assert from "node:assert/strict"
import test from "node:test"
import {
  decisionBlockReason,
  interventionLabel,
  labControlRequest,
} from "./lab-interventions.ts"
import type { LabSnapshot } from "./lab-session.ts"

function policyState() {
  // Only fields read by the decision policy; the transport schema is covered separately.
  return {
    controller_connected: true,
    active_intervention: null,
    phase: "complete",
    culture_hours: 1,
    end_hour: 168,
    working_volume_ml: 499,
    interventions: [],
    assays: [],
    measurements: [{ sample_id: "FLEX2-001", collected_at_hour: 0 }],
    intervention_protocol: {
      culture_minutes: 3,
      decision_max_age_hours: 24,
      max_volume_ml: 550,
    },
  } as unknown as LabSnapshot
}

test("Guard decision policy requires fresh observations, new evidence after intervention, and bounded capacity", () => {
  const state = policyState()
  assert.equal(decisionBlockReason(state, "feed", 10), "")
  assert.match(
    decisionBlockReason({ ...state, measurements: [] }, "feed", 10),
    /FLEX2/,
  )
  assert.match(
    decisionBlockReason({ ...state, culture_hours: 25 }, "feed", 10),
    /24/,
  )
  assert.match(
    decisionBlockReason({ ...state, controller_connected: false }, "feed", 10),
    /3D/,
  )
  assert.match(
    decisionBlockReason({ ...state, phase: "analyzing" }, "feed", 10),
    /Selesaikan/,
  )
  assert.match(
    decisionBlockReason({ ...state, culture_hours: 167.99 }, "feed", 10),
    /Waktu/,
  )
  assert.match(
    decisionBlockReason({ ...state, working_volume_ml: 550 }, "feed", 10),
    /550/,
  )
  assert.match(
    decisionBlockReason(
      { ...state, working_volume_ml: 400 },
      "medium_exchange",
      25,
    ),
    /sampling/,
  )
  const applied = {
    id: "a".repeat(32),
    status: "applied",
    source_sample_id: "FLEX2-001",
  } as LabSnapshot["interventions"][number]
  assert.match(
    decisionBlockReason({ ...state, interventions: [applied] }, "feed", 10),
    /sampel FLEX2 baru/,
  )
  assert.equal(
    decisionBlockReason(
      { ...state, interventions: [{ ...applied, status: "cancelled" }] },
      "feed",
      10,
    ),
    "",
  )
  assert.match(
    decisionBlockReason(
      { ...state, active_intervention: { ...applied, status: "queued" } },
      "feed",
      10,
    ),
    /Selesaikan/,
  )
  assert.match(
    interventionLabel({ kind: "medium_exchange", amount: 25 }),
    /25%/,
  )
})

test("control requests keep credentials in headers and preserve the idempotent decision payload", async () => {
  const original = globalThis.fetch
  const calls: {
    url: string
    options: RequestInit
  }[] = []
  globalThis.fetch = async (input, options) => {
    calls.push({ url: String(input), options: options! })
    return new Response(JSON.stringify({ status: "queued" }), { status: 201 })
  }
  try {
    const body = {
      request_id: "a".repeat(32),
      source_sample_id: "FLEX2-001",
      kind: "feed",
      amount: 10,
      note: "Reviewed FLEX2",
    }
    await labControlRequest(
      "b".repeat(32),
      "interventions",
      "operator",
      "private-capability",
      body,
    )
    await labControlRequest(
      "b".repeat(32),
      "interventions",
      "operator",
      "private-capability",
      body,
    )
    assert.equal(calls[0].options.method, "POST")
    assert.equal(
      (calls[0].options.headers as Record<string, string>)["X-Lab-operator"],
      "private-capability",
    )
    assert.equal(calls[0].options.body, calls[1].options.body)
    assert.deepEqual(JSON.parse(String(calls[0].options.body)), body)
    assert.ok(!calls[0].url.includes("private-capability"))
    assert.ok(!String(calls[0].options.body).includes("private-capability"))
    await labControlRequest("b".repeat(32), "pair", "pair", "", {
      code: "abcdef012345",
    })
    assert.equal(
      Object.keys(calls[2].options.headers!).some((key) =>
        key.startsWith("X-Lab-"),
      ),
      false,
    )
  } finally {
    globalThis.fetch = original
  }
})
