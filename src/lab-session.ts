import type { CultureRow, InputFile } from "./workspace-data.ts"

export interface Flex2Measurement {
  source_kind?: "model_estimate"
  source_sensor_ids?: string[]
  calibration_profile?: string
  stage?: "expansion" | "differentiation"
  sample_id: string
  collected_at_hour: number
  available_at_hour: number
  volume_ml: number
  viable_cell_density_million_ml: number
  count: number
  unit: "million cells"
  channels: Record<string, number>
  model_version: string
  evidence: "software_test_only"
  withdrawal_ml: number
  analyzed_volume_ml: number
  reactor_volume_before_ml: number
  reactor_volume_after_ml: number
  mixed: boolean
  quality: AssayQuality
  uncertainty: MeasurementUncertainty
}

export interface AssayQuality {
  status: "passed" | "rejected"
  flags: string[]
}

export interface MeasurementUncertainty {
  density_cv: number
  chemistry_cv: number
  ph_sd: number
  viability_sd_percentage_points: number
}

export type CultureScenario = "balanced" | "nutrient_limited" | "metabolite_stress"

export interface SampleMetadata {
  sample_id: string
  collected_at_hour: number
  withdrawal_ml: number
  mixed: boolean
  reactor_volume_before_ml: number
  reactor_volume_after_ml: number
}

export interface CompletedAssay extends SampleMetadata {
  available_at_hour: number
  quality: AssayQuality
}

export interface LabIntervention {
  feed_multiplier_ml?: number
  id: string
  kind: "feed" | "medium_exchange"
  amount: 10 | 25 | 50
  source_sample_id: string
  source_collected_at_hour: number
  note: string
  status: "queued" | "executing" | "applied" | "cancelled"
  requested_at_hour: number
  started_at_hour: number | null
  completed_at_hour: number | null
  progress: number
  cancel_reason: string | null
  outcome: {
    volume_before_ml: number
    volume_after_ml: number
    added_medium_ml: number
    exchanged_medium_ml: number
    retention_fraction?: number | null
  } | null
}

export interface LabSnapshot {
  type: "snapshot"
  schema_version: 3 | 4
  device_profile?: {
    id: "biostat-str-gen2"
    name: string
    pat: string[]
    min_volume_ml: number
    max_volume_ml: number
    feed_multiplier_ml: number
    retention_fraction: number
    biological_profile: string
    unmeasured: string[]
  }
  sensor_readings?: SensorReading[]
  sensor_schedule?: Record<string, {
    interval_hours: number
    delay_hours: number
    max_age_hours: number
  }>
  pending_sensor_count?: number
  sensor_faults?: string[]
  stage?: "expansion" | "differentiation"
  stage_start_hour?: number
  estimate_notice?: string
  controller?: {
    mode: "AUTO"
    setpoints: { ph: number dissolved_oxygen: number temperature: number }
    outputs: {
      stirrer_rpm: number
      oxygen_percent: number
      base_output_percent: number
      thermal_output_percent: number
    }
    events: { id: string hour: number setpoints: Record<string, number> }[]
  }
  session_id: string
  batch_id: string
  model_version: string
  created_at: string
  revision: number
  ack_seq: number
  culture_hours: number
  end_hour: number
  speed: 0.05 | 0.25 | 1 | 6 | 12
  running: boolean
  phase: "idle" | "collected" | "loaded" | "analyzing" | "complete" | "intervening"
  controller_connected: boolean
  reason: string
  analysis_progress: number
  assay_stage: "idle" | "aspiration" | "chemistry" | "cell_count" | "quality_review" | "complete"
  protocol: {
    animation_seconds: number
    culture_minutes: number
    analyzed_volume_ml: number
  }
  scenario: CultureScenario
  seed: number
  working_volume_ml: number
  withdrawn_volume_ml: number
  added_volume_ml: number
  exchanged_volume_ml: number
  operator_paired: boolean
  interventions: LabIntervention[]
  active_intervention: LabIntervention | null
  intervention_protocol: {
    animation_seconds: number
    culture_minutes: number
    max_volume_ml: number
    decision_max_age_hours: number
  }
  uncertainty_model: MeasurementUncertainty
  sample: SampleMetadata | null
  assays: CompletedAssay[]
  measurements: Flex2Measurement[]
  measurements_sha256: string
}

export interface SensorReading {
  id: string
  device: "core" | "trace" | "viamass"
  source_kind: "virtual_sensor"
  measured_at_hour: number
  available_at_hour: number
  expires_at_hour: number
  channels: Record<string, number>
  quality: AssayQuality
  stage: "expansion" | "differentiation"
  volume_ml: number
  model_version: string
}

export type LabAction = "play" | "pause" | "collect" | "load" | "analyze" | "advance" | "speed" | "execute" | "setpoints" | "sensor_fault"
export type LiveModule = "dashboard" | "guard" | "pilot" | "plan"
export const sessionPattern = /^[a-f0-9]{32}$/

export interface PocRoute {
  kind: "hub" | "lab" | "monitor" | "invalid"
  sessionId: string | null
  module: LiveModule
}

