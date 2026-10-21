import { cultureMeasurements } from "./culture-data.ts"

import { doeConditions } from "./culture-doe.ts"

import {
  screeningProfiles,
  analyzeMeasurements,
  type Measurement,
} from "./culture-monitoring.ts"

export type DataKind = "culture" | "experiments" | "markers"

export interface CultureRow extends Measurement {
  batch_id: string

  cell_line: string

  channels: Record<string, number | null>
}

export interface ExperimentRow {
  condition_id: string

  lactate_mg_l: number

  ammonia_mg_l: number

  response: number

  response_unit: string
}

export interface MarkerRow {
  sample_id: string

  kel: string

  slc: string
}

export interface InputFile {
  kind: DataKind

  name: string

  sha256: string

  loaded_at: string

  evidence: "software_test_only" | "user_supplied"

  rows: (CultureRow | ExperimentRow | MarkerRow)[]
}

export interface WorkspaceInputs {
  culture: InputFile

  experiments: InputFile

  markers: InputFile
}

export const channels = [
  { key: "ph", label: "pH", unit: "" },

  { key: "temperature_c", label: "Temperature", unit: "°C" },

  { key: "do_percent", label: "Dissolved oxygen", unit: "%" },

  { key: "glucose_mmol_l", label: "Glucose", unit: "mmol/L" },

  { key: "glutamine_mmol_l", label: "Glutamine", unit: "mmol/L" },

  { key: "lactate_mmol_l", label: "Lactate", unit: "mmol/L" },

  { key: "ammonia_mmol_l", label: "Ammonia", unit: "mmol/L" },

  { key: "viability_percent", label: "Viability", unit: "%" },
]

export const exampleFiles: Record<DataKind, string> = {
  culture:
    "batch_id,cell_line,elapsed_hours,cell_count_million,ph,temperature_c,glucose_mmol_l,lactate_mmol_l\nEXAMPLE-A,BEL-A,0,1.02,7.2,37,10,1\nEXAMPLE-A,BEL-A,24,1.47,7.18,37,8.7,1.7\nEXAMPLE-A,BEL-A,48,2.21,7.16,37,7.5,2.6\nEXAMPLE-A,BEL-A,72,3.84,7.13,37,6.2,3.5\nEXAMPLE-A,BEL-A,96,3.62,7.08,37,5.1,4.5\nEXAMPLE-A,BEL-A,120,3.31,7.02,37,4,5.4\nEXAMPLE-A,BEL-A,144,5.08,7.04,37,3.5,6.1\nEXAMPLE-A,BEL-A,168,6.42,7.05,37,2.8,6.8\nEXAMPLE-B,BEL-A,0,1.11,7.2,37,10,1\nEXAMPLE-B,BEL-A,24,1.36,7.19,37,8.9,1.5\nEXAMPLE-B,BEL-A,48,2.06,7.17,37,7.8,2.3\nEXAMPLE-B,BEL-A,72,3.61,7.14,37,6.4,3.2\nEXAMPLE-B,BEL-A,96,3.44,7.1,37,5.4,4.1\nEXAMPLE-B,BEL-A,120,3.18,7.05,37,4.3,5.1\nEXAMPLE-B,BEL-A,144,4.86,7.06,37,3.6,5.9\nEXAMPLE-B,BEL-A,168,6.17,7.07,37,3,6.5\n",

  experiments:
    "condition_id,lactate_mg_l,ammonia_mg_l,response,response_unit\nL0-A0,0,0,7.5,fold_change\nL0-A0,0,0,7.8,fold_change\nL0-A0,0,0,8.1,fold_change\nL850-A0,850,0,4.9,fold_change\nL850-A0,850,0,5.3,fold_change\nL850-A0,850,0,5.6,fold_change\nL0-A41,0,41,6.1,fold_change\nL0-A41,0,41,6.4,fold_change\nL0-A41,0,41,6.7,fold_change\nL850-A41,850,41,3.6,fold_change\nL850-A41,850,41,3.9,fold_change\nL850-A41,850,41,4.2,fold_change\n",

  markers:
    "sample_id,kel_rs8176058,slc14a1_rs1058396\nEXAMPLE-01,G/A,G/G\nEXAMPLE-02,G/A,G/G\nEXAMPLE-03,G/G,G/A\nEXAMPLE-04,A/A,G/G\nEXAMPLE-05,./.,G/G\nEXAMPLE-06,G/A,T/G\n",
}

