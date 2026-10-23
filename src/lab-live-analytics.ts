import type { LabSnapshot } from "./lab-session.ts"
import type { CultureForecast } from "./culture-forecast.ts"
import type { PredictionEnvelope } from "./python-api.ts"
import { analyzeMeasurements } from "./culture-monitoring.ts"
import { lastSensor, sensorUsable } from "./biostat-data.ts"

export interface LiveAnalysisSettings {
  horizon: 12 | 24 | 48
  target_million: number
}

export interface LiveAnalysis {
  session_id: string
  batch_id: string
  source_hash: string
  fit_input_hash: string
  segment_id: string
  segment_start_hour: number
  as_of_culture_hour: number
  settings: LiveAnalysisSettings
  status: "ready" | "needs_samples" | "needs_review" | "needs_time_span" | "stale" | "intervention_in_progress"
  reason: string
  training_samples: {
    hour: number
    count: number
    unit: string
  }[]
  source_sample_ids: string[]
  forecast: PredictionEnvelope<CultureForecast> | null
  target_plan: {
    target_million: number
    observed_count: number | null
    observed_hour: number | null
    status: "withheld" | "observed_target_reached" | "estimated_target_reached" | "non_growing" | "projected" | "beyond_run" | "beyond_phase"
    hours_from_observation: number | null
    target_hour: number | null
    doubling_hours: number | null
    fold_required: number | null
  }
  experiment_gp: {
    status: "withheld"
    reason: string
  }
  evidence: "software_test_only"
  model_version: string
}

export function lastAppliedAction(snapshot: LabSnapshot) {
  return (
    snapshot.interventions.filter((item) => item.status === "applied").at(-1) ??
    null
  )
}

export function liveSegment(snapshot: LabSnapshot) {
  const base = lastAppliedAction(snapshot)?.id ?? "initial"
  return snapshot.device_profile
    ? `${base}:${snapshot.stage}:${snapshot.controller?.events.at(-1)?.id ?? "initial"}`
    : base
}

export function liveSettingsError(settings: LiveAnalysisSettings) {
  return ![12, 24, 48].includes(settings.horizon) ||
    !Number.isFinite(settings.target_million) ||
    settings.target_million < 1 ||
    settings.target_million > 1_000_000
    ? "Gunakan horizon 12/24/48 jam dan target 1–1.000.000 juta sel."
    : ""
}

export function analysisMatches(
  data: LiveAnalysis | null,
  snapshot: LabSnapshot,
  settings: LiveAnalysisSettings,
) {
  return (
    !!data &&
    data.session_id === snapshot.session_id &&
    data.source_hash === snapshot.measurements_sha256 &&
    data.segment_id === liveSegment(snapshot) &&
    data.settings.horizon === settings.horizon &&
    data.settings.target_million === settings.target_million
  )
}

export function liveAnalysisHold(snapshot: LabSnapshot) {
  if (snapshot.device_profile) {
    if (snapshot.stage === "differentiation")
      return "Proyeksi pertumbuhan ditahan pada fase diferensiasi. Estimasi sel bukan hasil RBC matang."
    if (
      (["core", "trace", "viamass"] as const).some(
        (device) => !sensorUsable(snapshot, lastSensor(snapshot, device)),
      )
    )
      return "Sensor belum tersedia, gagal QC, atau kedaluwarsa. Proyeksi dan ETA ditahan."
  }
  if (snapshot.active_intervention)
    return "Tindakan sedang berlangsung. Proyeksi ditahan sampai tindakan selesai dan pengukuran baru tersedia."
  const cutoff = Math.max(
    lastAppliedAction(snapshot)?.completed_at_hour ?? 0,
    snapshot.stage_start_hour ?? 0,
    snapshot.controller?.events.at(-1)?.hour ?? 0,
  )
  const latest = snapshot.measurements
    .filter(
      (row) =>
        row.quality.status === "passed" &&
        row.available_at_hour <= snapshot.culture_hours &&
        row.collected_at_hour >= cutoff,
    )
    .at(-1)
  if (!latest) return "Menunggu keluaran baru pada segmen kultur saat ini."
  if (
    snapshot.culture_hours - latest.collected_at_hour >
    (snapshot.device_profile ? 3 : 24)
  )
    return "Sampel terakhir lebih dari 24 jam kultur. Ambil pengukuran baru; proyeksi dan ETA ditahan."
  return ""
}

export async function fetchLiveAnalysis(
  snapshot: LabSnapshot,
  settings: LiveAnalysisSettings,
  signal: AbortSignal,
): Promise<LiveAnalysis> {
  const error = liveSettingsError(settings)
  if (error) throw new Error(error)
  const response = await fetch(
    `/api/v1/lab/sessions/${encodeURIComponent(snapshot.session_id)}/analytics`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HemoForge-Action": "virtual-lab",
      },
      body: JSON.stringify({
        source_hash: snapshot.measurements_sha256,
        ...settings,
      }),
      signal,
    },
  )
  const data = await response.json()
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Analisis live tidak tersedia.",
    )
  return data
}

// Reconstruct each checkpoint using publication time, not just the aliquot collection time.
export function liveCheckpointReports(snapshot: LabSnapshot) {
  const released = snapshot.measurements.filter(
    (row) =>
      row.quality.status === "passed" &&
      row.available_at_hour <= snapshot.culture_hours,
  )
  return Array.from(
    {
      length: Math.floor(
        Math.min(snapshot.culture_hours, snapshot.end_hour) / 3,
      ),
    },
    (_, index) => {
      const hour = (index + 1) * 3
      const available = released.filter(
        (row) =>
          row.available_at_hour <= hour &&
          row.collected_at_hour <= row.available_at_hour,
      )
      const current = analyzeMeasurements(
        available.map((row) => ({
          hour: row.collected_at_hour,
          count: row.count,
          unit: row.unit,
        })),
        hour,
      )
      const fresh = available.filter((row) => row.available_at_hour > hour - 3)
      return {
        checkpoint_hour: hour,
        batch_id: snapshot.batch_id,
        evidence: "software_test_only" as const,
        source_sample_ids: available.map((row) => row.sample_id),
        newly_released_ids: fresh.map((row) => row.sample_id),
        latest_collected_at: available.at(-1)?.collected_at_hour ?? null,
        latest_available_at: available.at(-1)?.available_at_hour ?? null,
        latest_count: current.latest?.count ?? null,
        status: current.status,
        warnings: current.events,
        applied_action_ids: snapshot.interventions
          .filter(
            (item) =>
              item.status === "applied" && item.completed_at_hour! <= hour,
          )
          .map((item) => item.id),
      }
    },
  )
}
