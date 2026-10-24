import type { ExperimentRow } from "./workspace-data.ts"
export function conditionSummary(rows: ExperimentRow[]) {
  const groups = new Map<string, ExperimentRow[]>()
  for (const row of rows) {
    const group = groups.get(row.condition_id) ?? []
    group.push(row)
    groups.set(row.condition_id, group)
  }
  const average = (values: (number | null)[]) => {
    const present = values.filter((value): value is number => value != null)
    return present.length
      ? present.reduce((sum, value) => sum + value, 0) / present.length
      : null
  }
  return [...groups].map(([id, group]) => {
    const mean =
      group.reduce((sum, row) => sum + row.response, 0) / group.length
    const sd =
      group.length > 1
        ? Math.sqrt(
            group.reduce((sum, row) => sum + (row.response - mean) ** 2, 0) /
              (group.length - 1),
          )
        : null
    return {
      id,
      factors: group[0].factors,
      mean,
      sd,
      n: group.length,
      unit: group[0].response_unit,
      lactate: average(group.map((row) => row.measured_lactate_mg_l)),
      ammonia: average(group.map((row) => row.measured_ammonia_mg_l)),
    }
  })
}
export type ConditionSummary = ReturnType<typeof conditionSummary>[number]

// Shape returned by the Python experiment model (backend/predictions.py).
export interface ExperimentPlan {
  factorNames: string[]
  gridSize: number
  ranked: (Omit<ConditionSummary, "lactate" | "ammonia"> & {
    prediction: number
    uncertainty: number
    ei: number
  })[]
  candidates: {
    factors: Record<string, number>
    prediction: number
    uncertainty: number
    ei: number
    tested: boolean
    /** Predicted end-of-run values; present only when every condition measured them. */
    metabolites: { lactate_mg_l?: number; ammonia_mg_l?: number }
  }[]
  validation: {
    condition: string
    actual: number
    predicted: number
    baseline: number
  }[]
  mae: number
  baselineMAE: number
  noise: { source: "replicates" | "setting" | "default"; sd: number; dof: number }
  method: string
  objective: "maximize" | "minimize"
}

const factorLabels: Record<string, string> = {
  epo_iu_ml: "EPO IU/mL",
  scf_ng_ml: "SCF ng/mL",
  il3_ng_ml: "IL-3 ng/mL",
  glucose_mmol_l: "Glucose mM",
  glutamine_mmol_l: "Glutamine mM",
  seed_1e5_per_ml: "Seeding 10⁵/mL",
  exchange_hours: "Exchange h",
  lactate_mg_l: "Lactate added mg/L",
  ammonia_mg_l: "Ammonia added mg/L",
}

export const factorLabel = (name: string) =>
  factorLabels[name] ?? name.replace(/_/g, " ")
