// JEV GPU inference on GCP (OpenBioLLM, Bonsai, Evo 2) through the same-origin HemoForge API.
// The GCP key stays on the server; the browser only sends the session cookie.

export type JevJobStatus = "queued" | "running" | "completed" | "failed"

export interface JevHealth {
  status: string | null
  models?: unknown
}

export interface JevJob {
  job_id: string
  status: JevJobStatus | string
  selected_model?: string | null
  routing_reason?: string | null
  result?: unknown
  error?: unknown
}

export class JevError extends Error {
  status: number | null

  // No parameter property: node --experimental-strip-types runs the tests.
  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
  }
}

export function jevErrorMessage(status: number | null, detail?: string) {
  if (status === 401) return "Your session ended. Sign in again to use JEV."
  if (status === 429) return detail ?? "Daily GPU request limit reached. Try again tomorrow."
  if (status === null || status === 503)
    return detail ?? "GPU service unavailable. Retry in a few minutes."
  return detail ?? "The JEV request failed."
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1/jev/${path}`, { cache: "no-store", ...init })
  } catch (failure) {
    if (init.signal?.aborted) throw failure
    throw new JevError(jevErrorMessage(null, "HemoForge API is offline. Retry in a moment."))
  }
  const json = response.headers.get("content-type")?.includes("application/json")
  const data = json ? await response.json().catch(() => null) : null
  if (!response.ok || !data) {
    const detail = typeof data?.detail === "string" ? data.detail : undefined
    throw new JevError(jevErrorMessage(response.ok ? null : response.status, detail), response.ok ? null : response.status)
  }
  return data as T
}

export const jevStatus = (signal?: AbortSignal) => call<JevHealth>("status", { signal })

export const submitJev = (message: string, signal?: AbortSignal) =>
  call<{ job_id: string; status: string }>("chat", {
    method: "POST",
    signal,
    // The server requires this header so cross-site pages cannot start paid GPU jobs.
    headers: { "Content-Type": "application/json", "X-HemoForge-Action": "jev-chat" },
    body: JSON.stringify({ message }),
  })

export const jevJob = (jobId: string, signal?: AbortSignal) =>
  call<JevJob>(`jobs/${encodeURIComponent(jobId)}`, { signal })

export const isFinished = (job: Pick<JevJob, "status">) => job.status === "completed" || job.status === "failed"

/** Model output as plain text; structured results are pretty-printed, never rendered as HTML. */
export function jevText(value: unknown) {
  if (value === null || value === undefined) return ""
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}
