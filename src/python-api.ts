import type { CultureForecast, ForecastHorizon } from "./culture-forecast"
import type { Measurement } from "./culture-monitoring"
import type { ExperimentRow } from "./workspace-data"
import type { ExperimentPlan } from "./experiment-model"
import {
  growthSettingsError,
  planSettingsError,
  type GrowthSettings,
  type PlanSettings,
} from "./research-settings"

export interface PredictionEnvelope<T> {
  engine: string
  modelVersion: string
  generatedAt: string
  sourceHash: string
  requestId: string
  result: T
}

export class PythonServiceError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
  ) {
    super(message)
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new PythonServiceError(
        "Python service unavailable. Run start-python.ps1, then retry.",
      )
    const data = await response.json()
    if (!response.ok)
      throw new PythonServiceError(
        typeof data.detail === "string"
          ? data.detail
          : "Python prediction failed. Check the input data.",
        response.status,
      )
    return data as T
  } catch (error) {
    if (error instanceof PythonServiceError) throw error
    throw new PythonServiceError(
      "Python service unavailable or timed out. Run start-python.ps1, then retry.",
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

interface HealthResponse {
  status: string
  engine: string
}

export async function pythonHealth() {
  const response = await request<HealthResponse>("health")
  if (response.status !== "ok" || response.engine !== "python-numpy")
    throw new PythonServiceError(
      "The expected Python prediction service is unavailable.",
    )
}

export function predictGrowth(
  samples: Measurement[],
  hour: number,
  settings: GrowthSettings,
  sourceHash: string,
) {
  const error = growthSettingsError(settings)
  if (error) throw new PythonServiceError(error, 422)
  return request<PredictionEnvelope<CultureForecast>>("predict/growth", {
    samples: samples.map(({ hour, count, unit }) => ({ hour, count, unit })),
    as_of_hour: hour,
    horizon: settings.horizon,
    seed: settings.seed,
    path_count: settings.paths,
    lookback_hours: settings.lookbackHours,
    drift_override: settings.drift,
    volatility_override: settings.volatility,
    source_hash: sourceHash,
  })
}

export function predictExperiments(
  rows: ExperimentRow[],
  settings: PlanSettings,
  sourceHash: string,
) {
  const error = planSettingsError(settings)
  if (error) throw new PythonServiceError(error, 422)
  return request<PredictionEnvelope<ExperimentPlan>>(
    "predict/experiments",
    {
      rows,
      objective: settings.objective,
      length_scale: settings.lengthScale,
      noise_sd: settings.noise,
      exploration: settings.exploration,
      source_hash: sourceHash,
    },
  )
}

export interface ProposalRequest {
  name: string
  email: string
  company: string
  plan: string
  proposal: string
}

export function submitProposal(proposal: ProposalRequest) {
  return request<{ id: string; received_at: string }>("proposals", proposal)
}
