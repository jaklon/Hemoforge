import assert from "node:assert/strict"
import test from "node:test"
import {
  clampForecastStartHour,
  simulateCultureForecast,
} from "./culture-forecast.ts"
import { cultureMeasurements } from "./culture-data.ts"

test("Monte Carlo paths start at the measurement and produce positive, ordered uncertainty ranges", () => {
  for (let replicate = 1; replicate <= 3; replicate++) {
    const forecast = simulateCultureForecast(replicate, 72)
    assert.equal(forecast.fromHour, 168)
    assert.equal(forecast.startCount, [6.42, 6.17, 6.31][replicate - 1])
    assert.equal(forecast.paths.length, 500)
    assert.equal(forecast.distribution.length, 73)
    for (const path of forecast.paths) {
      assert.equal(path.length, 73)
      assert.equal(path[0], forecast.startCount)
      assert.ok(path.every((value) => Number.isFinite(value) && value > 0))
    }
    for (const point of forecast.distribution) {
      assert.ok(point.lower95 <= point.lower80)
      assert.ok(point.lower80 <= point.median)
      assert.ok(point.median <= point.upper80)
      assert.ok(point.upper80 <= point.upper95)
    }
    const first = forecast.distribution[0]
    assert.equal(first.lower95, first.upper95)
    assert.ok(
      forecast.distribution[72].upper95 - forecast.distribution[72].lower95 >
        forecast.distribution[24].upper95 - forecast.distribution[24].lower95,
    )
  }
})

test("seeds reproduce simulations and changing the horizon preserves the same early futures", () => {
  const short = simulateCultureForecast(1, 24, 42)
  const repeated = simulateCultureForecast(1, 24, 42)
  const longer = simulateCultureForecast(1, 72, 42)
  const rerun = simulateCultureForecast(1, 24, 43)
  assert.deepEqual(short, repeated)
  assert.deepEqual(short.distribution, longer.distribution.slice(0, 25))
  assert.notDeepEqual(short.paths, rerun.paths)
  assert.equal(short.startCount, rerun.startCount)
  assert.ok(Math.abs(short.logDrift - Math.log(6.42 / 1.02) / 168) < 1e-12)
  assert.ok(short.volatility > 0)
})

test("moving the forecast start refits growth and variability from the available measurements", () => {
  const earlier = simulateCultureForecast(1, 72, 42, 96)
  const later = simulateCultureForecast(1, 72, 42, 120)
  assert.equal(earlier.fromHour, 96)
  assert.equal(earlier.observedHour, 96)
  assert.equal(earlier.observedCount, 3.62)
  assert.equal(earlier.measurementCount, 5)
  assert.equal(earlier.distribution[72].hour, 168)
  assert.equal(later.fromHour, 120)
  assert.equal(later.observedHour, 120)
  assert.equal(later.observedCount, 3.31)
  assert.equal(later.measurementCount, 6)
  assert.equal(later.distribution[72].hour, 192)
  assert.ok(Math.abs(earlier.logDrift - Math.log(3.62 / 1.02) / 96) < 1e-12)
  assert.notEqual(earlier.logDrift, later.logDrift)
  assert.notEqual(earlier.volatility, later.volatility)
  assert.notDeepEqual(earlier.paths, later.paths)
})

test("measurements after the forecast start cannot affect the simulation", () => {
  const before = simulateCultureForecast(1, 72, 42, 85)
  const future = cultureMeasurements.filter((sample) => sample.hour > 85)
  const original = future.map((sample) => [...sample.counts])
  try {
    for (const sample of future) sample.counts = [999, 888, 777]
    assert.deepEqual(simulateCultureForecast(1, 72, 42, 85), before)
  } finally {
    future.forEach((sample, i) => {
      sample.counts = original[i]
    })
  }
})

test("hourly starts between samples carry uncertainty forward from the latest available measurement", () => {
  const forecast = simulateCultureForecast(1, 72, 42, 85)
  const atLastSample = simulateCultureForecast(1, 72, 42, 72)
  assert.equal(forecast.fromHour, 85)
  assert.equal(forecast.observedHour, 72)
  assert.equal(forecast.observedCount, 3.84)
  assert.equal(forecast.measurementCount, 4)
  assert.equal(forecast.distribution.length, 73)
  assert.equal(forecast.distribution[0].hour, 85)
  assert.equal(forecast.distribution[72].hour, 157)
  assert.equal(forecast.logDrift, atLastSample.logDrift)
  assert.equal(forecast.volatility, atLastSample.volatility)
  assert.deepEqual(forecast.distribution[0], atLastSample.distribution[13])
  assert.ok(forecast.distribution[0].upper95 > forecast.distribution[0].lower95)
  for (const path of forecast.paths) {
    assert.equal(path.length, 73)
    assert.ok(path.every((value) => Number.isFinite(value) && value > 0))
  }
})

test("forecast starts stay within hours supported by at least three measurements", () => {
  assert.equal(clampForecastStartHour(-24), 48)
  assert.equal(clampForecastStartHour(240), 168)
  assert.equal(clampForecastStartHour(85.4), 85)
  assert.equal(clampForecastStartHour(Number.NaN), 168)
  const earliest = simulateCultureForecast(1, 72, 42, 0)
  assert.equal(earliest.fromHour, 48)
  assert.equal(earliest.measurementCount, 3)
  assert.ok(
    earliest.distribution.every((point) => Number.isFinite(point.upper95)),
  )
})
