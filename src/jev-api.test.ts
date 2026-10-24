import test from "node:test"

import assert from "node:assert/strict"

import { isFinished, JevError, jevJob, jevText, submitJev } from "./jev-api.ts"

function respond(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  return calls
}

test("JEV submissions send the CSRF action header and the message as JSON", async () => {
  const calls = respond(202, { job_id: "9a733ef3-2e8f-4934-9614-b1bc0cf5884a", status: "queued" })

  const job = await submitJev("Use Evo 2 on ACGT")

  assert.equal(job.status, "queued")
  assert.equal(calls[0].url, "/api/v1/jev/chat")
  assert.equal(calls[0].init.method, "POST")
  assert.equal((calls[0].init.headers as Record<string, string>)["X-HemoForge-Action"], "jev-chat")
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { message: "Use Evo 2 on ACGT" })
})

test("JEV job lookups encode untrusted IDs", async () => {
  const calls = respond(200, { job_id: "x", status: "running" })

  await jevJob("../bad?x=1")

  assert.equal(calls[0].url, "/api/v1/jev/jobs/..%2Fbad%3Fx%3D1")
})

test("JEV errors keep the HTTP status for sign-in, quota and outage handling", async () => {
  for (const [status, pattern] of [[401, /Sign in/], [429, /limit/], [503, /unavailable/]] as const) {
    respond(status, { detail: status === 429 ? "Daily GPU request limit reached (10 per 24 hours)." : "x" })
    await assert.rejects(submitJev("hi"), (error: unknown) =>
      error instanceof JevError && error.status === status && (status === 503 || pattern.test(error.message)))
  }

  globalThis.fetch = (async () => { throw new TypeError("network") }) as typeof fetch
  await assert.rejects(jevJob("a"), (error: unknown) => error instanceof JevError && error.status === null)
})

test("JEV output renders as text and only completed/failed jobs stop polling", () => {
  assert.equal(jevText("<b>plain</b>"), "<b>plain</b>")
  assert.equal(jevText({ score: -1.5 }), '{\n  "score": -1.5\n}')
  assert.equal(jevText(null), "")
  assert.equal(isFinished({ status: "completed" }), true)
  assert.equal(isFinished({ status: "failed" }), true)
  assert.equal(isFinished({ status: "running" }), false)
})
