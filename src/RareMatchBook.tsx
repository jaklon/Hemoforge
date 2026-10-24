import { useState } from "react"
import { Button, Icon } from "./workspace-ui"

type Side = "donor" | "recipient"
interface Fasta { header: string; seq: string }

const sample: Record<Side, string> = {
  donor: ">donor KEL exon 6 window\nACGTACGTACGGCCTTAGGA\nCCTAGGATCCAGTTACGATG",
  recipient: ">recipient KEL exon 6 window\nACGTTCGTACGGCCTTAGGA\nCCTAGGATCCAGTAACGATG",
}

function parseFasta(label: string, text: string): Fasta {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error(`${label}: paste or upload a FASTA sequence.`)
  // A bare sequence without a ">" header is accepted too, so plain copy-paste works.
  const header = lines[0].startsWith(">") ? lines.shift()!.slice(1) : "Pasted sequence"
  const seq = lines.filter(line => !line.startsWith(">")).join("").replace(/\s/g, "").toUpperCase()
  if (!seq) throw new Error(`${label}: no sequence found.`)
  const bad = seq.match(/[^ACGTN]/)
  if (bad) throw new Error(`${label}: "${bad[0]}" is not a DNA base. Use A, C, G, T or N.`)
  return { header, seq }
}

// ponytail: position-by-position compare, assumes both FASTAs cover the same aligned window; add alignment if they don't.
function compare(donor: string, recipient: string) {
  const diffs: { pos: number; from: string; to: string }[] = []
  for (let i = 0; i < Math.min(donor.length, recipient.length); i++)
    if (donor[i] !== recipient[i]) diffs.push({ pos: i + 1, from: donor[i], to: recipient[i] })
  const overlap = Math.min(donor.length, recipient.length)
  return { sameLength: donor.length === recipient.length, diffs, identity: overlap ? (overlap - diffs.length) / overlap * 100 : 0 }
}

const bases = (text: string) => text.split(/\r?\n/).filter(line => !line.trim().startsWith(">")).join("").replace(/\s/g, "").length

export default function RareMatchBook() {
  const [text, setText] = useState<Record<Side, string>>({ donor: "", recipient: "" })
  const [parsed, setParsed] = useState<Partial<Record<Side, Fasta>>>({})
  const [errors, setErrors] = useState<Partial<Record<Side, string>>>({})
  const [dragging, setDragging] = useState<Side | null>(null)

  function edit(side: Side, value: string) {
    setText(old => ({ ...old, [side]: value }))
    setParsed(old => ({ ...old, [side]: undefined }))
    setErrors(old => ({ ...old, [side]: undefined }))
  }
  async function upload(side: Side, file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 262144) throw new Error(`${file.name}: use a FASTA file up to 256 KB.`)
      edit(side, new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()))
    } catch (failure) {
      setErrors(old => ({ ...old, [side]: failure instanceof Error ? failure.message : "File could not be read." }))
    }
  }
  function check(side: Side) {
    try {
      const fasta = parseFasta(side === "donor" ? "Donor" : "Recipient", text[side])
      setParsed(old => ({ ...old, [side]: fasta }))
    }
    catch (failure) { setErrors(old => ({ ...old, [side]: failure instanceof Error ? failure.message : "Check the sequence." })) }
  }

  const result = parsed.donor && parsed.recipient ? compare(parsed.donor.seq, parsed.recipient.seq) : null

  function page(side: Side) {
    const fasta = parsed?.[side]
    const gc = fasta ? (fasta.seq.replace(/[^GC]/g, "").length / fasta.seq.length * 100).toFixed(1) : ""
    const count = bases(text[side])
    return <section className={`rarematch-page is-${side}`} aria-labelledby={`rm-${side}`}>
      <header className="rarematch-head">
        <span className="rarematch-icon"><Icon name="dna" /></span>
        <div><h2 id={`rm-${side}`}>{side === "donor" ? "Donor" : "Recipient"}</h2>
          <p>{side === "donor" ? "Sequence from the donor sample" : "Sequence from the patient receiving blood"}</p></div>
      </header>
      <div className={`rarematch-input${dragging === side ? " is-dragging" : ""}`}
        onDragOver={event => { event.preventDefault(); setDragging(side) }}
        onDragLeave={() => setDragging(null)}
        onDrop={event => { event.preventDefault(); setDragging(null); void upload(side, event.dataTransfer.files[0]) }}>
        <textarea aria-label={`${side} FASTA sequence`} spellCheck={false} maxLength={262144}
          placeholder={">sample name\nACGTACGT…\n\nPaste a FASTA sequence here, or drop a .fasta file"}
          value={text[side]} onChange={event => edit(side, event.target.value)} />
        <div className="rarematch-toolbar">
          <label className="button">
            <Icon name="data" /> Upload FASTA
            <input type="file" className="sr-only" accept=".fa,.fasta,.fna,.txt"
              onChange={event => { void upload(side, event.target.files?.[0]); event.target.value = "" }} />
          </label>
          {text[side] ? <button type="button" className="rarematch-link" onClick={() => edit(side, "")}>Clear</button>
            : <button type="button" className="rarematch-link" onClick={() => edit(side, sample[side])}>Use example</button>}
          <span className="rarematch-count">{count.toLocaleString()} bp</span>
        </div>
      </div>
      {errors[side] && <p role="alert" className="rarematch-error">{errors[side]}</p>}
      {!fasta && <Button primary disabled={!text[side].trim()} onClick={() => check(side)}>Check {side}</Button>}
      {fasta && <div className="rarematch-result">
        <div className="rarematch-verdict is-same">{side === "donor" ? "Donor" : "Recipient"} sequence checked</div>
        <dl>
          <dt>Sequence</dt><dd>{fasta.header}</dd>
          <dt>Length</dt><dd>{fasta.seq.length.toLocaleString()} bp</dd>
          <dt>GC content</dt><dd>{gc}%</dd>
        </dl>
      </div>}
    </section>
  }

  return <div className="rarematch">
    <div className="rarematch-book">{page("donor")}{page("recipient")}</div>
    {result ? <section className="rarematch-compat" aria-labelledby="rm-compat">
      <h2 id="rm-compat">Compatibility</h2>
      <div className={`rarematch-verdict ${result.diffs.length || !result.sameLength ? "is-diff" : "is-same"}`}>
        {result.diffs.length === 0 && result.sameLength ? "Donor and recipient sequences are identical"
          : `${result.diffs.length} difference${result.diffs.length === 1 ? "" : "s"} between donor and recipient`}
      </div>
      <dl>
        <dt>Identity</dt><dd>{result.identity.toFixed(1)}%{!result.sameLength && " (lengths differ; overlap only)"}</dd>
        <dt>Compared</dt><dd>{Math.min(parsed.donor!.seq.length, parsed.recipient!.seq.length).toLocaleString()} bp</dd>
      </dl>
      {result.diffs.length > 0 && <div className="rarematch-diffs" aria-label="Differences: position, donor base, recipient base">
        {result.diffs.slice(0, 60).map(diff => <span key={diff.pos}>{diff.pos} <b className="is-donor">{diff.from}</b>→<b className="is-recipient">{diff.to}</b></span>)}
        {result.diffs.length > 60 && <span>+{result.diffs.length - 60} more</span>}
      </div>}
    </section> : <p className="rarematch-hint">Check both the donor and the recipient to see compatibility.</p>}
  </div>
}
