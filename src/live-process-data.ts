import type { LabSnapshot } from "./lab-session.ts"
import { biostatProcessData } from "./biostat-data.ts"

export const liveProcessVariables = [
  { id: "count", name: "Cell count", unit: "×10⁶ cells", digits: 2 },
  { id: "lactate_mmol_l", name: "Lactate", unit: "mmol/L", digits: 3 },
  { id: "ammonium_mmol_l", name: "Ammonium (NH4)", unit: "mmol/L", digits: 3 },
  { id: "glucose_mmol_l", name: "Glucose", unit: "mmol/L", digits: 3 },
  { id: "glutamine_mmol_l", name: "Glutamine", unit: "mmol/L", digits: 3 },
  { id: "ph", name: "pH medium", unit: "pH", digits: 3 },
  { id: "viability_percent", name: "Viability", unit: "%", digits: 2 },
  { id: "osmolality", name: "Osmolality", unit: "mOsm/kg", digits: 0 },
  {
    id: "dissolved_oxygen",
    name: "Dissolved oxygen",
    unit: "% air sat.",
    digits: 1,
  },
  { id: "co2", name: "CO₂", unit: "mmHg", digits: 1 },
  { id: "temperature", name: "Temperature", unit: "°C", digits: 1 },
] as const

export function liveProcessData(snapshot: LabSnapshot) {
  if (snapshot.device_profile) return biostatProcessData(snapshot)
  const released = snapshot.measurements.filter(
    (row) =>
      row.quality.status === "passed" &&
      row.available_at_hour <= snapshot.culture_hours &&
      row.collected_at_hour <= row.available_at_hour,
  )
  return liveProcessVariables.map((variable) => {
    const samples = released.flatMap((row) => {
      const value =
        variable.id === "count" ? row.count : row.channels[variable.id]
      return Number.isFinite(value)
        ? [
            {
              hour: row.collected_at_hour,
              value,
              sample_id: row.sample_id,
              available_at_hour: row.available_at_hour,
            },
          ]
        : []
    })
    return {
      ...variable,
      samples,
      latest: samples.at(-1) ?? null,
      origin: "virtual_sensor",
      source: "Legacy FLEX2",
      status: "live",
    }
  })
}
