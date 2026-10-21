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
function solve(matrix: number[][], vector: number[]) {
  const a = matrix.map((row, i) => [...row, vector[i]])
  for (let i = 0; i < a.length; i++) {
    let pivot = i
    for (let j = i + 1; j < a.length; j++)
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j
    ;[a[i], a[pivot]] = [a[pivot], a[i]]
    if (Math.abs(a[i][i]) < 1e-12)
      throw new Error(
        "The experimental matrix is singular. Review repeated factor settings.",
      )
    const scale = a[i][i]
    for (let k = i; k <= a.length; k++) a[i][k] /= scale
    for (let j = 0; j < a.length; j++)
      if (j !== i) {
        const weight = a[j][i]
        for (let k = i; k <= a.length; k++) a[j][k] -= weight * a[i][k]
      }
  }
  return a.map((row) => row[a.length])
}
function normalCDF(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const pdf = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)
  const p =
    1 -
    pdf *
      t *
      (0.31938153 +
        t *
          (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x < 0 ? 1 - p : p
}
export function fitExperimentPlan(
  rows: ExperimentRow[],
  objective: "maximize" | "minimize" = "maximize",
) {
  const conditions = conditionSummary(rows)
  if (conditions.length < 3)
    throw new Error(
      "At least three distinct conditions are required for a GP and held-out comparison.",
    )
  if (conditions.length > 60)
    throw new Error("At most 60 conditions are supported in a local fit.")
  const maxL = Math.max(...conditions.map((r) => r.lactate), 1)
  const maxA = Math.max(...conditions.map((r) => r.ammonia), 1)
  const kernel = (a: typeof conditions[number], b: typeof conditions[number]) =>
    Math.exp(
      (-0.5 *
        (((a.lactate - b.lactate) / maxL) ** 2 +
          ((a.ammonia - b.ammonia) / maxA) ** 2)) /
        0.6 ** 2,
    )
  const noise = 0.05 ** 2
  const predict = (
    training: typeof conditions,
    target: typeof conditions[number],
  ) => {
    const offset = training.reduce((s, r) => s + r.mean, 0) / training.length
    const scale =
      Math.sqrt(
        training.reduce((s, r) => s + (r.mean - offset) ** 2, 0) /
          training.length,
      ) || 1
    const covariance = training.map((a, i) =>
      training.map((b, j) => kernel(a, b) + (i === j ? noise : 0)),
    )
    const k = training.map((r) => kernel(r, target))
    const alpha = solve(
      covariance,
      training.map((r) => (r.mean - offset) / scale),
    )
    const weights = solve(covariance, k)
    return {
      mean: offset + scale * k.reduce((s, x, i) => s + x * alpha[i], 0),
      sd:
        scale *
        Math.sqrt(
          Math.max(0, 1 - k.reduce((s, x, i) => s + x * weights[i], 0)),
        ),
    }
  }
  const validation = conditions.map((condition, i) => {
    const training = conditions.filter((_, j) => i !== j)
    const predicted = predict(training, condition)
    return {
      condition: condition.id,
      actual: condition.mean,
      predicted: predicted.mean,
      baseline: training.reduce((s, r) => s + r.mean, 0) / training.length,
    }
  })
  const best =
    objective === "maximize"
      ? Math.max(...conditions.map((r) => r.mean))
      : Math.min(...conditions.map((r) => r.mean))
  const ranked = conditions
    .map((condition) => {
      const predicted = predict(conditions, condition)
      const improvement =
        (objective === "maximize"
          ? predicted.mean - best
          : best - predicted.mean) - 0.01
      const z = predicted.sd > 0 ? improvement / predicted.sd : 0
      const ei =
        predicted.sd > 0
          ? improvement * normalCDF(z) +
            (predicted.sd * Math.exp((-z * z) / 2)) / Math.sqrt(2 * Math.PI)
          : Math.max(0, improvement)
      return {
        ...condition,
        prediction: predicted.mean,
        uncertainty: predicted.sd,
        ei: Math.max(0, ei),
      }
    })
    .sort((a, b) => b.ei - a.ei)
  return {
    ranked,
    validation,
    mae:
      validation.reduce((s, r) => s + Math.abs(r.actual - r.predicted), 0) /
      validation.length,
    baselineMAE:
      validation.reduce((s, r) => s + Math.abs(r.actual - r.baseline), 0) /
      validation.length,
    method:
      "RBF Gaussian process; fixed normalized length scale 0.6; noise SD 0.05; candidate remeasurement within observed conditions",
    objective,
  }
}
