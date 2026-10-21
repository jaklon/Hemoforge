import { cultureMeasurements } from "./culture-data.ts"

// shortcut: the inherited prototype numbers have no source manifest; verify a workbook before using them as research evidence.
export const demoSource = {
  dataset_id: "software_test_only",
  study_id: "culture-ui-fixture",
  source_id: "bundled-prototype",
  quality_flag: "software_test_only",
  unit: "million cells",
  reference: "10.15125/BATH-01456",
  source_verified: false,
} as const

export const replayEndHour =
  cultureMeasurements[cultureMeasurements.length - 1].hour

export interface Measurement {
  hour: number
  count: number | null
  unit: string
}
export type GuardEvent = {
  id: string
  hour: number
  variable: string
  value: number | null
  rule: string
  reason: string
  status: "warning" | "needs_review"
}

export function batchMeasurements(replicate: number): Measurement[] {
  if (![1, 2, 3].includes(replicate)) return []
  return cultureMeasurements.map((sample) => ({
    hour: sample.hour,
    count: sample.counts[replicate - 1],
    unit: demoSource.unit,
  }))
}

export function analyzeMeasurements(samples: Measurement[], cursor: number) {
  const visible = samples.filter(
    (sample) => Number.isFinite(sample.hour) && sample.hour <= cursor,
  )
  const events: GuardEvent[] = []
  let previousHour = -Infinity
  const valid: Measurement[] = []
  for (const [index, sample] of visible.entries()) {
    const invalid =
      sample.count === null ||
      !Number.isFinite(sample.count) ||
      sample.count <= 0 ||
      sample.hour < 0 ||
      sample.hour <= previousHour ||
      sample.unit !== demoSource.unit
    previousHour = Math.max(previousHour, sample.hour)
    if (invalid) {
      events.push({
        id: `data-${index}`,
        hour: sample.hour,
        variable: "cell_count",
        value: sample.count,
        rule: "valid_positive_measurement",
        status: "needs_review",
        reason:
          "A missing/non-positive count, duplicate/out-of-order time, or inconsistent unit prevents a valid growth calculation.",
      })
    } else {
      valid.push(sample)
      const last = valid.length - 1
      // Only adjacent, valid source rows may establish consecutive declines.
      if (
        index >= 2 &&
        last >= 2 &&
        visible[index - 1] === valid[last - 1] &&
        visible[index - 2] === valid[last - 2] &&
        sample.count! < valid[last - 1].count! &&
        valid[last - 1].count! < valid[last - 2].count!
      ) {
        events.push({
          id: `drop-${sample.hour}`,
          hour: sample.hour,
          variable: "cell_count",
          value: sample.count,
          rule: "two_consecutive_declines",
          status: "warning",
          reason: `${valid[last - 2].count!.toFixed(2)} → ${valid[last - 1].count!.toFixed(2)} → ${sample.count!.toFixed(2)} million cells at ${valid[last - 2].hour}, ${valid[last - 1].hour}, and ${sample.hour}h. Review source measurements and culture notes; this does not establish a cause.`,
        })
      }
    }
  }
  const latest = valid[valid.length - 1] ?? null
  const previous = valid[valid.length - 2] ?? null
  const hasIssue = events.some((event) => event.status === "needs_review")
  const canDerive = !hasIssue && latest !== null
  return {
    visible,
    valid,
    latest,
    events,
    status: hasIssue
      ? "needs_review"
      : !latest
        ? "no_data"
        : events.length
          ? "warning"
          : "normal",
    foldChange: canDerive ? latest.count! / valid[0].count! : null,
    growthRate:
      canDerive && previous
        ? Math.log(latest.count! / previous.count!) /
          (latest.hour - previous.hour)
        : null,
  } as const
}

export function checkpointReports(
  replicate: number,
  cursor: number,
  generatedAt = new Date().toISOString(),
) {
  const samples = batchMeasurements(replicate)
  const end = Math.min(replayEndHour, Math.max(0, cursor))
  return Array.from({ length: Math.floor(end / 3) }, (_, index) => {
    const hour = (index + 1) * 3
    const current = analyzeMeasurements(samples, hour)
    const previous = analyzeMeasurements(samples, hour - 3)
    const newMeasurements = current.visible.filter(
      (sample) => sample.hour > hour - 3,
    )
    const change =
      newMeasurements.length && current.latest && previous.latest
        ? current.latest.count! - previous.latest.count!
        : null
    return {
      generated_at: generatedAt,
      checkpoint_hour: hour,
      data_window: { from_hour: hour - 3, through_hour: hour },
      batch_id: `DEMO-R${replicate}`,
      ...demoSource,
      last_measurement_hour: current.latest?.hour ?? null,
      last_count: current.latest?.count ?? null,
      change_since_previous: change,
      new_measurements: newMeasurements.length,
      status: current.status,
      open_warnings: current.events,
      summary: !newMeasurements.length
        ? "No new measurements. Last available values are carried forward, not remeasured."
        : `New measurement at ${current.latest?.hour}h. ${
            current.events.length
              ? "Review the flagged trend and source notes."
              : "No configured growth rule triggered."
          }`,
      recommendation: current.events.length
        ? "Analyst review of source counts and culture notes."
        : "Await the next source measurement; no equipment action is inferred.",
    }
  })
}

export const screeningProfiles = [
  { id: "TEST-01", kel: "G/A", slc: "G/G" },
  { id: "TEST-02", kel: "G/A", slc: "G/G" },
  { id: "TEST-03", kel: "G/G", slc: "G/A" },
  { id: "TEST-04", kel: "A/A", slc: "G/G" },
  { id: "TEST-05", kel: "./.", slc: "G/G" },
  { id: "TEST-06", kel: "G/A", slc: "T/G" },
]

export function screenProfiles(kel: string, slc: string) {
  const isKnown = (call: string) => ["G/G", "G/A", "A/A"].includes(call)
  return screeningProfiles.map((profile) => ({
    ...profile,
    status:
      !isKnown(profile.kel) || !isKnown(profile.slc)
        ? "unknown"
        : profile.kel === kel && profile.slc === slc
          ? "match"
          : "excluded",
  }))
}
