// ErythroPilot interpretation: trend health between the last two samples of each
// variable, and the planned 21-day roadmap that places the replay hour in a phase.
// The roadmap is a protocol plan, not a forecast; stages are never inferred from time.
import type { CultureRow } from "./workspace-data"

// GSE53983 (An et al., 2014): five terminal erythroid stages, three replicates each.
export const erythroidStages = [
  "Proerythroblast",
  "Early basophilic",
  "Late basophilic",
  "Polychromatic",
  "Orthochromatic",
] as const

export const roadmapHours = 21 * 24

// ponytail: typical three-phase protocol, fixed; make it editable when labs bring their own.
export const roadmapPhases = [
  { name: "Expansion", from: 0, to: 168, stages: [0], focus: "Grow progenitors to target count" },
  { name: "Differentiation", from: 168, to: 336, stages: [1, 2, 3], focus: "Shift medium to drive haemoglobinisation" },
  { name: "Maturation", from: 336, to: roadmapHours, stages: [4], focus: "Enucleation, then harvest and laboratory QC" },
]

export function plannedPhase(hour: number) {
  return roadmapPhases.find((phase) => hour < phase.to) ?? roadmapPhases.at(-1)!
}

export type Verdict = "improving" | "stable" | "worsening" | "no_data"

export interface TrendItem {
  key: string
  label: string
  unit: string
  latest: { hour: number; value: number } | null
  previous: { hour: number; value: number } | null
  verdict: Verdict
  note: string
}

// Which direction is healthy, and how big a move counts as a change.
const rules: {
  key: string
  label: string
  unit: string
  better: "up" | "down" | "toward"
  threshold: number
  relative: boolean
  target?: number
}[] = [
  { key: "count", label: "Viable cells", unit: "×10⁶", better: "up", threshold: 0.05, relative: true },
  { key: "lactate_mmol_l", label: "Lactate", unit: "mmol/L", better: "down", threshold: 0.05, relative: true },
  { key: "ammonia_mmol_l", label: "Ammonia", unit: "mmol/L", better: "down", threshold: 0.05, relative: true },
  { key: "glucose_mmol_l", label: "Glucose", unit: "mmol/L", better: "up", threshold: 0.1, relative: true },
  { key: "glutamine_mmol_l", label: "Glutamine", unit: "mmol/L", better: "up", threshold: 0.1, relative: true },
  { key: "ph", label: "pH", unit: "", better: "toward", threshold: 0.03, relative: false, target: 7.3 },
]

const notes: Record<string, Record<Exclude<Verdict, "no_data">, string>> = {
  count: { improving: "Growing", stable: "Holding steady", worsening: "Count falling" },
  lactate_mmol_l: { improving: "Cleared", stable: "Steady", worsening: "Accumulating" },
  ammonia_mmol_l: { improving: "Cleared", stable: "Steady", worsening: "Accumulating" },
  glucose_mmol_l: { improving: "Replenished", stable: "Steady", worsening: "Being depleted" },
  glutamine_mmol_l: { improving: "Replenished", stable: "Steady", worsening: "Being depleted" },
  ph: { improving: "Moving toward 7.3", stable: "Steady", worsening: "Drifting from 7.3" },
}

export function trendHealth(rows: CultureRow[], hour: number): TrendItem[] {
  return rules.map((rule) => {
    const value = (row: CultureRow) => (rule.key === "count" ? row.count : row.channels[rule.key])
    const seen = rows
      .filter((row) => row.hour <= hour && Number.isFinite(value(row)) && (rule.key !== "count" || value(row)! > 0))
      .map((row) => ({ hour: row.hour, value: value(row)! }))
    const [previous, latest] = [seen.at(-2) ?? null, seen.at(-1) ?? null]
    const base = { key: rule.key, label: rule.label, unit: rule.unit, latest, previous }
    if (!latest || !previous)
      return { ...base, verdict: "no_data", note: latest ? "Needs a second sample" : "Not measured" }
    const change =
      rule.better === "toward"
        ? Math.abs(previous.value - rule.target!) - Math.abs(latest.value - rule.target!)
        : (latest.value - previous.value) * (rule.better === "up" ? 1 : -1)
    const size = rule.relative ? change / Math.abs(previous.value || 1) : change
    const verdict: Verdict = size > rule.threshold ? "improving" : size < -rule.threshold ? "worsening" : "stable"
    return { ...base, verdict, note: notes[rule.key][verdict] }
  })
}

export function overallHealth(items: TrendItem[], warnings: number) {
  const measured = items.filter((item) => item.verdict !== "no_data")
  if (!measured.length) return { tone: "no_data", label: "Not enough samples to judge" } as const
  const worsening = measured.filter((item) => item.verdict === "worsening")
  if (worsening.length || warnings)
    return {
      tone: "warning",
      label: [
        worsening.length && `${worsening.length} trend${worsening.length === 1 ? "" : "s"} worsening`,
        warnings && `${warnings} open Guard warning${warnings === 1 ? "" : "s"}`,
      ]
        .filter(Boolean)
        .join(" · "),
    } as const
  return { tone: "normal", label: "All measured trends steady or improving" } as const
}
