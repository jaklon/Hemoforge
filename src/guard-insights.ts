import {
  analyzeMeasurements,
  type GuardEvent,
  type Measurement,
} from "./culture-monitoring.ts"
import {
  defaultMonitoringSettings,
  type MonitoringSettings,
} from "./research-settings.ts"

export interface GuardView {
  window: number
  scale: "count" | "fold"
  compare: boolean
  hiddenBatchIds: string[]
  attentionOnly: boolean
}

export const defaultGuardView: GuardView = {
  window: 0,
  scale: "count",
  compare: true,
  hiddenBatchIds: [],
  attentionOnly: false,
}

export function summarizeGuardBatch(
  samples: Measurement[],
  hour: number,
  monitoring = defaultMonitoringSettings,
) {
  const state = analyzeMeasurements(samples, hour, monitoring)
  const previous = state.valid.at(-2)
  const delta =
    state.growthRate !== null && previous && state.latest
      ? state.latest.count! - previous.count!
      : null
  return {
    ...state,
    delta,
    percentChange:
      delta !== null && previous ? (delta / previous.count!) * 100 : null,
    sampleAge: state.latest ? Math.max(0, hour - state.latest.hour) : null,
    priority:
      state.status === "needs_review"
        ? 3
        : state.status === "warning"
          ? 2
          : state.status === "no_data"
            ? 1
            : 0,
    trend:
      delta === null
        ? "Awaiting comparison"
        : delta < 0
          ? "Declining"
          : delta > 0
            ? "Increasing"
            : "Unchanged",
  }
}

export type GuardBatchSummary = ReturnType<typeof summarizeGuardBatch>

export function sampleSteps(samples: Measurement[], hour: number) {
  const times = [
    ...new Set(
      samples
        .map((sample) => sample.hour)
        .filter((time) => Number.isFinite(time) && time >= 0),
    ),
  ].sort((a, b) => a - b)
  return {
    previous: times.filter((time) => time < hour).at(-1) ?? null,
    next: times.find((time) => time > hour) ?? null,
    last: times.at(-1) ?? null,
  }
}

export function guardSeries(
  summary: GuardBatchSummary,
  from: number,
  scale: GuardView["scale"],
) {
  const segments: {
    hour: number
    value: number
    count: number
  }[][] = []
  if (scale === "fold" && summary.foldChange === null) return segments
  const baseline = scale === "fold" ? (summary.valid[0]?.count ?? 1) : 1
  const valid = new Set(summary.valid)
  let segment: typeof segments[number] = []
  for (const sample of summary.visible) {
    if (sample.hour < from || !valid.has(sample)) {
      if (segment.length) segments.push(segment)
      segment = []
    } else
      segment.push({
        hour: sample.hour,
        value: sample.count! / baseline,
        count: sample.count!,
      })
  }
  if (segment.length) segments.push(segment)
  return segments
}

export function guardEventInfo(
  event: GuardEvent,
  monitoring: MonitoringSettings,
) {
  if (event.status === "needs_review")
    return {
      title: "Measurement needs review",
      action:
        "Check the source row for a missing or non-positive count, time order, and units before interpreting growth.",
    }
  if (event.variable === "sample_age")
    return {
      title: "Sample age exceeds your limit",
      action:
        "Review the sampling schedule and import a newer measurement when available.",
    }
  return {
    title: `${monitoring.declineCount} consecutive ${
      monitoring.declineCount === 1 ? "decline" : "declines"
    }`,
    action:
      "Check the original counts and sampling notes. Re-measure if needed before drawing a conclusion about the culture.",
  }
}

export function formatGuardNumber(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—"
  return value !== 0 && Math.abs(value) < 0.01
    ? value.toPrecision(3)
    : value.toLocaleString("en-US", { maximumFractionDigits: digits })
}
