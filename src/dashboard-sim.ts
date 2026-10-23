// Simulated process variables for the Dashboard page. These are demo trajectories,
// not source measurements: each variable drifts hourly with seeded noise, and when
// automatic control is on, crossing an action limit applies a fixed correction.
// A medium exchange is shared: replacing part of the medium moves every variable
// with a fresh-medium value toward it, whichever variable triggered the exchange.

export interface Limits {
  // null = no limit on that side.
  warnLow: number | null
  warnHigh: number | null
  actLow: number | null
  actHigh: number | null
  // Correction size applied when an action limit is crossed (always ≥ 0).
  // For a medium exchange trigger, doseHigh is the exchanged volume in %.
  doseLow: number
  doseHigh: number
  auto: boolean
}

export interface ProcessVariable {
  id: string
  name: string
  unit: string
  digits: number
  start: number
  // Change per hour before control acts.
  drift: number
  noise: number
  // What the automated controller does on each side.
  lowAction?: string
  highAction?: string
  // Concentration in fresh medium; set = affected by every medium exchange.
  fresh?: number
  limits: Limits
}

export const exchangeAction = "Medium exchange"


const limits = (
  warnLow: number | null,
  warnHigh: number | null,
  actLow: number | null,
  actHigh: number | null,
  doseLow = 0,
  doseHigh = 0,
): Limits => ({ warnLow, warnHigh, actLow, actHigh, doseLow, doseHigh, auto: true })

export const processVariables: ProcessVariable[] = [
  { id: "lactate", name: "Lactate", unit: "mM", digits: 1, start: 1.2, drift: 0.13, noise: 0.15, highAction: exchangeAction, fresh: 0, limits: limits(null, 15, null, 20, 0, 40) },
  { id: "ammonia", name: "Ammonia", unit: "mM", digits: 2, start: 0.2, drift: 0.022, noise: 0.03, highAction: exchangeAction, fresh: 0, limits: limits(null, 2, null, 3, 0, 40) },
  { id: "glucose", name: "Glucose", unit: "g/L", digits: 2, start: 4.5, drift: -0.032, noise: 0.04, lowAction: "Glucose feed bolus", fresh: 4.5, limits: limits(2, null, 1.5, null, 2, 0) },
  { id: "glutamine", name: "Glutamine", unit: "mM", digits: 2, start: 4, drift: -0.028, noise: 0.03, lowAction: "Glutamine feed bolus", fresh: 4, limits: limits(1, null, 0.5, null, 2, 0) },
  { id: "ph", name: "Medium pH", unit: "pH", digits: 2, start: 7.25, drift: -0.004, noise: 0.012, lowAction: "Base addition (NaHCO₃)", highAction: "CO₂ sparge", limits: limits(7.0, 7.4, 6.9, 7.5, 0.18, 0.1) },
  { id: "osmolality", name: "Medium osmolality", unit: "mOsm/kg", digits: 0, start: 300, drift: 0.35, noise: 1.2, highAction: exchangeAction, fresh: 300, limits: limits(null, 340, null, 360, 0, 40) },
  { id: "do", name: "Dissolved oxygen", unit: "% air sat.", digits: 0, start: 45, drift: -0.18, noise: 0.8, lowAction: "Raise O₂ sparge", limits: limits(30, null, 20, null, 18, 0) },
  { id: "co2", name: "CO₂", unit: "mmHg", digits: 0, start: 38, drift: 0.4, noise: 1.2, highAction: "Increase gas stripping", limits: limits(null, 80, null, 100, 0, 30) },
  { id: "temp", name: "Temperature", unit: "°C", digits: 1, start: 37, drift: -0.012, noise: 0.06, lowAction: "Heater on", highAction: "Cooling jacket", limits: limits(36.5, 37.5, 36, 38, 0.8, 0.8) },
]

export interface Sample {
  hour: number
  value: number
}

export interface ControlAction {
  hour: number
  variable: string
  side: "low" | "high"
  label: string
  before: number
  after: number
  // Set on variables moved by an exchange another variable triggered.
  linkedFrom?: string
}