const fixtureFile = (kind: DataKind, rows: InputFile["rows"]): InputFile => ({
  kind,

  rows,

  name: `Built-in ${kind} demo`,

  sha256: "",

  loaded_at: "",

  evidence: "software_test_only",
})

export const initialInputs: WorkspaceInputs = {
  culture: fixtureFile(
    "culture",

    cultureMeasurements.flatMap((sample) =>
      sample.counts.map((count, index) => ({
        batch_id: `DEMO-R${index + 1}`,

        cell_line: "BEL-A demo",

        hour: sample.hour,

        count,

        unit: "million cells",

        channels: {},
      })),
    ),
  ),

  experiments: fixtureFile(
    "experiments",

    doeConditions.map((row) => ({
      condition_id: row[0],

      lactate_mg_l: Number(row[1]),

      ammonia_mg_l: Number(row[2]),

      response: Number(row[3]),

      response_unit: "demo_response",
    })),
  ),

  markers: fixtureFile(
    "markers",

    screeningProfiles.map((row) => ({
      sample_id: row.id,

      kel: row.kel,

      slc: row.slc,
    })),
  ),
}

export function parseDelimited(text: string, separator: string): string[][] {
  const rows: string[][] = []

  let row: string[] = []

  let field = ""

  let quoted = false

  let endedQuote = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'

        i++
      } else if (c === '"') {
        quoted = false

        endedQuote = true
      } else field += c
    } else if (c === '"') {
      if (field || endedQuote) throw new Error("Malformed quoted field.")

      quoted = true
    } else if (c === separator) {
      row.push(field.trim())

      field = ""

      endedQuote = false
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++

      row.push(field.trim())

      if (row.some(Boolean)) rows.push(row)

      row = []

      field = ""

      endedQuote = false
    } else {
      if (endedQuote && c.trim())
        throw new Error("Unexpected text after a quoted field.")

      if (!endedQuote) field += c
    }
  }

  if (quoted) throw new Error("Unclosed quoted field.")

  row.push(field.trim())

  if (row.some(Boolean)) rows.push(row)

  return rows
}

function header(value: string) {
  return value

    .replace(/^\uFEFF/, "")

    .trim()

    .toLowerCase()

    .replace(/[ -]/g, "_")
}

function numeric(
  value: unknown,

  label: string,

  optional = false,
): number | null {
  if (value === "" || value == null || value === "NA" || value === "N/A") {
    if (optional) return null

    throw new Error(`${label}: a numeric value is required.`)
  }

  if (
    typeof value === "boolean" ||
    !["number", "string"].includes(typeof value)
  )
    throw new Error(`${label}: expected a number.`)

  const number = Number(value)

  if (!Number.isFinite(number))
    throw new Error(`${label}: expected a finite number.`)

  if (Math.abs(number) > 1e12)
    throw new Error(
      `${label}: magnitude exceeds the supported local numeric range (1e12).`,
    )

  return number
}

