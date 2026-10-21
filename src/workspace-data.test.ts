import assert from "node:assert/strict"
import test from "node:test"
import {
  parseInput,
  parseDelimited,
  exampleFiles,
  getBatches,
  reportsForSamples,
  filterMarkers,
  type InputFile,
  type ExperimentRow,
  type MarkerRow,
  type CultureRow,
} from "./workspace-data.ts"
import { fitExperimentPlan, conditionSummary } from "./experiment-model.ts"
import { simulateMeasurementsForecast } from "./culture-forecast.ts"
const file = (kind: keyof typeof exampleFiles): InputFile => ({
  ...parseInput(exampleFiles[kind], "example.csv"),
  name: `${kind}.csv`,
  sha256: "actual-test-hash",
  loaded_at: "2026-10-21T00:00:00Z",
  evidence: "user_supplied",
})

test("all three example inputs parse into the correct domain without joining samples", () => {
  const culture = file("culture")
  assert.equal(culture.kind, "culture")
  const batches = getBatches(culture)
  assert.equal(batches.length, 2)
  assert.equal(batches[0].measurements.length, 8)
  assert.equal(batches[0].measurements[5].channels.ph, 7.02)
  assert.equal(file("experiments").rows.length, 12)
  assert.equal(file("markers").rows.length, 6)
})
test("CSV supports BOM, escaped quotes, newlines, missing values and TSV/JSON", () => {
  assert.deepEqual(
    parseDelimited('a,b\r\n"one,""quoted""","two\nlines"\r\n', ","),
    [
      ["a", "b"],
      ['one,"quoted"', "two\nlines"],
    ],
  )
  assert.equal(
    parseInput(
      "\uFEFFbatch_id\telapsed_hours\tcell_count_million\nB\t0\t1\nB\t1\t\n",
      "input.tsv",
    ).rows.length,
    2,
  )
  const json = parseInput(
    JSON.stringify([
      { batch_id: "B", elapsed_hours: 0, cell_count_million: 0, ph: 0 },
    ]),
    "input.json",
  )
  assert.equal((json.rows[0] as CultureRow).count, 0)
  assert.equal((json.rows[0] as CultureRow).channels.ph, 0)
})
test("invalid imports are rejected with useful errors, without silently repairing time or units", () => {
  for (const text of [
    "batch_id,elapsed_hours,cell_count_million\nB,0,1\nB,0,2",
    "batch_id,elapsed_hours,cell_count_million\nB,24,1\nB,0,2",
    "batch_id,elapsed_hours,cell_count_million\nB,0,nope",
    "batch_id,elapsed_hours,cell_count_million,ph\nB,0,1,15",
    "batch_id,elapsed_hours,cell_count_million,unit\nB,0,1,cells/mL",
    "batch_id,elapsed_hours\nB,0",
    "batch_id,batch_id,cell_count_million\nB,0,1",
  ])
    assert.throws(() => parseInput(text, "bad.csv"))
  assert.throws(() => parseDelimited('a,b\n"unterminated', ","))
  assert.throws(() => parseInput('{"bad":1}', "bad.json"))
})
test("uploaded culture data feeds reports and simulation at the same cutoff without future leakage", () => {
  const input = file("culture")
  const batch = getBatches(input)[0]
  const reports = reportsForSamples(
    batch.measurements,
    120,
    batch.id,
    input,
    "2026-10-21T00:00:00Z",
  )
  assert.equal(reports.length, 40)
  assert.equal(reports.at(-1)?.last_count, 3.31)
  assert.equal(reports.at(-1)?.source_sha256, input.sha256)
  assert.equal(reports[38].last_measurement_hour, 96)
  assert.equal(reports[38].new_measurements, 0)
  const a = simulateMeasurementsForecast(batch.measurements, 24, 42, 96)
  const changed = batch.measurements.map((row) =>
    row.hour > 96 ? { ...row, count: 999 } : row,
  )
  assert.deepEqual(simulateMeasurementsForecast(changed, 24, 42, 96), a)
  assert.deepEqual(
    simulateMeasurementsForecast(batch.measurements, 24, 42, 96),
    a,
  )
  assert.notDeepEqual(
    simulateMeasurementsForecast(batch.measurements, 24, 43, 96).paths,
    a.paths,
  )
  assert.ok(
    a.paths.every((path) => path.every((n) => n > 0 && Number.isFinite(n))),
  )
  assert.throws(
    () => simulateMeasurementsForecast(batch.measurements, 24, 42, 24),
    /three measurements/,
  )
})
test("uploaded condition outcomes change fitted GP estimates and validation errors", () => {
  const rows = file("experiments").rows as ExperimentRow[]
  const summary = conditionSummary(rows)
  assert.equal(summary[0].n, 3)
  assert.ok(Math.abs(summary[0].mean - 7.8) < 1e-10)
  const model = fitExperimentPlan(rows)
  assert.equal(model.ranked.length, 4)
  assert.equal(model.validation.length, 4)
  assert.ok(
    model.ranked.every(
      (r) =>
        Number.isFinite(r.prediction) &&
        Number.isFinite(r.ei) &&
        r.uncertainty >= 0,
    ),
  )
  assert.ok(model.validation.every((r) => Number.isFinite(r.predicted)))
  const modified = rows.map((row) =>
    row.condition_id === rows[0].condition_id
      ? { ...row, response: row.response + 50 }
      : row,
  )
  assert.notDeepEqual(fitExperimentPlan(modified).ranked, model.ranked)
  assert.notDeepEqual(fitExperimentPlan(rows, "minimize").ranked, model.ranked)
  assert.throws(() => fitExperimentPlan(rows.slice(0, 3)), /three distinct/)
})
test("uploaded marker rows normalize phased calls and never match unknown genotypes", () => {
  const input = parseInput(
    "sample_id,kel_rs8176058,slc14a1_rs1058396\nS,A|G,G/G\nT,./.,G/G\n",
    "calls.csv",
  )
  const rows = filterMarkers(input.rows as MarkerRow[], "G/A", "G/G")
  assert.equal(rows[0].status, "match")
  assert.equal(rows[1].status, "unknown")
  assert.equal(
    filterMarkers(input.rows as MarkerRow[], "A/A", "G/G")[0].status,
    "excluded",
  )
})
