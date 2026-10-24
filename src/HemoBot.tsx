import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useWorkspace } from "./workspace-context"
import { Badge, Button, Details, PageTitle, Panel } from "./workspace-ui"
import { downloadFile } from "./workspace-utils"
import { accountApi } from "./account"
import { analyzeWithBot, botExportUrl, botPayload, botQuestions, botStatus,
  type BotAnalysis, type BotContext, type BotModule, type BotStatus } from "./hemobot-api"

export function useHemoBot(context: BotContext) {
  const { inputs, notify, flag } = useWorkspace()
  const [query, setQuery] = useState(botQuestions.all)
  const [module, setModule] = useState<BotModule>("all")
  const [result, setResult] = useState<BotAnalysis | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const contextKey = JSON.stringify(context)
  useEffect(() => {
    generation.current++
    controller.current?.abort()
    setResult(null)
    setBusy(false)
    setError("")
  }, [inputs, contextKey])
  useEffect(() => () => controller.current?.abort(), [])

  function cancel() {
    generation.current++
    controller.current?.abort()
    setBusy(false)
    setError("Stopped waiting. A running server inference may still finish and retain its audit record.")
  }
  async function run() {
    if (busy || query.trim().length < 3) return
    const sequence = ++generation.current
    const requestController = new AbortController()
    controller.current = requestController
    const timer = window.setTimeout(() => requestController.abort(), 345000)
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const response = await analyzeWithBot(botPayload(inputs, context, query, module, "auto"), requestController.signal)
      if (sequence === generation.current) {
        setResult(response)
        notify("HemoBot analysis finished", "success")
        flag("bot", "report")
      }
    } catch (failure) {
      if (sequence === generation.current) notify("HemoBot analysis failed", "error")
      if (sequence === generation.current) setError(requestController.signal.aborted
        ? "The request timed out. Check the Python API and model server, then retry."
        : failure instanceof Error ? failure.message : "Analysis failed. Check the Python API connection and retry.")
    } finally {
      window.clearTimeout(timer)
      if (sequence === generation.current) setBusy(false)
    }
  }
  function prepare(next: BotModule) {
    setModule(next)
    setQuery(botQuestions[next])
  }
  return { query, setQuery, module, result, error, busy, run, cancel, prepare }
}

type BotState = ReturnType<typeof useHemoBot>

