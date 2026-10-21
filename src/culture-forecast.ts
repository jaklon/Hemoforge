import { cultureMeasurements } from "./culture-data.ts"
import type { Measurement } from "./culture-monitoring.ts"

export type ForecastHorizon = 24 | 48 | 72

export const forecastStartMinHour = cultureMeasurements[2].hour

export const forecastStartMaxHour =
  cultureMeasurements[cultureMeasurements.length - 1].hour

export function clampForecastStartHour(hour: number) {
  return Number.isFinite(hour)
    ? Math.max(
        forecastStartMinHour,

        Math.min(forecastStartMaxHour, Math.round(hour)),
      )
    : forecastStartMaxHour
}

function seededRandom(seed: number) {
  let state = seed | 0

  return () => {
    state = (state + 0x6d2b79f5) | 0

    let value = Math.imul(state ^ (state >>> 15), state | 1)

    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function percentile(sorted: number[], probability: number) {
  const position = (sorted.length - 1) * probability

  const lower = Math.floor(position)

  const fraction = position - lower

  return (
    sorted[lower] +
    (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction
  )
}

export function simulateCultureForecast(
  replicate: number,

  horizonHours: ForecastHorizon,

  seed = 42,

  asOfHour = forecastStartMaxHour,
) {
  return simulateMeasurementsForecast(
    cultureMeasurements.map((sample) => ({
      hour: sample.hour,
      count: sample.counts[replicate - 1],
      unit: "million cells",
    })),

    horizonHours,
    seed,
    clampForecastStartHour(asOfHour),
  )
}

export function simulateMeasurementsForecast(
  samples: Measurement[],

  horizonHours: ForecastHorizon,

  seed = 42,

  asOfHour = samples[samples.length - 1]?.hour ?? 0,
) {
  if (!Number.isFinite(asOfHour) || ![24, 48, 72].includes(horizonHours))
    throw new Error(
      "Choose a finite start time and a 24, 48, or 72 hour horizon.",
    )

  const fromHour = asOfHour

  const observations = samples.filter((sample) => sample.hour <= fromHour)

  if (observations.length < 3)
    throw new Error(
      "At least three measurements must be available at the replay cursor.",
    )

  if (
    observations.some(
      (sample, i) =>
        sample.count === null ||
        !Number.isFinite(sample.count) ||
        sample.count <= 0 ||
        !Number.isFinite(sample.hour) ||
        (i > 0 && sample.hour <= observations[i - 1].hour),
    )
  )
    throw new Error(
      "Simulation requires positive counts and strictly increasing sample times.",
    )

  if (observations.some((sample) => sample.unit !== observations[0].unit))
    throw new Error("Simulation requires consistent count units.")

  const counts = observations.map((sample) => sample.count!)

  const intervals = observations.slice(1).map((sample, i) => ({
    duration: sample.hour - observations[i].hour,

    logChange: Math.log(counts[i + 1]) - Math.log(counts[i]),
  }))

  const logDrift =
    intervals.reduce((sum, interval) => sum + interval.logChange, 0) /
    intervals.reduce((sum, interval) => sum + interval.duration, 0)

  const volatility = Math.sqrt(
    intervals.reduce(
      (sum, interval) =>
        sum +
        (interval.logChange - logDrift * interval.duration) ** 2 /
          interval.duration,

      0,
    ) /
      (intervals.length - 1),
  )

  const last = observations[observations.length - 1]

  const observedCount = counts[counts.length - 1]

  const unobservedHours = fromHour - last.hour

  const simulationCount = 500

  const paths = Array.from({ length: simulationCount }, () => [observedCount])

  const random = seededRandom(seed)

  const summarize = (step: number) => {
    const sorted = paths.map((path) => path[step]).sort((a, b) => a - b)

    return {
      hour: last.hour + step,

      lower95: percentile(sorted, 0.025),

      lower80: percentile(sorted, 0.1),

      median: percentile(sorted, 0.5),

      upper80: percentile(sorted, 0.9),

      upper95: percentile(sorted, 0.975),
    }
  }

  const distribution = unobservedHours === 0 ? [summarize(0)] : []

  for (let step = 1; step <= unobservedHours + horizonHours; step++) {
    for (const path of paths) {
      const normal =
        Math.sqrt(-2 * Math.log(1 - random())) *
        Math.cos(2 * Math.PI * random())

      // Drift is fitted in log space; each positive-valued path advances one hour.

      path.push(path[step - 1] * Math.exp(logDrift + volatility * normal))

      if (!Number.isFinite(path[step]) || path[step] <= 0)
        throw new Error(
          "Simulation exceeded the numeric range. Review extreme counts or choose a shorter time horizon.",
        )
    }

    if (step >= unobservedHours) distribution.push(summarize(step))
  }

  return {
    fromHour,

    startCount: distribution[0].median,

    observedHour: last.hour,

    observedCount,

    measurementCount: observations.length,

    simulationCount,

    paths: paths.map((path) => path.slice(unobservedHours)),

    distribution,

    logDrift,

    volatility,

    seed,
  }
}

export type CultureForecast = ReturnType<typeof simulateCultureForecast>
