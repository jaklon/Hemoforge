import assert from "node:assert/strict"
import test from "node:test"
import type { LabSnapshot } from "./lab-session.ts"
import {
  analysisMatches,
  fetchLiveAnalysis,
  liveAnalysisHold,
  liveCheckpointReports,
  type LiveAnalysis,
} from "./lab-live-analytics.ts"

function snapshot() {
  return {
    session_id: "a".repeat(32),
    batch_id: "VL-test",
    measurements_sha256: "b".repeat(64),
    culture_hours: 9,
    end_hour: 168,
    interventions: [],
    active_intervention: null,
    measurements: [
      {
        sample_id: "sample-1",
        collected_at_hour: 2.98,
        available_at_hour: 3.055,
        count: 500,
        unit: "million cells",
        quality: { status: "passed" },
      },
      {
        sample_id: "rejected",
        collected_at_hour: 4,
        available_at_hour: 4.075,
        count: 9999,
        unit: "million cells",
        quality: { status: "rejected" },
      },
      {
        sample_id: "future",
        collected_at_hour: 8.99,
        available_at_hour: 9.065,
        count: 700,
        unit: "million cells",
        quality: { status: "passed" },
      },
    ],
  } as unknown as LabSnapshot
}

test("checkpoints use assay release time and never borrow rejected or future results", () => {
  const reports = liveCheckpointReports(snapshot())
  assert.equal(reports.length, 3)
  assert.deepEqual(reports[0].source_sample_ids, [])
  assert.equal(reports[0].latest_count, null)
  assert.deepEqual(reports[1].source_sample_ids, ["sample-1"])
  assert.deepEqual(reports[1].newly_released_ids, ["sample-1"])
  assert.deepEqual(reports[2].newly_released_ids, [])
  assert.equal(reports[2].latest_count, 500)
  assert.deepEqual(
    liveCheckpointReports({ ...snapshot(), measurements: [] }).map(
      (row) => row.latest_count,
    ),
    [null, null, null],
  )
})

test("analytics provenance invalidates old sessions, settings, hashes and applied action segments", () => {
  const source = snapshot()
  const settings = { horizon: 24 as const, target_million: 1000 }
  const data = {
    session_id: source.session_id,
    source_hash: source.measurements_sha256,
    segment_id: "initial",
    settings,
  } as LiveAnalysis
  assert.equal(analysisMatches(data, source, settings), true)
  assert.equal(
    analysisMatches(data, { ...source, session_id: "c".repeat(32) }, settings),
    false,
  )
  assert.equal(
    analysisMatches(
      data,
      { ...source, measurements_sha256: "d".repeat(64) },
      settings,
    ),
    false,
  )
  assert.equal(
    analysisMatches(data, source, { ...settings, target_million: 2000 }),
    false,
  )
  assert.equal(
    analysisMatches(data, source, { ...settings, horizon: 48 }),
    false,
  )
  const cancelled = {
    id: "cancelled",
    status: "cancelled",
    completed_at_hour: 8,
  } as LabSnapshot["interventions"][number]
  assert.equal(
    analysisMatches(data, { ...source, interventions: [cancelled] }, settings),
    true,
  )
  const applied = { ...cancelled, id: "applied", status: "applied" as const }
  assert.equal(
    analysisMatches(data, { ...source, interventions: [applied] }, settings),
    false,
  )
  assert.match(
    liveAnalysisHold({ ...source, interventions: [applied] }),
    /Menunggu/,
  )
  assert.match(
    liveAnalysisHold({ ...source, active_intervention: applied }),
    /berlangsung/,
  )
  assert.match(
    liveAnalysisHold({
      ...source,
      culture_hours: 34,
      measurements: [source.measurements[0]],
    }),
    /24 jam/,
  )
})

test("live request sends only local session reference and bounded settings, without counts or credentials", async () => {
  const original = globalThis.fetch
  const calls: {
    url: string
    body: unknown
    headers: unknown
  }[] = []
  globalThis.fetch = ((async (url, options) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options?.body)),
      headers: options?.headers,
    })
    return new Response(JSON.stringify({ status: "needs_samples" }), {
      status: 200,
    })
  }) as typeof fetch)
  try {
    const source = snapshot()
    const settings = { horizon: 24 as const, target_million: 1000 }
    await fetchLiveAnalysis(source, settings, new AbortController().signal)
    assert.equal(
      calls[0].url,
      `/api/v1/lab/sessions/${source.session_id}/analytics`,
    )
    assert.deepEqual(calls[0].body, {
      source_hash: source.measurements_sha256,
      ...settings,
    })
    assert.deepEqual(calls[0].headers, {
      "Content-Type": "application/json",
      "X-HemoForge-Action": "virtual-lab",
    })
    await assert.rejects(
      fetchLiveAnalysis(
        source,
        { ...settings, target_million: 0 },
        new AbortController().signal,
      ),
    )
    await assert.rejects(
      fetchLiveAnalysis(
        source,
        { ...settings, target_million: NaN },
        new AbortController().signal,
      ),
    )
    assert.equal(calls.length, 1)
  } finally {
    globalThis.fetch = original
  }
})
