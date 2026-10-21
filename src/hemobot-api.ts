import type { WorkspaceInputs, CultureRow, ExperimentRow, MarkerRow } from "./workspace-data"

export type BotModule = "all" | "guard" | "pilot" | "plan" | "match"
export interface BotContext {
  batch_id: string
  replay_elapsed_hours: number
  kel: string
  slc: string
  objective: "maximize" | "minimize"
  verification_requests: boolean[]
}
export interface BotCitation {
  id: string
  module: string
  study_id: string
  reference: string
  source_sha256: string
  content_sha256: string
  evidence: string
  measured_at: number | null
}
export interface BotAnalysis {
  response_id: string
  generated_at: string
  language: "en"
  llm_engine: string
  model_digest: string | null
  execution_status: "succeeded" | "fallback" | "blocked"
  evidence_quality: string
  fallback_reason: string | null
  summary_headline: string
  biomedical_analysis_markdown: string
  cards: { module: Exclude<BotModule, "all">; title: string; status: string; statements: string[]; citation_ids: string[] }[]
  suggested_actions: string[]
  citations: BotCitation[]
  literature: { citation_id: string; excerpt: string; title: string; reference: string; study_id: string; sha256: string }[]
  rag_status: string
  mandatory_scientific_disclaimers: string[]
  analysis_fingerprint: string
  context_fingerprint: string
  seed: number
}
export interface BotStatus {
  name: string
  model: string
  llm_status: "online" | "offline" | "disabled"
  rag_enabled: boolean
  audit_storage: string
}

export const botQuestions: Record<BotModule, string> = {
  all: "Summarize the evidence and limitations across all modules.",
  guard: "Explain the current batch warnings and suggest manual laboratory checks.",
  pilot: "Summarize the latest checkpoint and identify any missing measurements or stage-classifier evidence.",
  plan: "Explain the ranked experimental condition, GP uncertainty, and held-out validation.",
  match: "Review the marker screening results and post-harvest laboratory verification status.",
}

export function botPayload(inputs: WorkspaceInputs, context: BotContext, query: string, module: BotModule, mode: "auto" | "template") {
  const source = (kind: keyof WorkspaceInputs) => {
    const file = inputs[kind]
    return { name: file.name, sha256: file.sha256, evidence: file.evidence }
  }
  // Send typed source records, never browser-calculated summaries or asserted lab passes.
  return { query_en: query.trim(), language: "en", module, mode, active_context: context,
    inputs: {
      culture: { ...source("culture"), rows: inputs.culture.rows as CultureRow[] },
      experiments: { ...source("experiments"), rows: inputs.experiments.rows as ExperimentRow[] },
      markers: { ...source("markers"), rows: inputs.markers.rows as MarkerRow[] },
    },
  }
}

export async function botStatus(signal?: AbortSignal): Promise<BotStatus> {
  const response = await fetch("/api/v1/hemobot/status", { signal, cache: "no-store" })
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
    throw new Error("HemoBot API unavailable. Check the local Python service.")
  return response.json()
}

export async function analyzeWithBot(payload: ReturnType<typeof botPayload>, signal: AbortSignal): Promise<BotAnalysis> {
  const response = await fetch("/api/v1/hemobot/analyze", { method: "POST", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("HemoBot API unavailable. Restart the Python service and retry.")
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The analysis request was rejected. Review the input data.")
  return data
}

export function botExportUrl(responseId: string, format: "json" | "html" | "markdown") {
  return `/api/v1/hemobot/analyses/${encodeURIComponent(responseId)}/export?format=${format}`
}
