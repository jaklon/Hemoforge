export interface GrowthSettings {
  horizon: number
  paths: number
  seed: number
  lookbackHours: number | null
  drift: number | null
  volatility: number | null
}

export interface PlanSettings {
  objective: "maximize" | "minimize"
  lengthScale: number
  noise: number | null
  exploration: number
}

export interface MonitoringSettings {
  declineCount: number
  dropPercent: number
  staleHours: number | null
}

export const defaultGrowthSettings: GrowthSettings = {
  horizon: 72,
  paths: 500,
  seed: 42,
  lookbackHours: null,
  drift: null,
  volatility: null,
}
export const defaultPlanSettings: PlanSettings = {
  objective: "maximize",
  lengthScale: 0.6,
  noise: null,
  exploration: 0.01,
}
export const defaultMonitoringSettings: MonitoringSettings = {
  declineCount: 2,
  dropPercent: 0,
  staleHours: null,
}

export function growthSettingsError(settings: GrowthSettings) {
  if (
    !Number.isInteger(settings.horizon) ||
    settings.horizon < 1 ||
    settings.horizon > 720
  )
    return "Future period must be a whole number from 1 to 720 hours."
  if (
    !Number.isInteger(settings.paths) ||
    settings.paths < 10 ||
    settings.paths > 2000
  )
    return "Choose 10–2,000 simulation paths."
  if (settings.paths * (settings.horizon + 1) > 250000)
    return "Use fewer paths or a shorter period: a local run supports 250,000 path points."
  if (
    !Number.isInteger(settings.seed) ||
    settings.seed < 0 ||
    settings.seed > 2147483647
  )
    return "Random seed must be an integer from 0 to 2147483647."
  if (
    settings.lookbackHours !== null &&
    (!Number.isFinite(settings.lookbackHours) || settings.lookbackHours <= 0)
  )
    return "Lookback must be positive, or blank to use all available samples."
  if (
    settings.drift !== null &&
    (!Number.isFinite(settings.drift) || Math.abs(settings.drift) > 1)
  )
    return "Log-growth rate must be between −1 and 1 per hour, or blank to fit from data."
  if (
    settings.volatility !== null &&
    (!Number.isFinite(settings.volatility) ||
      settings.volatility < 0 ||
      settings.volatility > 2)
  )
    return "Volatility must be between 0 and 2, or blank to fit from data."
  return ""
}

export function planSettingsError(settings: PlanSettings) {
  if (
    !Number.isFinite(settings.lengthScale) ||
    settings.lengthScale < 0.001 ||
    settings.lengthScale > 100
  )
    return "Length scale must be between 0.001 and 100."
  if (
    settings.noise !== null &&
    (!Number.isFinite(settings.noise) ||
      settings.noise < 0.0001 ||
      settings.noise > 10)
  )
    return "Noise SD must be between 0.0001 and 10, or blank to estimate from replicates."
  if (
    !Number.isFinite(settings.exploration) ||
    settings.exploration < 0 ||
    settings.exploration > 1000000
  )
    return "Exploration margin must be between 0 and 1,000,000 response units."
  return ""
}
