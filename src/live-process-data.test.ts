import assert from "node:assert/strict"
import test from "node:test"
import { liveProcessData } from "./live-process-data.ts"
import type { LabSnapshot } from "./lab-session.ts"

test("process cards use only released QC-passed data and preserve measured units and missing channels", () => {
  const reading = {
    sample_id: "FLEX2-001",
    collected_at_hour: 2,
    available_at_hour: 2.075,
    count: 500,
    channels: {
      lactate_mmol_l: 3,
      glucose_mmol_l: 24,
      ammonium_mmol_l: 0.4,
      viability_percent: 96,
    },
    quality: { status: "passed" },
  }
  const snapshot = {
    culture_hours: 3,
    measurements: [
      reading,
      {
        ...reading,
        sample_id: "rejected",
        count: 9999,
        quality: { status: "rejected" },
      },
      { ...reading, sample_id: "future", available_at_hour: 4, count: 9999 },
    ],
  } as unknown as LabSnapshot
  const rows = liveProcessData(snapshot)
  assert.equal(rows.find((row) => row.id === "count")?.latest?.value, 500)
  assert.deepEqual(
    rows.find((row) => row.id === "count")?.samples.map((row) => row.sample_id),
    ["FLEX2-001"],
  )
  assert.equal(rows.find((row) => row.id === "glucose_mmol_l")?.unit, "mmol/L")
  assert.equal(
    rows.find((row) => row.id === "glucose_mmol_l")?.latest?.value,
    24,
  )
  assert.equal(
    rows.find((row) => row.id === "ammonium_mmol_l")?.name,
    "Ammonium (NH4)",
  )
  for (const id of ["osmolality", "temperature", "dissolved_oxygen", "co2"])
    assert.equal(rows.find((row) => row.id === id)?.latest, null)
  assert.ok(
    liveProcessData({ ...snapshot, measurements: [] }).every(
      (row) => row.samples.length === 0 && row.latest === null,
    ),
  )
})
