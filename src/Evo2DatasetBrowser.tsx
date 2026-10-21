import { Fragment, useEffect, useRef, useState } from "react"
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
    <div className="evo2-dataset-head">
      <h3>Public sequence dataset</h3>
      {catalog && <div className="evo2-downloads"><a className="text-button" href="/datasets/evo2/sequence_pairs.jsonl" download>Sequence pairs (JSONL)</a>
        <a className="text-button" href="/datasets/evo2/variants.csv" download>Variants (CSV)</a></div>}
    </div>
    {catalog && <div className="bot-badges"><Badge tone="success">{catalog.sequence_pair_count.toLocaleString()} verified pairs</Badge>
      <Badge>{catalog.genes.map(row => `${row.gene} ${row.selected_count}`).join(" · ")}</Badge>
      <Badge>GRCh38 · {catalog.window_bases} bp · Ensembl {catalog.release_info.releases.join(", ")}</Badge></div>}
    <div className="evo2-fields evo2-filters">
      <label>Gene<select value={gene} disabled={busy} onChange={event => { setGene(event.target.value); setOffset(0) }}>
        <option value="">All genes</option><option>KEL</option><option>SLC14A1</option></select></label>
      <label>Split<select value={split} disabled={busy} onChange={event => { setSplit(event.target.value); setOffset(0) }}>
        <option value="">All splits</option>{["train", "validation", "test"].map(value => <option key={value} value={value}>{value}{catalog ? ` (${catalog.split_counts[value]})` : ""}</option>)}</select></label>
      <label>Search<input type="search" maxLength={120} value={query} disabled={busy}
        onChange={event => { setQuery(event.target.value); setOffset(0) }} placeholder="rs ID, position or consequence" /></label>
    </div>
    {page && <><div className="table-scroll evo2-table"><table><caption className="sr-only">Public sequence variants</caption>
      <thead><tr><th><input type="checkbox" aria-label="Select this page (up to 20)" disabled={busy || !page.items.length}
        checked={page.items.length > 0 && page.items.every(row => selected.some(item => item.id === row.id))}
        onChange={event => select(event.target.checked
          ? [...selected, ...page.items.filter(row => !selected.some(item => item.id === row.id))].slice(0, 20)
          : selected.filter(item => !page.items.some(row => row.id === item.id)))} /></th>
        <th>Variant</th><th>Gene</th><th className="numeric">Position</th><th>Change</th><th>Consequence</th><th>Split</th><th><span className="sr-only">DNA preview</span></th></tr></thead>
      <tbody>{page.items.map(row => { const checked = selected.some(item => item.id === row.id)
        const open = previewId === row.id
        return <Fragment key={row.id}><tr className={checked ? "is-selected" : ""}><td><input type="checkbox" aria-label={`Select ${row.variant_id} ${row.gene}`} checked={checked}
          disabled={busy || (!checked && selected.length >= 20)} onChange={() => select(checked ? selected.filter(item => item.id !== row.id) : [...selected, row])} /></td>
          <td><code>{row.variant_id}</code></td><td><span className="gene-tag">{row.gene}</span></td>
          <td className="numeric">{row.contig}:{row.position_1based.toLocaleString()}</td>
          <td><code className="allele-change">{row.ref} → {row.alt}</code></td>
          <td className="evo2-consequence">{row.consequence_annotation.replace(/_/g, " ")}</td><td>{row.split}</td>
          <td><button type="button" className="text-button" aria-expanded={open} disabled={busy} onClick={() => setPreviewId(open ? "" : row.id)}>{open ? "Hide DNA" : "DNA"}</button></td></tr>
          {open && <tr className="evo2-preview-row"><td colSpan={8}>{preview?.id === row.id ? <div className="evo2-preview">
            <p>Forward GRCh38 · {preview.reference_sequence.length} bases · variant base highlighted</p>
            {(["reference_sequence", "alternate_sequence"] as const).map(key => <div key={key}><h4>{key === "reference_sequence" ? "Reference" : "Alternate"}</h4>
              <pre>{preview[key].slice(0, 128)}<mark>{preview[key][128]}</mark>{preview[key].slice(129)}</pre></div>)}
            <Details title="Sequence hashes"><p>Reference: <code>{preview.reference_sha256}</code></p><p>Alternate: <code>{preview.alternate_sha256}</code></p></Details>
          </div> : <p className="panel-note">Loading DNA…</p>}</td></tr>}</Fragment> })}</tbody>
    </table></div>{!page.items.length && <p className="panel-note">No variants match these filters.</p>}
      <div className="evo2-pager"><span role="status">{loading ? "Loading…" : `${page.total ? `${offset + 1}–${Math.min(offset + 20, page.total)} of ${page.total}` : "0 variants"} · ${selected.length}/20 selected`}</span>
        <Button disabled={busy || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</Button>
        <Button disabled={busy || loading || offset + 20 >= page.total} onClick={() => setOffset(offset + 20)}>Next</Button></div></>}
    {!page && <p role="status" className="panel-note">{loading ? "Loading local variants…" : "Dataset list unavailable"}</p>}
    {selected.length > 0 && <div className="evo2-selection"><p>{selected.length} selected:</p>
      <ul>{selected.map(row => <li key={row.id}>{row.gene} · {row.variant_id} · {row.split} <button type="button" disabled={busy}
        aria-label={`Remove ${row.variant_id} ${row.gene}`} onClick={() => select(selected.filter(item => item.id !== row.id))}>Remove</button></li>)}</ul></div>}
    <div className="bot-export-actions"><Button primary disabled={busy || !selected.length || !catalog} onClick={() => void prepare()}>
      {busy ? "Preparing locally…" : `Prepare ${selected.length || "selected"} variant(s) · no inference`}</Button>
      <Button disabled={busy || !selected.length} onClick={() => select([])}>Clear selection</Button></div>
    {error && <div role="alert" className="import-error"><p>{error}</p><Button disabled={busy} onClick={() => { setError(""); setRetry(value => value + 1) }}>Retry local dataset</Button></div>}
    {prepared && <Evo2PreparedResult prepared={prepared} />}
    <Evo2NvidiaTrial selected={selected} />
  </div>
}
