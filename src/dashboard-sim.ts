// Process variables for the Dashboard page. Variables with a `channel` follow the loaded
// batch data when it has that channel (linear between samples); the rest are demo
// trajectories, not source measurements: each drifts hourly with seeded noise, and when
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
  // Batch data channel that replaces the simulation, and its factor to `unit`.
  channel?: string
  scale?: number
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
  { id: "lactate", name: "Lactate", unit: "mM", digits: 1, start: 1.2, drift: 0.13, noise: 0.15, highAction: exchangeAction, fresh: 0, channel: "lactate_mmol_l", limits: limits(null, 15, null, 20, 0, 40) },
  { id: "ammonia", name: "Ammonia", unit: "mM", digits: 2, start: 0.2, drift: 0.022, noise: 0.03, highAction: exchangeAction, fresh: 0, channel: "ammonia_mmol_l", limits: limits(null, 2, null, 3, 0, 40) },
  { id: "glucose", name: "Glucose", unit: "g/L", digits: 2, start: 4.5, drift: -0.032, noise: 0.04, lowAction: "Glucose feed bolus", fresh: 4.5, channel: "glucose_mmol_l", scale: 0.18016, limits: limits(2, null, 1.5, null, 2, 0) },
  { id: "glutamine", name: "Glutamine", unit: "mM", digits: 2, start: 4, drift: -0.028, noise: 0.03, lowAction: "Glutamine feed bolus", fresh: 4, channel: "glutamine_mmol_l", limits: limits(1, null, 0.5, null, 2, 0) },
  { id: "ph", name: "Medium pH", unit: "pH", digits: 2, start: 7.25, drift: -0.004, noise: 0.012, lowAction: "Base addition (NaHCO₃)", highAction: "CO₂ sparge", limits: limits(7.0, 7.4, 6.9, 7.5, 0.18, 0.1) },
  { id: "osmolality", name: "Medium osmolality", unit: "mOsm/kg", digits: 0, start: 300, drift: 0.35, noise: 1.2, highAction: exchangeAction, fresh: 300, limits: limits(null, 340, null, 360, 0, 40) },
  { id: "do", name: "Dissolved oxygen", unit: "% air sat.", digits: 0, start: 45, drift: -0.18, noise: 0.8, lowAction: "Raise O₂ sparge", limits: limits(30, null, 20, null, 18, 0) },
  { id: "co2", name: "CO₂", unit: "mmHg", digits: 0, start: 38, drift: 0.4, noise: 1.2, highAction: "Increase gas stripping", limits: limits(null, 80, null, 100, 0, 30) },
  { id: "temp", name: "Temperature", unit: "°C", digits: 1, start: 37, drift: -0.012, noise: 0.06, lowAction: "Heater on", highAction: "Cooling jacket", limits: limits(36.5, 37.5, 36, 38, 0.8, 0.8) },
]

// v2: exchange triggers store doseHigh as exchanged volume %, not a concentration.
export const limitsKey = "dashboard-limits-v2"

const defaultLimits = () =>
  Object.fromEntries(processVariables.map((variable) => [variable.id, variable.limits]))

/** Limits saved on the Dashboard, read by the Dashboard and the activity log. */
export function loadLimits(): Record<string, Limits> {
  try {
    return { ...defaultLimits(), ...JSON.parse(localStorage.getItem(limitsKey) ?? "{}") }
  } catch {
    return defaultLimits()
  }
}

// Invalid entries (NaN while typing) fall back to that variable's defaults.
export function safeLimits(limits: Record<string, Limits>): Record<string, Limits> {
  return Object.fromEntries(
    processVariables.map((variable) => {
      const settings = limits[variable.id] ?? variable.limits
      const valid = Object.values(settings).every(
        (value) => value === null || typeof value === "boolean" || Number.isFinite(value),
      )
      return [variable.id, valid ? settings : variable.limits]
    }),
  )
}

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