export function parseInput(
  text: string,

  name: string,
): Pick<InputFile, "kind" | "rows"> {
  let objects: Record<string, unknown>[]

  if (/\.json$/i.test(name)) {
    const json = JSON.parse(text)

    const records = Array.isArray(json) ? json : json.rows

    if (
      !Array.isArray(records) ||
      records.some(
        (row) => !row || Array.isArray(row) || typeof row !== "object",
      )
    )
      throw new Error(
        "JSON must contain an array of row objects, or { rows: [...] }.",
      )

    objects = records.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [header(key), value]),
      ),
    )
  } else {
    const table = parseDelimited(text, /\.tsv$/i.test(name) ? "\t" : ",")

    if (table.length < 2)
      throw new Error("Include a header row and at least one data row.")

    const keys = table[0].map(header)

    if (new Set(keys).size !== keys.length || keys.some((key) => !key))
      throw new Error("Column headers must be unique and non-empty.")

    objects = table.slice(1).map((row, i) => {
      if (row.length !== keys.length)
        throw new Error(
          `Row ${i + 2}: expected ${keys.length} columns, received ${row.length}.`,
        )

      return Object.fromEntries(keys.map((key, j) => [key, row[j]]))
    })
  }

  if (!objects.length || objects.length > 10000)
    throw new Error("Provide between 1 and 10,000 data rows per file.")

  const first = objects[0]

  const kind: DataKind =
    "batch_id" in first
      ? "culture"
      : "condition_id" in first
        ? "experiments"
        : "sample_id" in first
          ? "markers"
          : (() => {
              throw new Error(
                "Data type not recognized. Use batch_id, condition_id, or sample_id. Download an example for the expected columns.",
              )
            })()

  const id = (value: unknown, label: string) => {
    if (typeof value !== "string" || !value.trim() || value.length > 120)
      throw new Error(`${label}: use a non-empty ID up to 120 characters.`)

    return value.trim()
  }

  let rows: InputFile["rows"]

  if (kind === "culture") {
    if (!("cell_count_million" in first))
      throw new Error(
        "Culture files require a cell_count_million column. Counts must be absolute millions of cells.",
      )

    rows = objects.map((row, index): CultureRow => {
      const line = `Row ${index + 2}`

      const hour = numeric(
        row.elapsed_hours ?? row.hour,

        `${line} elapsed_hours`,
      )!

      if (hour < 0 || hour > 8760)
        throw new Error(`${line}: elapsed_hours must be between 0 and 8760.`)

      const count = numeric(
        row.cell_count_million,

        `${line} cell_count_million`,

        true,
      )

      if (count !== null && count < 0)
        throw new Error(
          `${line}: counts cannot be negative. Leave a missing count empty.`,
        )

      if (row.unit && row.unit !== "million cells")
        throw new Error(
          `${line}: expected million cells. Convert absolute cell counts to millions; do not substitute cells/mL.`,
        )

      const values: Record<string, number | null> = {}

      for (const channel of channels) {
        values[channel.key] = numeric(
          row[channel.key],

          `${line} ${channel.key}`,

          true,
        )

        const value = values[channel.key]

        if (
          value !== null &&
          ((channel.key === "ph" && (value < 0 || value > 14)) ||
            (["do_percent", "viability_percent"].includes(channel.key) &&
              (value < 0 || value > 100)))
        )
          throw new Error(
            `${line}: ${channel.label} is outside its valid numeric range.`,
          )
      }

      return {
        batch_id: id(row.batch_id, `${line} batch_id`),

        cell_line:
          typeof row.cell_line === "string"
            ? row.cell_line.slice(0, 120)
            : "Not specified",

        hour,

        count,

        unit: "million cells",

        channels: values,
      }
    })

    const batches = new Map<string, CultureRow[]>()

    for (const row of rows as CultureRow[]) {
      const batch = batches.get(row.batch_id) ?? []

      if (batch.length && row.hour <= batch[batch.length - 1].hour)
        throw new Error(
          `Batch ${row.batch_id}: times must increase strictly. Duplicate or out-of-order samples are not accepted.`,
        )

      batch.push(row)

      batches.set(row.batch_id, batch)
    }

    if (batches.size > 30)
      throw new Error("A workspace supports at most 30 culture batches.")
  } else if (kind === "experiments") {
    rows = objects.map((row, index) => ({
      condition_id: id(row.condition_id, `Row ${index + 2} condition_id`),

      lactate_mg_l: numeric(row.lactate_mg_l, "lactate_mg_l")!,

      ammonia_mg_l: numeric(row.ammonia_mg_l, "ammonia_mg_l")!,

      response: numeric(row.response, "response")!,

      response_unit: id(row.response_unit, "response_unit"),
    }))

    const conditions = new Map<string, ExperimentRow>()

    for (const row of rows as ExperimentRow[]) {
      if (row.lactate_mg_l < 0 || row.ammonia_mg_l < 0)
        throw new Error("Factor concentrations cannot be negative.")

      const old = conditions.get(row.condition_id)

      if (
        old &&
        (old.lactate_mg_l !== row.lactate_mg_l ||
          old.ammonia_mg_l !== row.ammonia_mg_l)
      )
        throw new Error(
          `Condition ${row.condition_id} has inconsistent factor levels.`,
        )

      conditions.set(row.condition_id, row)
    }

    if (conditions.size > 60)
      throw new Error(
        "A run supports at most 60 distinct experimental conditions.",
      )

    if (
      new Set((rows as ExperimentRow[]).map((row) => row.response_unit))
        .size !== 1
    )
      throw new Error("All experimental responses must use the same unit.")
  } else {
    const call = (value: unknown) => {
      const text = String(value ?? "./.")

        .trim()

        .toUpperCase()

        .replace(/\|/g, "/")

      return text === "A/G" ? "G/A" : text
    }

    rows = objects.map((row, index) => ({
      sample_id: id(row.sample_id, `Row ${index + 2} sample_id`),

      kel: call(row.kel_rs8176058),

      slc: call(row.slc14a1_rs1058396),
    }))

    if (
      !Object.prototype.hasOwnProperty.call(first, "kel_rs8176058") ||
      !Object.prototype.hasOwnProperty.call(first, "slc14a1_rs1058396")
    )
      throw new Error(
        "Marker files need kel_rs8176058 and slc14a1_rs1058396 columns.",
      )

    if (
      new Set((rows as MarkerRow[]).map((row) => row.sample_id)).size !==
      rows.length
    )
      throw new Error("Marker sample_id values must be unique.")
  }

  return { kind, rows }
}