export type Level = "normal" | "warning" | "action"

// Deterministic so the replay shows the same trajectory every time.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5
  }
}

// Hours to wait after a correction before the controller may act again.
const cooldown = 3

export function simulate(settings: Record<string, Limits>, endHour: number) {
  const runs = processVariables.map((variable) => ({
    variable,
    settings: settings[variable.id] ?? variable.limits,
    random: seeded([...variable.id].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 7)),
    value: variable.start,
    ready: 0,
    samples: [{ hour: 0, value: variable.start }] as Sample[],
    actions: [] as ControlAction[],
  }))
  let exchangeReady = 0
  for (let hour = 1; hour <= endHour; hour++) {
    for (const run of runs) run.value += run.variable.drift + run.random() * 2 * run.variable.noise
    // The first exchange trigger over its limit decides the exchanged volume.
    const trigger =
      hour >= exchangeReady &&
      runs.find(
        ({ variable, settings, value }) =>
          variable.highAction === exchangeAction &&
          settings.auto &&
          settings.actHigh !== null &&
          value >= settings.actHigh,
      )
    if (trigger) {
      const fraction = Math.min(100, trigger.settings.doseHigh) / 100
      for (const run of runs) {
        if (run.variable.fresh === undefined) continue
        const after = run.value + (run.variable.fresh - run.value) * fraction
        run.actions.push({
          hour,
          variable: run.variable.id,
          side: after < run.value ? "high" : "low",
          label: exchangeAction,
          before: run.value,
          after,
          linkedFrom: run === trigger ? undefined : trigger.variable.id,
        })
        run.value = after
      }
      exchangeReady = hour + cooldown
    }
    for (const run of runs) {
      const { variable, settings } = run
      if (settings.auto && hour >= run.ready) {
        const side =
          settings.actLow !== null && run.value <= settings.actLow
            ? "low"
            : settings.actHigh !== null && run.value >= settings.actHigh && variable.highAction !== exchangeAction
              ? "high"
              : null
        if (side) {
          const after = run.value + (side === "low" ? settings.doseLow : -settings.doseHigh)
          run.actions.push({
            hour,
            variable: variable.id,
            side,
            label: (side === "low" ? variable.lowAction : variable.highAction) ?? "Correction",
            before: run.value,
            after,
          })
          run.value = after
          run.ready = hour + cooldown
        }
      }
      run.samples.push({ hour, value: run.value })
    }
  }
  return Object.fromEntries(runs.map(({ variable, samples, actions }) => [variable.id, { samples, actions }]))
}

export function level(value: number, settings: Limits): Level {
  if (
    (settings.actLow !== null && value <= settings.actLow) ||
    (settings.actHigh !== null && value >= settings.actHigh)
  )
    return "action"
  if (
    (settings.warnLow !== null && value <= settings.warnLow) ||
    (settings.warnHigh !== null && value >= settings.warnHigh)
  )
    return "warning"
  return "normal"
}

// Linear extrapolation over the last `window` hours; null when moving away from limits.
export function hoursToAction(samples: Sample[], settings: Limits, window = 6) {
  const last = samples.at(-1)
  const first = samples.at(-1 - window)
  if (!last || !first) return null
  const slope = (last.value - first.value) / (last.hour - first.hour)
  const target = slope < 0 ? settings.actLow : slope > 0 ? settings.actHigh : null
  if (target === null) return null
  const hours = (target - last.value) / slope
  return hours > 0 ? hours : null
}

// Warning limits must sit inside action limits, or the warning never shows first.
export function limitProblem(settings: Limits) {
  const { warnLow, warnHigh, actLow, actHigh } = settings
  if (warnLow !== null && actLow !== null && actLow >= warnLow)
    return "Low action limit must be below the low warning limit."
  if (warnHigh !== null && actHigh !== null && actHigh <= warnHigh)
    return "High action limit must be above the high warning limit."
  if (warnLow !== null && warnHigh !== null && warnLow >= warnHigh)
    return "Low warning limit must be below the high warning limit."
  return null
}