// Linear interpolation between samples, held flat before the first and after the last.
export function valueAt(samples: Sample[], hour: number) {
  const next = samples.findIndex((sample) => sample.hour >= hour)
  if (next === -1) return samples.at(-1)!.value
  if (next === 0) return samples[0].value
  const a = samples[next - 1]
  const b = samples[next]
  return a.value + ((b.value - a.value) * (hour - a.hour)) / (b.hour - a.hour)
}

/** Measured samples per variable id, for the variables whose channel the batch rows carry. */
export function measuredSamples(rows: { hour: number; channels?: Record<string, number | null> }[]) {
  const result: Record<string, Sample[]> = {}
  for (const variable of processVariables) {
    const channel = variable.channel
    if (!channel) continue
    const samples = rows
      .map((row) => ({ hour: row.hour, value: (row.channels?.[channel] ?? NaN) * (variable.scale ?? 1) }))
      .filter((sample) => Number.isFinite(sample.value))
      .sort((a, b) => a.hour - b.hour)
    if (samples.length) result[variable.id] = samples
  }
  return result
}

// Sensor noise for one variable at one whole second, in [-0.5, 0.5). Hashed rather than
// drawn in sequence, so any second reads the same value whenever it is shown.
function jitter(seed: number, second: number) {
  let t = Math.imul(seed ^ second, 0x9e3779b1)
  t = Math.imul(t ^ (t >>> 15), 0x85ebca6b)
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35)
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296 - 0.5
}

const seedOf = (id: string) => [...id].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 7)

/** What the probe or analyzer reads at `hour`: the trajectory plus ±noise/2 per second. */
export function reading(variable: Pick<ProcessVariable, "id" | "noise">, trajectory: Sample[], hour: number) {
  return valueAt(trajectory, hour) + jitter(seedOf(variable.id), Math.round(hour * 3600)) * variable.noise
}

/** Readings over [from, to] on whole seconds, thinned to about `points` for long windows. */
export function readings(variable: Pick<ProcessVariable, "id" | "noise">, trajectory: Sample[], from: number, to: number, points = 300) {
  const step = Math.max(1, Math.ceil(((to - from) * 3600) / points))
  const result: Sample[] = []
  for (let second = Math.ceil((Math.max(0, from) * 3600) / step) * step; second < Math.round(to * 3600); second += step)
    result.push({ hour: second / 3600, value: reading(variable, trajectory, second / 3600) })
  if (to >= 0) result.push({ hour: to, value: reading(variable, trajectory, to) })
  return result
}

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

// Measured variables show the data as recorded: never corrected, never moved by an
// exchange and never triggering one, since that would rewrite what was measured.
export function simulate(settings: Record<string, Limits>, endHour: number, measured: Record<string, Sample[]> = {}) {
  const runs = processVariables.map((variable) => {
    const data = measured[variable.id]
    const start = data ? valueAt(data, 0) : variable.start
    return {
      variable,
      settings: settings[variable.id] ?? variable.limits,
      random: seeded(seedOf(variable.id)),
      data,
      value: start,
      ready: 0,
      samples: [{ hour: 0, value: start }] as Sample[],
      actions: [] as ControlAction[],
    }
  })
  let exchangeReady = 0
  for (let hour = 1; hour <= endHour; hour++) {
    for (const run of runs)
      run.value = run.data ? valueAt(run.data, hour) : run.value + run.variable.drift + run.random() * 2 * run.variable.noise
    // The first exchange trigger over its limit decides the exchanged volume.
    const trigger =
      hour >= exchangeReady &&
      runs.find(
        ({ variable, settings, value, data }) =>
          !data &&
          variable.highAction === exchangeAction &&
          settings.auto &&
          settings.actHigh !== null &&
          value >= settings.actHigh,
      )
    if (trigger) {
      const fraction = Math.min(100, trigger.settings.doseHigh) / 100
      for (const run of runs) {
        if (run.variable.fresh === undefined || run.data) continue
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
      if (settings.auto && !run.data && hour >= run.ready) {
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
