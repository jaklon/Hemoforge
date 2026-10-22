// Metabolites (mmol/L) follow BATH-01456-A in public/datasets/workspace/bath-bel-a-culture.csv
// at the nearest sample time; that file has no pH, so ph is a dummy acidification trend.
export const cultureMeasurements = [
  { hour: 0, counts: [1.02, 1.11, 0.98], medium: { glucose_mmol_l: 23.55, glutamine_mmol_l: 5.93, lactate_mmol_l: 0, ammonia_mmol_l: 0.36, ph: 7.3 } },
  { hour: 24, counts: [1.47, 1.36, 1.42], medium: { glucose_mmol_l: 22.48, glutamine_mmol_l: 5.12, lactate_mmol_l: 2.3, ammonia_mmol_l: 1.01, ph: 7.24 } },
  { hour: 48, counts: [2.21, 2.06, 2.14], medium: { glucose_mmol_l: 18.31, glutamine_mmol_l: 3.76, lactate_mmol_l: 6.74, ammonia_mmol_l: 1.66, ph: 7.12 } },
  { hour: 72, counts: [3.84, 3.61, 3.72], medium: { glucose_mmol_l: 14.81, glutamine_mmol_l: 2.6, lactate_mmol_l: 9.97, ammonia_mmol_l: 2.46, ph: 7.02 } },
  { hour: 96, counts: [3.62, 3.44, 3.51], medium: { glucose_mmol_l: 12.85, glutamine_mmol_l: 1.97, lactate_mmol_l: 11.08, ammonia_mmol_l: 2.88, ph: 6.96 } },
  { hour: 120, counts: [3.31, 3.18, 3.25], medium: { glucose_mmol_l: 11.55, glutamine_mmol_l: 1.64, lactate_mmol_l: 11.39, ammonia_mmol_l: 3.19, ph: 6.93 } },
  { hour: 144, counts: [5.08, 4.86, 4.97], medium: { glucose_mmol_l: 10.27, glutamine_mmol_l: 1.37, lactate_mmol_l: 11.48, ammonia_mmol_l: 3.4, ph: 6.91 } },
  { hour: 168, counts: [6.42, 6.17, 6.31], medium: { glucose_mmol_l: 8.98, glutamine_mmol_l: 1.11, lactate_mmol_l: 11.45, ammonia_mmol_l: 3.52, ph: 6.9 } },
]
