import type { CultureRow, InputFile } from "./workspace-data.ts"

export interface Flex2Measurement {
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
  } | null
}

export interface LabSnapshot {
  type: "snapshot"
  schema_version: 3
  session_id: string
  batch_id: string
  model_version: string
  created_at: string
  revision: number
  ack_seq: number
  culture_hours: number
  end_hour: number
  speed: 1 | 6 | 12
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

export type LabAction = "play" | "pause" | "collect" | "load" | "analyze" | "advance" | "speed" | "execute"
export const sessionPattern = /^[a-f0-9]{32}$/

export function labSessionFromHash(hash: string) {
  const match = hash.match(/^#(?:lab|guard\/live)\/([a-f0-9]{32})$/)
  return match?.[1] ?? null
}

export function liveCultureFile(
  snapshot: LabSnapshot,
): InputFile & { rows: CultureRow[] } {
  // Only released observations enter Guard. Hidden reactor state never crosses this boundary.
  const rows: CultureRow[] = snapshot.measurements
    .filter((reading) => reading.quality.status === "passed")
    .map((reading) => ({
      batch_id: snapshot.batch_id,
      cell_line: "Synthetic teaching culture · uncalibrated",
      hour: reading.collected_at_hour,
      count: reading.count,
      unit: reading.unit,
      channels: { ...reading.channels },
    }))
  return {
    kind: "culture",
    name: `Virtual FLEX2 · ${snapshot.batch_id}`,
    sha256: snapshot.measurements_sha256,
    loaded_at: snapshot.created_at,
    evidence: "software_test_only",
    rows,
  }
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