export default function HemoBot({ bot, context, batchChoices, onBatchChange, replayControls }: {
  bot: BotState; context: BotContext; batchChoices: string[]; onBatchChange: (id: string) => void; replayControls: ReactNode
}) {
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [statusError, setStatusError] = useState("")
  const [exportError, setExportError] = useState("")
  const { notify, flag } = useWorkspace()
  // response_id of the analysis last saved as a report.
  const [savedId, setSavedId] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [exporting, setExporting] = useState(false)
  const statusController = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    statusController.current?.abort()
    setStatus(null)
    setStatusError("")
    const requestController = new AbortController()
    statusController.current = requestController
    const timer = window.setTimeout(() => requestController.abort(), 10000)
    try {
      const next = await botStatus(requestController.signal)
      if (statusController.current === requestController) { setStatus(next); setStatusError(""); return next }
    } catch {
      if (statusController.current === requestController && !requestController.signal.aborted) {
        setStatus(null); setStatusError("HemoBot API unavailable. Restart the local Python service and retry.")
      } else if (statusController.current === requestController) {
        setStatus(null); setStatusError("Status check timed out. Retry the connection check.")
      }
    } finally { window.clearTimeout(timer) }
    return null
  }, [])
  useEffect(() => { void refresh(); return () => { statusController.current?.abort(); statusController.current = null } }, [refresh])
  const result = bot.result
  const llmOnline = status?.llm_status === "online"
  function showCitation(id: string) {
    const element = document.getElementById(`citation-${id}`)
    const disclosure = element?.closest("details")
    if (disclosure) disclosure.open = true
    element?.scrollIntoView({ block: "center" })
    element?.focus({ preventScroll: true })
  }
  async function exportResult(format: "json" | "html" | "markdown") {
    if (!result) return
    setExporting(true)
    setExportError("")
    try {
      const response = await fetch(botExportUrl(result.response_id, format))
      if (!response.ok) throw new Error("Audit export failed. Check the local Python service and retry.")
      downloadFile(`${result.response_id}.${format === "markdown" ? "md" : format}`, await response.text(),
        response.headers.get("content-type") ?? "application/octet-stream")
    } catch (failure) {
      setExportError(failure instanceof Error ? failure.message : "Export failed.")
    } finally { setExporting(false) }
  }
  async function saveReport() {
    if (!result) return
    setSaving(true)
    setSaveError("")
    try {
      const report = await accountApi<{ number: string }>("reports/hemobot", "POST", { response_id: result.response_id })
      setSavedId(result.response_id)
      notify(`Saved as report ${report.number}`, "success")
      flag("report")
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : "Could not save the report.")
    } finally { setSaving(false) }
  }
  return <>
    <PageTitle title="HemoBot" description="Review laboratory evidence with your biomedical research assistant."
      action={<Badge tone={llmOnline ? "success" : "warning"}>
        {llmOnline ? "LLM connected" : status ? status.llm_status === "disabled" ? "LLM disabled" : "LLM offline" : statusError ? "API unavailable" : "Checking connection"}
      </Badge>} />
    <div className="context-strip"><label>Analysis batch <select value={context.batch_id} onChange={event => onBatchChange(event.target.value)}>
      {batchChoices.map(id => <option key={id}>{id}</option>)}</select></label><span>Replay <b>{context.replay_elapsed_hours}h</b> · Biomedical English</span>
      <Button onClick={() => void refresh()}>Check connection</Button></div>
    {replayControls}
    {statusError && <p role="alert" className="import-error">{statusError}</p>}
    <Panel title="Ask HemoBot">
      <div className="bot-composer">
        <div className="bot-quick-actions" aria-label="Analysis shortcuts">
          {(["all", "guard", "pilot", "plan", "match"] as BotModule[]).map((item, index) =>
            <button key={item} className="button" type="button" disabled={bot.busy} aria-pressed={bot.module === item}
              onClick={() => bot.prepare(item)}>{["All modules", "Explain warnings", "Checkpoint digest", "Next experiment", "Verify markers"][index]}</button>)}
        </div>
        <label htmlFor="hemobot-query">Research question in English</label>
        <textarea className="resize-none" id="hemobot-query" rows={3} maxLength={1200} value={bot.query} disabled={bot.busy}
          onChange={event => bot.setQuery(event.target.value)} />
        <div className="bot-run-actions">
          <Button primary disabled={!llmOnline || bot.busy || bot.query.trim().length < 3} onClick={async () => {
            const connection = await refresh()
            if (connection?.llm_status === "online") void bot.run()
          }}>
            {bot.busy ? "Reviewing evidence…" : "Analyze evidence"}</Button>
          {bot.busy && <Button onClick={bot.cancel}>Stop waiting</Button>}
        </div>
        <p className="panel-note">Analysis saves the source snapshot and audit locally. Evidence statements and your question are sent to the configured model server.</p>
        <p role="status" className="bot-progress">{bot.busy
          ? "CPU inference can take a few minutes. You may switch modules while waiting."
          : !llmOnline
            ? status || statusError
              ? "Connect the LLM, then select Check connection to enable analysis."
              : "Checking the LLM connection…"
            : ""}</p>
      </div>
    </Panel>
    {bot.error && <p role="alert" className="import-error">{bot.error}</p>}
    {result ? <div className="bot-results" aria-live="polite">
      <Panel title={result.summary_headline} action={<div className="bot-badges">
        <Badge tone={result.execution_status === "succeeded" ? "success" : "warning"}>Execution: {result.execution_status}</Badge>
        <Badge tone="warning">Evidence: {result.evidence_quality.replace(/_/g, " ")}</Badge>
      </div>}>
        <div className="bot-body">{result.fallback_reason && <p className="bot-fallback">{result.fallback_reason}</p>}
          <p>Statements are rendered from server-computed evidence. {result.execution_status === "succeeded" ? "The model selected relevant evidence and manual review actions." : "No LLM-authored scientific claims are shown."}</p>
          <div className="bot-citations">{result.citations.map(citation => <button type="button" className="button"
            onClick={() => showCitation(citation.id)} key={citation.id}>
            {citation.module}{citation.measured_at !== null ? ` · ${citation.measured_at}h` : ""}</button>)}</div>
          <div className="bot-run-actions"><Button primary icon="report" disabled={saving || savedId === result.response_id}
            onClick={() => void saveReport()}>{savedId === result.response_id ? "Saved as report" : saving ? "Saving…" : "Save as report"}</Button>
            {savedId === result.response_id && <a className="button" href="#report">Open Research Report</a>}</div>
          {saveError && <p role="alert" className="import-error">{saveError}</p>}
        </div>
      </Panel>
      <div className="bot-card-grid">{result.cards.map(card => <Panel key={card.module} title={card.title}
        action={<Badge tone={card.status === "warning" || card.status === "needs_review" ? "warning" : "neutral"}>{card.status.replace(/_/g, " ")}</Badge>}>
        <div className="bot-body">{card.statements.map((text, index) => <p key={index}>{text}</p>)}</div>
      </Panel>)}</div>
      <Panel title="Manual review actions"><ul className="bot-actions">{result.suggested_actions.map(action => <li key={action}>{action}</li>)}</ul></Panel>
      <Panel title="RareMatch v2.0 · Evo 2" action={<Badge>Local data · optional NVIDIA trial</Badge>}>
        <div className="bot-body"><p>Browse 1,000 public KEL/SLC14A1 reference/alternate pairs, inspect DNA and prepare local batches. Optional NVIDIA trial scoring is available in the RareMatch workspace.</p>
          <p>Local model execution, model downloads, GPU provisioning and paid fallback remain disabled. HemoBot does not automatically consume NVIDIA results.</p>
          <a className="button" href="#evo2">Open RareMatch workspace</a>
          <p>A sequence likelihood score alone would not establish pathogenicity or genomic stability.</p></div>
      </Panel>
      <Details title="Sources, literature & scientific limits">
        <div className="bot-source-list">{result.citations.map(citation => <article tabIndex={-1} id={`citation-${citation.id}`} key={citation.id}>
          <h3>{citation.module} · {citation.reference}</h3><p>{citation.study_id} · {citation.evidence.replace(/_/g, " ")}</p>
          <p>Reported source SHA-256: <code>{citation.source_sha256 || "No original file hash (built-in fixture)"}</code></p>
          <p>Computed content SHA-256: <code>{citation.content_sha256}</code></p>
        </article>)}</div>
        <p>Literature retrieval: {result.rag_status.replace(/_/g, " ")}. Excerpts are references, not verified facts about the active batch.</p>
        {result.literature.map(source => <blockquote key={source.citation_id}><strong>{source.title}</strong>
          <p>{source.excerpt}</p><p>{source.reference} · {source.study_id}</p><code>{source.sha256}</code></blockquote>)}
        <ul>{result.mandatory_scientific_disclaimers.map(text => <li key={text}>{text}</li>)}</ul>
      </Details>
      <Panel title="Reconstructible audit" caption="Source context, rendered evidence, model identity, fingerprints, and seed.">
        <div className="bot-body"><p>Engine: <code>{result.llm_engine}</code> · seed {result.seed}</p>
          <p>Generated: {new Date(result.generated_at).toLocaleString()}</p><code>{result.analysis_fingerprint}</code>
          <div className="bot-export-actions">{(["json", "html", "markdown"] as const).map(format => <Button key={format} disabled={exporting}
            icon="download" onClick={() => void exportResult(format)}>Export {format.toUpperCase()}</Button>)}</div>
          {exportError && <p role="alert" className="import-error">{exportError}</p>}
        </div>
      </Panel>
    </div> : !bot.busy && <div className="bot-empty"><h2>Start with the evidence</h2><p>Select a question above, then analyze the current batch.</p></div>}
  </>
}
