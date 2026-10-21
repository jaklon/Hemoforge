import type { ExperimentRow } from "./workspace-data.ts"
export function conditionSummary(rows: ExperimentRow[]) {
  const groups = new Map<string, ExperimentRow[]>()
  for (const row of rows) {
    const group = groups.get(row.condition_id) ?? []
    group.push(row)
    groups.set(row.condition_id, group)
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
      lactate: group[0].lactate_mg_l,
      ammonia: group[0].ammonia_mg_l,
      mean,
      sd,
      n: group.length,
      unit: group[0].response_unit,
    }
  })
}
export type ConditionSummary = ReturnType<typeof conditionSummary>[number]

// Shape returned by the Python experiment model (backend/predictions.py).
export interface ExperimentPlan {
  ranked: (ConditionSummary & {
    prediction: number
    uncertainty: number
    ei: number
  })[]
  candidates: {
    lactate: number
    ammonia: number
    prediction: number
    uncertainty: number
    ei: number
    tested: boolean
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