export function pocRouteFromHash(hash: string): PocRoute | null {
  const base: PocRoute = { kind: "hub", sessionId: null, module: "dashboard" }
  if (hash === "#poc" || hash === "#poc/") return base
  if (hash === "#poc/lab" || hash === "#lab") return { ...base, kind: "lab" }
  const lab = hash.match(/^#(?:poc\/lab|lab)\/([a-f0-9]{32})$/)
  if (lab) return { ...base, kind: "lab", sessionId: lab[1] }
  const monitor = hash.match(
    /^#poc\/monitor\/([a-f0-9]{32})\/(dashboard|guard|pilot|plan)$/,
  )
  if (monitor)
    return {
      kind: "monitor",
      sessionId: monitor[1],
      module: monitor[2] as LiveModule,
    }
  // Retain old shared monitor links without moving them into the research workspace.
  const legacy = hash.match(
    /^#(dashboard|guard|pilot|plan)\/live\/([a-f0-9]{32})$/,
  )
  if (legacy)
    return {
      kind: "monitor",
      sessionId: legacy[2],
      module: legacy[1] as LiveModule,
    }
  if (
    /^#(?:poc|lab)(?:\/|$)/.test(hash) ||
    /^#(?:dashboard|guard|pilot|plan)\/live(?:\/|$)/.test(hash)
  )
    return { ...base, kind: "invalid" }
  return null
}

export function pocLabHash(id?: string) {
  if (id !== undefined && !sessionPattern.test(id))
    throw new Error("Invalid simulation session ID")
  return id ? `#poc/lab/${id}` : "#poc/lab"
}

export function pocMonitorHash(id: string, module: LiveModule = "dashboard") {
  if (
    !sessionPattern.test(id) ||
    !["dashboard", "guard", "pilot", "plan"].includes(module)
  )
    throw new Error("Invalid simulation monitor route")
  return `#poc/monitor/${id}/${module}`
}

export function labSessionFromHash(hash: string) {
  return pocRouteFromHash(hash)?.sessionId ?? null
}

export function liveModuleFromHash(hash: string): LiveModule {
  return pocRouteFromHash(hash)?.module ?? "dashboard"
}

export function liveCultureFile(
  snapshot: LabSnapshot,
): InputFile & { rows: CultureRow[] } {
  // Only released observations enter Guard. Hidden reactor state never crosses this boundary.
  const rows: CultureRow[] = snapshot.measurements
    .filter(
      (reading) =>
        reading.quality.status === "passed" &&
        reading.available_at_hour <= snapshot.culture_hours &&
        reading.collected_at_hour <= reading.available_at_hour,
    )
    .map((reading) => ({
      batch_id: snapshot.batch_id,
      cell_line: snapshot.device_profile
        ? "ViaMass cell estimate · stage conversion uncalibrated"
        : "Synthetic teaching culture · uncalibrated",
      hour: reading.collected_at_hour,
      count: reading.count,
      unit: reading.unit,
      // BIOSTAT channels have independent timestamps; they enter Guard separately.
      channels: snapshot.device_profile ? {} : { ...reading.channels },
    }))
  return {
    kind: "culture",
    name: `${
      snapshot.device_profile
        ? "Virtual PAT · estimated cell count"
        : "Virtual FLEX2"
    } · ${snapshot.batch_id}`,
    sha256: snapshot.measurements_sha256,
    loaded_at: snapshot.created_at,
    evidence: "software_test_only",
    rows,
  }
}

export function liveSensorRows(snapshot: LabSnapshot): CultureRow[] {
  const rows = new Map<number, CultureRow>()
  for (const reading of snapshot.sensor_readings ?? []) {
    if (
      reading.available_at_hour > snapshot.culture_hours ||
      reading.measured_at_hour > reading.available_at_hour
    )
      continue
    const row = rows.get(reading.measured_at_hour) ?? {
      batch_id: snapshot.batch_id,
      cell_line: "BIOSTAT / BioPAT virtual sensors",
      hour: reading.measured_at_hour,
      count: null,
      unit: "million cells",
      channels: {},
    }
    if (reading.quality.status === "passed") {
      for (const [key, value] of Object.entries(reading.channels)) {
        const mapped =
          key === "temperature"
            ? "temperature_c"
            : key === "dissolved_oxygen"
              ? "do_percent"
              : key
        row.channels[mapped] = value
      }
    }
    rows.set(row.hour, row)
  }
  return [...rows.values()].sort((a, b) => a.hour - b.hour)
}

export function nextLabAction(phase: LabSnapshot["phase"]): LabAction | null {
  return phase === "collected"
    ? "load"
    : phase === "loaded"
      ? "analyze"
      : phase === "analyzing" || phase === "intervening"
        ? null
        : "collect"
}

// Accumulate visible rendered time, never background wall time or catch-up after a stall.
export class AnimationClock {
  private seconds = 0
  reset() {
    this.seconds = 0
  }
  frame(delta: number, active: boolean) {
    if (!active || !Number.isFinite(delta) || delta < 0 || delta > 0.25) {
      this.reset()
      return 0
    }
    this.seconds += delta
    if (this.seconds < 0.25) return 0
    const advance = Math.min(this.seconds, 0.5)
    this.reset()
    return advance
  }
}
