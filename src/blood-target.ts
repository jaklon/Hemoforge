import { fitLogGrowth } from "./culture-forecast.ts"
import type { Measurement } from "./culture-monitoring.ts"

// Red cells in one adult transfusion unit, used by Bayley et al. (2018) as the
// manufacturing target for a single dose.
export const cellsPerUnit = 2e12

// Erythroblast exponential growth rates reported by Bayley et al. (2018):
// 0.029/h in static culture (24.25 h doubling) and 0.051/h stirred (13.93 h).
export const literatureGrowth = {
  static: { perHour: 0.029, doublingHours: 24.25, label: "Static flask" },
  stirred: { perHour: 0.051, doublingHours: 13.93, label: "Stirred tank" },
}

// Inhibition onsets from Bayley et al. (2018) (above ~15 mM lactate and ~4 mM
// ammonia), converted with the molar masses of lactate (90.08 g/mol) and
// ammonia (17.03 g/mol). The lethal pair is the 2640 mg/L lactate + 129 mg/L
// ammonia combination that mediated cell death in Phillips et al. (2025).
export const metaboliteLimits = {
  lactate: { inhibitory: 15 * 90.08, lethal: 2640 },
  ammonia: { inhibitory: 4 * 17.03, lethal: 129 },
}

// Phillips et al. (2025): BEL-A counts decline beyond 70 h of static batch
// culture, so one expansion stage cannot run longer than this without a split.
export const stageWindowHours = 70

// Labels only. No bundled dataset links an ABO/RhD group to culture behaviour,
// so the group tags the plan and the donor line; it enters no equation.
export const bloodGroups = [
  "O−",
  "O+",
  "A−",
  "A+",
  "B−",
  "B+",
  "AB−",
  "AB+",
] as const

export interface BloodTargetSettings {
  units: number
  group: (typeof bloodGroups)[number]
  rate: "fitted" | "static" | "stirred"
}

export const defaultBloodTarget: BloodTargetSettings = {
  units: 1,
  group: "O−",
  rate: "fitted",
}

export function bloodTargetError(settings: BloodTargetSettings) {
  if (
    !Number.isFinite(settings.units) ||
    settings.units <= 0 ||
    settings.units > 1000
  )
    return "Target must be between 0 and 1,000 adult units."
  if (!bloodGroups.includes(settings.group))
    return "Choose a blood group from the list."
  return ""
}

export function metaboliteStatus(lactate: number, ammonia: number) {
  const check = (value: number, limit: { inhibitory: number; lethal: number }) =>
    ({
      value,
      ...limit,
      status:
        value >= limit.lethal
          ? ("lethal" as const)
          : value >= limit.inhibitory
            ? ("inhibitory" as const)
            : ("below" as const),
    })
  const lactateCheck = check(lactate, metaboliteLimits.lactate)
  const ammoniaCheck = check(ammonia, metaboliteLimits.ammonia)
  return {
    lactate: lactateCheck,
    ammonia: ammoniaCheck,
    worst: [lactateCheck, ammoniaCheck].some((item) => item.status === "lethal")
      ? ("lethal" as const)
      : [lactateCheck, ammoniaCheck].some(
            (item) => item.status === "inhibitory",
          )
        ? ("inhibitory" as const)
        : ("below" as const),
  }
}

export function planBloodTarget(
  settings: BloodTargetSettings,
  samples: Measurement[],
) {
  const settingError = bloodTargetError(settings)
  if (settingError) throw new Error(settingError)

  const observations = samples
    .filter(
      (sample) =>
        sample.count !== null &&
        Number.isFinite(sample.count) &&
        sample.count > 0 &&
        Number.isFinite(sample.hour),
    )
    .map((sample) => ({ hour: sample.hour, count: sample.count! }))
    .sort((a, b) => a.hour - b.hour)

  if (!observations.length)
    throw new Error("No positive cell counts are available for this batch.")

  const warnings: string[] = []

  const fit =
    observations.length >= 3 ? fitLogGrowth(observations) : null

  if (!fit)
    warnings.push(
      "Fewer than three positive counts: the plan uses the published static rate instead of this batch.",
    )
  else if (!Number.isFinite(fit.logDrift) || fit.logDrift <= 0)
    warnings.push(
      "The fitted growth rate for this batch is not positive, so the published static rate is used instead.",
    )

  const fitted =
    fit && Number.isFinite(fit.logDrift) && fit.logDrift > 0
      ? fit.logDrift
      : null

  const chosen =
    settings.rate === "fitted" && fitted !== null
      ? { perHour: fitted, source: "fitted" as const }
      : settings.rate === "stirred"
        ? { perHour: literatureGrowth.stirred.perHour, source: "stirred" as const }
        : { perHour: literatureGrowth.static.perHour, source: "static" as const }

  if (settings.rate === "fitted" && fitted === null)
    warnings.push("Showing the published static rate in place of the fit.")

  const startCells = observations[observations.length - 1].count * 1e6
  const targetCells = settings.units * cellsPerUnit
  const fold = targetCells / startCells
  const doublings = Math.log2(fold)
  const doublingHours = Math.LN2 / chosen.perHour
  const hours = Math.max(0, doublings) * doublingHours
  const stages = Math.max(1, Math.ceil(hours / stageWindowHours))

  if (observations[observations.length - 1].count * 1e6 >= targetCells)
    warnings.push(
      "The batch already holds the requested number of cells, so no expansion is planned.",
    )

  if (stages > 1)
    warnings.push(
      `Static BEL-A counts decline beyond ${stageWindowHours} h, so this target needs about ${stages} expansion stages with a split and medium exchange between them.`,
    )

  return {
    group: settings.group,
    units: settings.units,
    targetCells,
    startCells,
    startHour: observations[observations.length - 1].hour,
    fold,
    doublings,
    rate: chosen,
    fittedPerHour: fitted,
    doublingHours,
    hours,
    days: hours / 24,
    stages,
    stageWindowHours,
    warnings,
  }
}

export type BloodTargetPlan = ReturnType<typeof planBloodTarget>
