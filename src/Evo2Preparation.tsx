import { useEffect, useRef, useState } from "react"
import { useWorkspace } from "./workspace-context"
import { Badge, Button, Details, Panel } from "./workspace-ui"
import { emptyEvo2Draft, evo2Payload, type Evo2Draft, type Evo2Prepared } from "./evo2-data"
import Evo2DatasetBrowser from "./Evo2DatasetBrowser"
import Evo2PreparedResult from "./Evo2PreparedResult"

interface PublicExample { id: string; gene: string; request: Omit<Evo2Draft, "start" | "vcf_text"> & { reference_start_1based: number } }

export default function Evo2Preparation() {
  const { inputs } = useWorkspace()
  const source = inputs.markers
  const [draft, setDraft] = useState<Evo2Draft>(emptyEvo2Draft)
  const [examples, setExamples] = useState<PublicExample[]>([])
  const [readiness, setReadiness] = useState<{ profile_count: number; profiles_with_unknown_calls: number; missing_requirements: string[] } | null>(null)
  const [prepared, setPrepared] = useState<Evo2Prepared | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const epoch = useRef(0)
  useEffect(() => {
    const requestController = new AbortController()
    void fetch("/datasets/evo2/examples.json", { signal: requestController.signal }).then(async response => {
      if (!response.ok) return
      const examplesData = await response.json()
      if (!requestController.signal.aborted) setExamples(examplesData)
    }).catch(() => { /* Bundled public data is optional; no external download fallback. */ })
    return () => { requestController.abort(); controller.current?.abort(); epoch.current++ }
  }, [])
  useEffect(() => { epoch.current++; controller.current?.abort(); setReadiness(null); setPrepared(null); setBusy(false); setError("") }, [source])

  function edit(update: Partial<Evo2Draft>) {
    epoch.current++
    controller.current?.abort()
    setBusy(false)
    setPrepared(null)
    setError("")
    setDraft(old => ({ ...old, ...update }))
  }
  async function upload(file: File | undefined, key: "reference_fasta" | "alternate_fasta" | "vcf_text") {
    if (!file) return
    const generation = ++epoch.current
    controller.current?.abort()
    setPrepared(null); setBusy(false)
    try {
      if (!file.size || file.size > 262144) throw new Error("Use a non-empty UTF-8 sequence/VCF file up to 256 KB.")
      const value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())
      if (generation === epoch.current) edit({ [key]: value, evidence: "user_supplied" })
    } catch (failure) { if (generation === epoch.current) setError(failure instanceof Error ? failure.message : "File could not be read.") }
  }
  async function request(path: string, body: unknown) {
    if (busy) return
    const generation = ++epoch.current
    const requestController = new AbortController()
    controller.current = requestController
    const timer = window.setTimeout(() => requestController.abort(), 30000)
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/v1/evo2/${path}`, { method: "POST", signal: requestController.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Evo 2 preparation API unavailable. Restart the Python API.")
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Preparation was rejected. Check the sequence inputs.")
      if (generation === epoch.current) { if (path === "readiness") setReadiness(result); else setPrepared(result) }
    } catch (failure) {
      if (generation === epoch.current) setError(requestController.signal.aborted ? "The local request timed out. Retry after checking the API." : failure instanceof Error ? failure.message : "Local preparation failed.")
    } finally { window.clearTimeout(timer); if (generation === epoch.current) setBusy(false) }
  }
  function prepare() {
    try { void request("prepare", evo2Payload(draft)) } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the coordinates.") }
  }
  const fields = [["sample_id", "Sample or reference-example label"], ["study_id", "Independent study/source ID"],
    ["reference_label", "Reference identity / accession"], ["contig", "Reference FASTA contig ID"], ["start", "First reference base (one-based; optional for paired FASTA)"]] as const
  return <Panel title="Evo 2 · sequence workspace" action={<Badge>Local preparation · optional NVIDIA trial</Badge>}>
    <div className="bot-body">
      <p>Marker calls do not reconstruct DNA sequences or donor haplotypes. Readiness checks the KEL rs8176058 and SLC14A1 rs1058396 anchor calls in the active marker file.</p>
      <div className="bot-export-actions"><Button disabled={busy} onClick={() => void request("readiness", { markers: {
        name: source.name, sha256: source.sha256, evidence: source.evidence, rows: source.rows } })}>Check marker readiness</Button>
      </div>
      {readiness && <div className="bot-fallback"><p>{readiness.profile_count} marker profiles; {readiness.profiles_with_unknown_calls} have unresolved calls. Sequence data are still required.</p>
        <ul>{readiness.missing_requirements.map(text => <li key={text}>{text}</li>)}</ul></div>}
      <p className="panel-note">Preparation runs locally. No paid provider, GPU provisioning, or model download is enabled. Sequence preparation saves normalized tasks to the local audit database; raw sequences are not sent to HemoBot/Ollama.</p>
    </div>
    <Evo2DatasetBrowser />
    <Details title="Validate FASTA / VCF and prepare an offline task">
      <div className="evo2-fields"><label>Public reference example<select defaultValue="" disabled={busy} onChange={event => {
        const example = examples.find(row => row.id === event.target.value)
        if (example) edit({ ...example.request, start: String(example.request.reference_start_1based), vcf_text: "" })
      }}><option value="">Choose an example or enter your own data</option>{examples.map(example => <option key={example.id} value={example.id}>{example.gene} · {example.id}</option>)}</select></label>
        <label>Input format<select value={draft.mode} disabled={busy} onChange={event => edit({ mode: event.target.value as Evo2Draft["mode"] })}>
          <option value="paired_fasta">Reference + alternate FASTA</option><option value="vcf_window">VCF + forward reference FASTA window</option></select></label>
        <label>Gene annotation (declared)<select value={draft.gene} disabled={busy} onChange={event => edit({ gene: event.target.value as Evo2Draft["gene"] })}>
          <option>KEL</option><option>SLC14A1</option></select></label>
        {fields.map(([key, label]) => <label key={key}>{label}<input value={draft[key]} disabled={busy} maxLength={key === "reference_label" ? 255 : 120}
          onChange={event => edit({ [key]: event.target.value })} /></label>)}
      </div>
      {(["reference_fasta", draft.mode === "paired_fasta" ? "alternate_fasta" : "vcf_text"] as const).map(key => <label className="evo2-sequence" key={key}>
        {key === "reference_fasta" ? "Reference FASTA (forward genomic orientation)" : key === "alternate_fasta" ? "Alternate FASTA (one SNV)" : "VCF (one sample or site-only; up to twenty SNVs)"}
        <input type="file" accept={key === "vcf_text" ? ".vcf,.txt" : ".fa,.fasta,.fna,.txt"} disabled={busy} onChange={event => void upload(event.target.files?.[0], key)} />
        <textarea className="resize-none" rows={4} maxLength={262144} disabled={busy} spellCheck={false} value={draft[key]} onChange={event => edit({ [key]: event.target.value, evidence: "user_supplied" })} />
      </label>)}
      <Button primary disabled={busy || !draft.reference_fasta || !(draft.mode === "paired_fasta" ? draft.alternate_fasta : draft.vcf_text)} onClick={prepare}>
        {busy ? "Validating locally…" : "Validate & prepare without inference"}</Button>
    </Details>
    {error && <p role="alert" className="import-error">{error}</p>}
    {prepared && <Evo2PreparedResult prepared={prepared} />}
  </Panel>
}
