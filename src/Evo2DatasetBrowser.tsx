import { useEffect, useRef, useState } from "react"
import { Badge, Button, Details } from "./workspace-ui"
import { evo2DatasetPayload, evo2VariantsUrl, type Evo2Prepared, type Evo2Variant } from "./evo2-data"
import Evo2PreparedResult from "./Evo2PreparedResult"
import Evo2NvidiaTrial from "./Evo2NvidiaTrial"

interface Catalog {
  sequence_pair_count: number
  genes: { gene: string; selected_count: number }[]
  split_counts: Record<string, number>
  window_bases: number
  provider: string
  release_info: { releases: number[] }
  integrity_status: string
}
interface VariantPage { total: number; offset: number; limit: number; items: Evo2Variant[] }
interface VariantDetail extends Evo2Variant {
  reference_sequence: string; alternate_sequence: string; reference_sha256: string; alternate_sha256: string
}

async function localJson<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(path, { signal, ...(body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }) })
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Evo 2 dataset API unavailable. Start or restart the local Python API.")
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The local dataset request failed.")
  return data
}

export default function Evo2DatasetBrowser() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [page, setPage] = useState<VariantPage | null>(null)
  const [gene, setGene] = useState("")
  const [split, setSplit] = useState("")
  const [query, setQuery] = useState("")
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Evo2Variant[]>([])
  const [previewId, setPreviewId] = useState("")
  const [preview, setPreview] = useState<VariantDetail | null>(null)
  const [prepared, setPrepared] = useState<Evo2Prepared | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const run = useRef<AbortController | null>(null)
  const runEpoch = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    setCatalog(null)
    void localJson<Catalog>("/api/v1/evo2/dataset", controller.signal).then(result => { if (active) setCatalog(result) })
      .catch(failure => { if (active) setError(controller.signal.aborted ? "The local dataset catalogue timed out. Check the API and retry." : failure.message) })
      .finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [retry])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let timeout: number | undefined
    setLoading(true); setPage(null); setError(""); setPreviewId(""); setPreview(null)
    const timer = window.setTimeout(() => {
      timeout = window.setTimeout(() => controller.abort(), 15000)
      void localJson<VariantPage>(evo2VariantsUrl(gene, split, query, offset), controller.signal)
        .then(result => { if (active) setPage(result) })
        .catch(failure => { if (active) setError(controller.signal.aborted ? "The local variant list timed out. Check the API and retry." : failure.message) })
        .finally(() => { window.clearTimeout(timeout); if (active) setLoading(false) })
    }, 250)
    return () => { active = false; controller.abort(); window.clearTimeout(timer); window.clearTimeout(timeout) }
  }, [gene, split, query, offset, retry])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    setPreview(null)
    if (previewId) void localJson<VariantDetail>(`/api/v1/evo2/dataset/variants/${encodeURIComponent(previewId)}`, controller.signal)
      .then(result => { if (active) setPreview(result) })
      .catch(failure => { if (active) setError(controller.signal.aborted ? "The local DNA preview timed out." : failure.message) })
      .finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [previewId])
  useEffect(() => () => { runEpoch.current++; run.current?.abort() }, [])

  function select(rows: Evo2Variant[]) {
    runEpoch.current++; run.current?.abort(); setBusy(false); setPrepared(null); setError("")
    setSelected(rows)
  }
  async function prepare() {
    if (busy || !selected.length) return
    const controller = new AbortController()
    run.current = controller
    const epoch = ++runEpoch.current
    const timer = window.setTimeout(() => controller.abort(), 30000)
    setBusy(true); setError(""); setPrepared(null)
    try {
      const result = await localJson<Evo2Prepared>("/api/v1/evo2/dataset/prepare", controller.signal,
        evo2DatasetPayload(selected.map(row => row.id)))
      if (epoch === runEpoch.current) setPrepared(result)
    } catch (failure) {
      if (epoch === runEpoch.current) setError(controller.signal.aborted ? "Local preparation timed out. Check the API and retry." : failure instanceof Error ? failure.message : "Local preparation failed.")
    } finally { window.clearTimeout(timer); if (epoch === runEpoch.current) setBusy(false) }
  }

  return <div className="evo2-dataset">
    <h3>Try the public sequence dataset</h3>
    {catalog && <><div className="bot-badges"><Badge tone="success">{catalog.sequence_pair_count.toLocaleString()} pairs · verified local snapshot</Badge>
      <Badge>{catalog.genes.map(row => `${row.gene}: ${row.selected_count}`).join(" · ")}</Badge>
      <Badge>GRCh38 · {catalog.window_bases} bp · Ensembl {catalog.release_info.releases.join(", ")}</Badge></div>
      <p className="panel-note">Select up to 20 variants, then prepare a batch. Reference/alternate sequences come from the bundled dataset. These are public variant examples; donor genotypes and clinical labels are unavailable.</p>
      <div className="bot-export-actions"><a className="button" href="/datasets/evo2/sequence_pairs.jsonl" download>Download {catalog.sequence_pair_count} sequence pairs</a>
        <a className="button" href="/datasets/evo2/variants.csv" download>Download variants CSV</a></div></>}
    <div className="evo2-fields evo2-filters">
      <label>Gene<select value={gene} disabled={busy} onChange={event => { setGene(event.target.value); setOffset(0) }}>
        <option value="">All genes</option><option>KEL</option><option>SLC14A1</option></select></label>
      <label>Development split<select value={split} disabled={busy} onChange={event => { setSplit(event.target.value); setOffset(0) }}>
        <option value="">All splits</option>{["train", "validation", "test"].map(value => <option key={value} value={value}>{value}{catalog ? ` (${catalog.split_counts[value]})` : ""}</option>)}</select></label>
      <label>Search variant, position or consequence<input type="search" maxLength={120} value={query} disabled={busy}
        onChange={event => { setQuery(event.target.value); setOffset(0) }} placeholder="For example rs1010453097 or missense" /></label>
    </div>
    <p role="status" className="panel-note">{loading ? "Loading local variants…" : page ? `${page.total} matching variants · ${selected.length}/20 selected` : "Dataset list unavailable"}</p>
    {page && <><div className="table-scroll"><table><caption className="sr-only">Public Evo 2 sequence variants</caption>
      <thead><tr><th>Select</th><th>Variant / gene</th><th>Position / alleles</th><th>Source consequence</th><th>Split</th><th>Preview</th></tr></thead>
      <tbody>{page.items.map(row => { const checked = selected.some(item => item.id === row.id)
        return <tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.variant_id} ${row.gene}`} checked={checked}
          disabled={busy || (!checked && selected.length >= 20)} onChange={() => select(checked ? selected.filter(item => item.id !== row.id) : [...selected, row])} /></td>
          <td>{row.variant_id}<br /><small>{row.gene}</small></td><td>{row.contig}:{row.position_1based}<br /><code>{row.ref} → {row.alt}</code></td>
          <td>{row.consequence_annotation.replace(/_/g, " ")}</td><td>{row.split}</td><td><Button disabled={busy} onClick={() => setPreviewId(row.id)}>View DNA</Button></td></tr> })}</tbody>
    </table></div>{!page.items.length && <p className="panel-note">No variants match these filters. Try another gene or search.</p>}
      <div className="bot-export-actions"><Button disabled={busy || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</Button>
        <span>{page.total ? `${offset + 1}–${Math.min(offset + 20, page.total)} of ${page.total}` : "0 variants"}</span>
        <Button disabled={busy || loading || offset + 20 >= page.total} onClick={() => setOffset(offset + 20)}>Next</Button>
        <Button disabled={busy || !page.items.length} onClick={() => select(page.items)}>Select this page (up to 20)</Button></div></>}
    {preview && <div className="evo2-preview"><h4>{preview.gene} · {preview.variant_id} · {preview.ref} → {preview.alt}</h4>
      <p>Forward GRCh38 · {preview.split} · {preview.reference_sequence.length} bases · Evo 2 score: not run</p>
      {(["reference_sequence", "alternate_sequence"] as const).map(key => <div key={key}><h4>{key === "reference_sequence" ? "Reference DNA" : "Alternate DNA"}</h4>
        <pre>{preview[key].slice(0, 128)}<mark>{preview[key][128]}</mark>{preview[key].slice(129)}</pre></div>)}
      <Details title="Sequence hashes"><p>Reference: <code>{preview.reference_sha256}</code></p><p>Alternate: <code>{preview.alternate_sha256}</code></p></Details>
      <Button onClick={() => setPreviewId("")}>Close preview</Button></div>}
    {selected.length > 0 && <div className="evo2-selection"><p>{selected.length} selected across pages and filters:</p>
      <ul>{selected.map(row => <li key={row.id}>{row.gene} · {row.variant_id} · {row.split} <button type="button" disabled={busy}
        aria-label={`Remove ${row.variant_id} ${row.gene}`} onClick={() => select(selected.filter(item => item.id !== row.id))}>Remove</button></li>)}</ul></div>}
    <div className="bot-export-actions"><Button primary disabled={busy || !selected.length || !catalog} onClick={() => void prepare()}>
      {busy ? "Preparing locally…" : `Prepare ${selected.length || "selected"} variant(s) · no inference`}</Button>
      <Button disabled={busy || !selected.length} onClick={() => select([])}>Clear selection</Button></div>
    <p className="panel-note">Only local validation and export run here. No model download, GPU provisioning or paid API call. Prepared tasks are saved in the local audit database.</p>
    {error && <div role="alert" className="import-error"><p>{error}</p><Button disabled={busy} onClick={() => { setError(""); setRetry(value => value + 1) }}>Retry local dataset</Button></div>}
    {prepared && <Evo2PreparedResult prepared={prepared} />}
    <Evo2NvidiaTrial selected={selected} />
  </div>
}
