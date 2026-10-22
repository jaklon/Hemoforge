import { useEffect, useRef, useState } from "react"
import { Badge, Button, Details, Panel } from "./workspace-ui"
import { useWorkspace } from "./workspace-context"
import { evo2NvidiaExportUrl, evo2NvidiaPayload, type Evo2Variant } from "./evo2-data"

interface TrialStatus {
  status: string; configured: boolean; enabled: boolean; free_api_confirmed: boolean; ready: boolean
  requests_used_today: number; daily_request_limit: number; requests_remaining: number; quota_day_utc: string
  model: string; availability: string; logits_layer: string
}
interface Scored {
  result_id: string; provider_model: string; execution_status: "provider_scored"; cache_hit: boolean
  variant: Evo2Variant; delta_log_likelihood: number
  reference: { log_likelihood: number }; alternate: { log_likelihood: number }
  scoring: { scored_positions: number; prepend_bos: boolean }; limitations: string[]
}

async function api<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/evo2/nvidia/${path}`, { signal, ...(body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json", "X-HemoForge-Action": "nvidia-trial" }, body: JSON.stringify(body),
  }) })
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("NVIDIA trial API unavailable. Restart the local Python API.")
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "NVIDIA trial request failed.")
  return result
}

export default function Evo2NvidiaTrial({ selected }: { selected: Evo2Variant[] }) {
  const { notify } = useWorkspace()
  const [status, setStatus] = useState<TrialStatus | null>(null)
  const [result, setResult] = useState<Scored | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const running = useRef(false)
  const request = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const selectedId = selected.length === 1 ? selected[0].id : ""
  const currentSelection = useRef(selectedId)
  currentSelection.current = selectedId
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(() => controller.abort(), 15000)
    void api<TrialStatus>("status", controller.signal).then(value => { if (active) { setStatus(value); setError("") } })
      .catch(failure => { if (active) setError(controller.signal.aborted ? "The local status request timed out." : failure.message) })
      .finally(() => window.clearTimeout(timer))
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [refresh])
  useEffect(() => { setResult(null) }, [selectedId])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort() } }, [])

  async function loadSaved() {
    if (running.current || !selectedId) return
    running.current = true
    const id = selectedId
    const controller = new AbortController()
    request.current = controller
    const timer = window.setTimeout(() => controller.abort(), 15000)
    setLoadingSaved(true); setError(""); setResult(null)
    try {
      const value = await api<Scored>(`results/latest?${new URLSearchParams({ variant_id: id })}`, controller.signal)
      if (mounted.current && currentSelection.current === id) setResult(value)
    } catch (failure) {
      if (mounted.current) setError(controller.signal.aborted ? "The local saved-result request timed out." : failure instanceof Error ? failure.message : "Saved result unavailable.")
    } finally { window.clearTimeout(timer); running.current = false; if (mounted.current) setLoadingSaved(false) }
  }

  async function score() {
    if (running.current || !status?.ready || !selectedId) return
    running.current = true
    const id = selectedId
    const controller = new AbortController()
    request.current = controller
    const timer = window.setTimeout(() => controller.abort(), 135000)
    setBusy(true); setError(""); setResult(null)
    try {
      const value = await api<Scored>("score", controller.signal, evo2NvidiaPayload([id]))
      if (mounted.current && currentSelection.current === id && !controller.signal.aborted) setResult(value)
      notify(`Evo 2 scoring finished for ${id}`, "success")
    } catch (failure) {
      notify(`Evo 2 scoring failed for ${id}`, "error")
      if (mounted.current) setError(controller.signal.aborted ? "The browser stopped waiting. The backend may still finish; reserved requests count toward the cap. Use Load saved result before retrying." : failure instanceof Error ? failure.message : "NVIDIA trial request failed.")
    } finally {
      window.clearTimeout(timer); running.current = false
      // Only refresh local status. This never probes NVIDIA or retries inference.
      if (mounted.current) {
        setBusy(false)
        const statusController = new AbortController()
        const statusTimer = window.setTimeout(() => statusController.abort(), 15000)
        try { const value = await api<TrialStatus>("status", statusController.signal); if (mounted.current) setStatus(value) } catch { /* Preserve the original action error. */ }
        finally { window.clearTimeout(statusTimer) }
      }
    }
  }

  return <Panel title="Score with Evo 2" caption="NVIDIA trial · one public variant per action" action={<Badge tone={status?.ready ? "success" : "warning"}>{status?.ready ? "Configured" : status?.status.replace(/_/g, " ") ?? "Checking…"}</Badge>}>
    <div className="evo2-trial">
    <p className="panel-note">Sends only the selected public reference/alternate DNA to NVIDIA; uploaded files and donor records are never sent.{status && ` ${status.requests_remaining}/${status.daily_request_limit} requests left today (2 per uncached pair).`}</p>
    {!status?.ready && <Details title="Set up NVIDIA access"><p>On the backend machine, confirm free API access in your NVIDIA account, then run <code>.\configure-evo2-nvidia.ps1 -ConfirmFreeTrial</code> in PowerShell. The key prompt is hidden. Refresh status afterward. Never paste a key into this page or chat.</p></Details>}
    <p className="panel-note">Select exactly one variant · model <code>{status?.model ?? "arc/evo2-7b-forward"}</code> · exploratory results</p>
    <div className="bot-export-actions"><Button disabled={busy || loadingSaved} onClick={() => setRefresh(value => value + 1)}>Refresh NVIDIA status</Button>
      <Button disabled={busy || loadingSaved || !selectedId} onClick={() => void loadSaved()}>{loadingSaved ? "Reading local result…" : "Load saved result · local only"}</Button>
      <Button primary disabled={busy || loadingSaved || !status?.ready || !selectedId} onClick={() => void score()}>
        {busy ? "Waiting for NVIDIA · no automatic retry…" : `Send ${selectedId ? selected[0].variant_id : "one public variant"} to NVIDIA trial`}</Button></div>
    {busy && <p role="status" className="panel-note">Changing your selection hides this result; it does not cancel a request already sent to NVIDIA.</p>}
    {error && <p role="alert" className="import-error">{error}</p>}
    {result && <div role="status" className="evo2-result"><Badge tone="success">{result.cache_hit ? "Cached provider result" : "Provider inference completed"}</Badge>
      <h4>{result.variant.gene} · {result.variant.variant_id}</h4>
      <div className="table-scroll"><table><caption className="sr-only">NVIDIA Evo 2 sequence likelihood scores</caption>
        <thead><tr><th>Reference log-likelihood</th><th>Alternate log-likelihood</th><th>Delta (alternate − reference)</th></tr></thead>
        <tbody><tr><td>{result.reference.log_likelihood.toFixed(6)}</td><td>{result.alternate.log_likelihood.toFixed(6)}</td><td>{result.delta_log_likelihood.toFixed(6)}</td></tr></tbody></table></div>
      <p className="panel-note">{result.scoring.scored_positions} next-base positions scored; no BOS token. This score is not a pathogenicity probability or antigen prediction.</p>
      <a className="button" href={evo2NvidiaExportUrl(result.result_id)} download>Download NVIDIA inference result</a>
      <Details title="Model and scientific limits"><p>Provider model: <code>{result.provider_model}</code>. Exact provider checkpoint/version is unavailable.</p>
        <ul>{result.limitations.map(text => <li key={text}>{text}</li>)}</ul></Details>
    </div>}
    </div>
  </Panel>
}