export function getBatches(file: InputFile) {
  const groups = new Map<string, CultureRow[]>()

  for (const row of file.rows as CultureRow[]) {
    const list = groups.get(row.batch_id) ?? []

    list.push(row)

    groups.set(row.batch_id, list)
  }

  return [...groups].map(([id, measurements]) => ({
    id,

    cellLine: measurements[0].cell_line,

    measurements,
  }))
}

export function reportsForSamples(
  samples: Measurement[],

  cursor: number,

  batchId: string,

  source: InputFile,

  generatedAt = new Date().toISOString(),
) {
  const end = Math.min(cursor, samples.at(-1)?.hour ?? 0)

  return Array.from({ length: Math.floor(end / 3) }, (_, i) => {
    const hour = (i + 1) * 3

    const current = analyzeMeasurements(samples, hour)

    const prior = analyzeMeasurements(samples, hour - 3)

    const fresh = current.visible.filter((sample) => sample.hour > hour - 3)

    const change =
      fresh.length &&
      current.latest &&
      prior.latest &&
      current.status !== "needs_review"
        ? current.latest.count! - prior.latest.count!
        : null

    return {
      generated_at: generatedAt,

      checkpoint_hour: hour,

      data_window: { from_hour: hour - 3, through_hour: hour },

      batch_id: batchId,

      dataset_id: source.sha256 || "software_test_only",

      quality_flag: source.evidence,

      source_name: source.name,

      source_sha256: source.sha256 || null,

      last_measurement_hour: current.latest?.hour ?? null,

      last_count: current.latest?.count ?? null,

      change_since_previous: change,

      new_measurements: fresh.length,

      status: current.status,

      open_warnings: current.events,

      summary: !fresh.length
        ? "No new measurements. Last available values are carried forward, not remeasured."
        : current.status === "needs_review"
          ? "New data require review; invalid counts are not used for growth calculations."
          : `New measurement at ${current.latest?.hour}h. ${
              current.events.length
                ? "Review the flagged trend and source notes."
                : "No configured growth rule triggered."
            }`,

      recommendation: current.events.length
        ? "Review source counts, data quality, and culture notes."
        : "Await the next source measurement; no equipment action is inferred.",
    }
  })
}

export function filterMarkers(rows: MarkerRow[], kel: string, slc: string) {
  const known = (call: string) => ["G/G", "G/A", "A/A"].includes(call)

  return rows.map((row) => ({
    id: row.sample_id,

    ...row,

    status:
      !known(row.kel) || !known(row.slc)
        ? "unknown"
        : row.kel === kel && row.slc === slc
          ? "match"
          : "excluded",
  }))
}
