export const doeConditions = [
  ["L0 / A0", "0", "0", "7.84", "0.42"],
  ["L850 / A0", "850", "0", "5.26", "0.51"],
  ["L0 / A41", "0", "41", "6.41", "0.37"],
  ["L850 / A41", "850", "41", "3.92", "0.46"],
]

const means = doeConditions.map((row) => Number(row[3]))
export const doeEffects = {
  lactate: {
    low: (means[0] + means[2]) / 2,
    high: (means[1] + means[3]) / 2,
    effect: (means[1] + means[3] - means[0] - means[2]) / 2,
  },
  ammonia: {
    low: (means[0] + means[1]) / 2,
    high: (means[2] + means[3]) / 2,
    effect: (means[2] + means[3] - means[0] - means[1]) / 2,
  },
  interaction: {
    effect: (means[0] - means[1] - means[2] + means[3]) / 2,
    ammoniaLow: [means[0], means[1]],
    ammoniaHigh: [means[2], means[3]],
  },
}

export function formatDoeValue(value: number) {
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
  return `${value < 0 ? "−" : ""}${rounded.toFixed(2)}`
}
