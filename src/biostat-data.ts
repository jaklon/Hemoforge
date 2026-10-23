import type { LabSnapshot, SensorReading } from "./lab-session.ts"

export function lastSensor(
  snapshot: LabSnapshot,
  device: SensorReading["device"],
) {
  return (
    snapshot.sensor_readings
      ?.filter(
        (r) =>
          r.device === device && r.available_at_hour <= snapshot.culture_hours,
      )
      .at(-1) ?? null
  )
}

export function sensorUsable(
  snapshot: LabSnapshot,
  reading: SensorReading | null,
) {
  return (
    !!reading &&
    reading.quality.status === "passed" &&
    reading.expires_at_hour >= snapshot.culture_hours
  )
}

const definitions = [
  {
    id: "ph",
    name: "pH medium",
    unit: "pH",
    digits: 3,
    device: "core",
    origin: "virtual_sensor",
    source: "BIOSTAT · pH probe",
  },
  {
    id: "dissolved_oxygen",
    name: "Dissolved oxygen",
    unit: "% air sat.",
    digits: 1,
    device: "core",
    origin: "virtual_sensor",
    source: "BIOSTAT · DO probe",
  },
  {
    id: "temperature",
    name: "Temperature",
    unit: "°C",
    digits: 2,
    device: "core",
    origin: "virtual_sensor",
    source: "BIOSTAT · temperature probe",
  },
  {
    id: "glucose_mmol_l",
    name: "Glucose",
    unit: "mmol/L",
    digits: 3,
    device: "trace",
    origin: "virtual_sensor",
    source: "BioPAT Trace",
  },
  {
    id: "lactate_mmol_l",
    name: "Lactate",
    unit: "mmol/L",
    digits: 3,
    device: "trace",
    origin: "virtual_sensor",
    source: "BioPAT Trace",
  },
  {
    id: "capacitance_pf_cm",
    name: "Viable biomass signal",
    unit: "pF/cm",
    digits: 3,
    device: "viamass",
    origin: "virtual_sensor",
    source: "BioPAT ViaMass · capacitance",
  },
  {
    id: "density",
    name: "Estimated viable-cell density",
    unit: "×10⁶ cells/mL",
    digits: 3,
    device: "viamass",
    origin: "model_estimate",
    source: "ViaMass + assumed stage/size calibration",
  },
  {
    id: "count",
    name: "Estimated viable-cell count",
    unit: "×10⁶ cells",
    digits: 1,
    device: "viamass",
    origin: "model_estimate",
    source: "Estimated density × recorded volume",
  },
  ...[
    ["glutamine_mmol_l", "Glutamine", "mmol/L"],
    ["ammonium_mmol_l", "Ammonium (NH4)", "mmol/L"],
    ["viability_percent", "Viability", "%"],
    ["osmolality", "Osmolality", "mOsm/kg"],
    ["co2", "Dissolved pCO₂", "mmHg"],
    ["enucleation_percent", "Enucleation", "%"],
  ].map(([id, name, unit]) => ({
    id,
    name,
    unit,
    digits: 2,
    device: "external",
    origin: "unmeasured",
    source: "Additional assay required",
  })),
] as const

export function biostatProcessData(snapshot: LabSnapshot) {
  return definitions.map((definition) => {
    const readings = (snapshot.sensor_readings ?? []).filter(
      (row) =>
        row.device === definition.device &&
        row.quality.status === "passed" &&
        row.available_at_hour <= snapshot.culture_hours,
    )
    const samples =
      definition.origin === "model_estimate"
        ? snapshot.measurements
            .filter(
              (row) =>
                row.source_kind === "model_estimate" &&
                row.quality.status === "passed" &&
                row.available_at_hour <= snapshot.culture_hours,
            )
            .map((row) => ({
              value:
                definition.id === "count"
                  ? row.count
                  : row.viable_cell_density_million_ml,
              hour: row.collected_at_hour,
              available_at_hour: row.available_at_hour,
              sample_id: row.sample_id,
            }))
        : readings
            .filter((row) => Number.isFinite(row.channels[definition.id]))
            .map((row) => ({
              value: row.channels[definition.id],
              hour: row.measured_at_hour,
              available_at_hour: row.available_at_hour,
              sample_id: row.id,
            }))
    const last =
      snapshot.sensor_readings
        ?.filter(
          (row) =>
            row.device === definition.device &&
            row.available_at_hour <= snapshot.culture_hours,
        )
        .at(-1) ?? null
    const usable = sensorUsable(snapshot, last)
    return {
      ...definition,
      samples,
      latest: usable ? (samples.at(-1) ?? null) : null,
      status: !last
        ? "unavailable"
        : last.quality.status === "rejected"
          ? "fault"
          : usable
            ? "live"
            : "stale",
    }
  })
}
