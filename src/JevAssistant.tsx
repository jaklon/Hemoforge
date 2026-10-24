import { useCallback, useEffect, useRef, useState } from "react"
import { signOut } from "./account"
import { Badge, Button, Panel } from "./workspace-ui"
import { isFinished, JevError, jevJob, jevText, submitJev, type JevJob } from "./jev-api"

const POLL_MS = 4000
// ponytail: polling gives up after 20 minutes; "Check again" resumes. Swap for server push if jobs run longer.
const POLL_LIMIT_MS = 20 * 60_000
const STORAGE_KEY = "hemoforge-jev-job"
const MODEL_NAMES: Record<string, string> = { openbiollm: "OpenBioLLM", bonsai: "Bonsai 8B", evo2: "Evo 2 7B" }

// The running job survives switching modes or pages, so returning never resubmits a paid GPU job.
function remember(jobId: string | null) {
  try {
    if (jobId) sessionStorage.setItem(STORAGE_KEY, jobId)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}
function remembered() {
  try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null }
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const timer = window.setTimeout(resolve, ms)
  signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve() }, { once: true })
})

export default function JevAssistant({ online, onRecheck }: { online: boolean; onRecheck: () => void }) {
  const [message, setMessage] = useState("")
  const [job, setJob] = useState<JevJob | null>(null)
  const [error, setError] = useState<{ message: string; status: number | null } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [stalled, setStalled] = useState(false)
  const poll = useRef<AbortController | null>(null)
  const alive = useRef(true)

  // One polling loop at a time; starting a new one aborts the previous.
  const track = useCallback((jobId: string) => {
    poll.current?.abort()
    const controller = new AbortController()
    poll.current = controller
    const started = Date.now()
    setStalled(false)
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          const next = await jevJob(jobId, controller.signal)
          if (controller.signal.aborted) return
          setJob(next)
          setError(null)
          if (isFinished(next)) { remember(null); return }
        } catch (failure) {
          if (controller.signal.aborted) return
          const status = failure instanceof JevError ? failure.status : null
          setError({ message: failure instanceof Error ? failure.message : "Could not check the GPU job.", status })
          // Gone or not ours: stop. Network and 503 errors keep retrying.
          if (status === 401 || status === 404 || status === 410) { remember(null); return }
        }
        if (Date.now() - started > POLL_LIMIT_MS) { setStalled(true); return }
        await wait(POLL_MS, controller.signal)
      }
    })()
  }, [])

  useEffect(() => {
    alive.current = true
    const jobId = remembered()
    if (jobId) { setJob({ job_id: jobId, status: "queued" }); track(jobId) }
    return () => { alive.current = false; poll.current?.abort() }
  }, [track])

  const running = !!job && !isFinished(job) && !stalled
  const busy = submitting || running

  async function submit() {
    const text = message.trim()
    if (busy || !text) return
    setSubmitting(true)
    setError(null)
    setJob(null)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 30000)
    try {
      const created = await submitJev(text, controller.signal)
      remember(created.job_id)
      if (!alive.current) return
      setJob(created)
      track(created.job_id)
    } catch (failure) {
      if (!alive.current) return
      // Never retried automatically: a resubmission would start a second paid GPU job.
      setError(controller.signal.aborted
        ? { message: "The submission timed out. It may still have been queued, so wait a minute before submitting again.", status: null }
        : { message: failure instanceof Error ? failure.message : "Submission failed.", status: failure instanceof JevError ? failure.status : null })
    } finally {
      window.clearTimeout(timer)
      if (alive.current) setSubmitting(false)
    }
  }

  const output = jevText(job?.result)
  const jobError = jevText(job?.error)
  return <>
    <Panel title="Ask JEV" caption="GPU inference on HemoForge's private GCP service.">
      <div className="bot-composer">
        <label htmlFor="jev-message">Message</label>
        <textarea className="resize-none" id="jev-message" rows={4} maxLength={20000} value={message} disabled={busy}
          placeholder="e.g. Use OpenBioLLM to summarize how KEL variants affect Kell antigen expression."
          onChange={event => setMessage(event.target.value)} />
        <p className="panel-note">Name OpenBioLLM (biomedical questions), Bonsai (drafting) or Evo 2 (DNA sequence likelihood) to pick a model; otherwise JEV routes the request. Limit: 10 GPU requests per account per 24 hours.</p>
        <div className="bot-run-actions">
          <Button primary disabled={!online || busy || !message.trim()} onClick={() => void submit()}>
            {submitting ? "Submitting…" : running ? "GPU job running…" : "Submit to GPU"}</Button>
          {!online && <Button onClick={onRecheck}>Check GCP connection</Button>}
        </div>
        <p role="status" className="bot-progress">{!online ? "Connect to the GCP inference service to submit." : running ? "Queued and running jobs are checked every few seconds." : ""}</p>
      </div>
    </Panel>
    {error && <div role="alert" className="import-error">
      <p>{error.message}</p>
      {error.status === 401 && <Button onClick={() => void signOut()}>Sign in again</Button>}
      {(error.status === null || error.status === 503) && !running && <Button onClick={onRecheck}>Check GCP connection</Button>}
    </div>}
    {job && <Panel title="GPU job" caption={job.job_id} action={<Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "warning" : "neutral"}>{job.status}</Badge>}>
      <div className="bot-body" aria-live="polite">
        {job.selected_model && <p>Model: <b>{MODEL_NAMES[job.selected_model] ?? job.selected_model}</b>{job.routing_reason ? ` · ${job.routing_reason}` : ""}</p>}
        {output && <><p className="bot-fallback">AI-generated. It can be wrong; verify every scientific claim before use.</p>
          <pre className="jev-output">{output}</pre></>}
        {jobError && <p className="import-error">{jobError}</p>}
        {stalled && <><p>Still running after 20 minutes.</p><Button onClick={() => track(job.job_id)}>Check again</Button></>}
      </div>
    </Panel>}
    <Panel title="Scientific limits">
      <div className="bot-body">
        <p>JEV is for research only. It is not a validated clinical, diagnostic or transfusion tool, and its output is not checked against HemoBot's audited evidence.</p>
        <p>Evo 2 scores how likely a DNA sequence is. That is not blood compatibility, a mutation's real-world frequency or a pathogenicity call. Compatibility depends on ABO/Rh and other antigens, antibody screening and crossmatching.</p>
      </div>
    </Panel>
  </>
}
