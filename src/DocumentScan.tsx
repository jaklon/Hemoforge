import { useEffect, useRef, useState } from "react"
import { Button, Details, Icon } from "./workspace-ui"
import type { DataKind } from "./workspace-data"

// Matches backend/document_scan.py: raw bytes, before base64.
const maxFiles = 20
const maxBytes = 6 * 1024 * 1024
const accepted = ["application/pdf", "image/png", "image/jpeg", "image/webp"]

interface Queued {
  id: number
  file: File
  preview: string | null
}

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const base64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** Queue photos and PDFs of lab sheets, then convert them to a table on request. */
export default function DocumentScan({
  kindNames,
  disabled,
  onTable,
}: {
  kindNames: Record<DataKind, string>
  disabled: boolean
  onTable: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const [queue, setQueue] = useState<Queued[]>([])
  const [kind, setKind] = useState<DataKind>("culture")
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const total = queue.reduce((sum, item) => sum + item.file.size, 0)

  // Free thumbnail URLs when the page closes.
  const latest = useRef(queue)
  latest.current = queue
  useEffect(() => () => latest.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), [])

  function add(files: File[]) {
    const skipped = files.filter((file) => !accepted.includes(file.type))
    const room = maxFiles - queue.length
    const fresh = files.filter((file) => accepted.includes(file.type)).slice(0, Math.max(0, room))
    setQueue([
      ...queue,
      ...fresh.map((file) => ({
        id: nextId.current++,
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })),
    ])
    const notes = [
      skipped.length && `${skipped.length} skipped: only PDF, PNG, JPEG, or WebP files can be scanned.`,
      files.length - skipped.length > room && `Queue holds up to ${maxFiles} files.`,
    ].filter(Boolean)
    setMessage(notes.length ? { error: true, text: notes.join(" ") } : null)
    if (input.current) input.current.value = ""
  }

  function remove(item: Queued) {
    if (item.preview) URL.revokeObjectURL(item.preview)
    setQueue(queue.filter((other) => other.id !== item.id))
  }

  async function convert() {
    setConverting(true)
    setMessage(null)
    try {
      const files = await Promise.all(
        queue.map(async (item) => ({ name: item.file.name, type: item.file.type, data: await base64(item.file) })),
      )
      const response = await fetch("/api/documents/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, files }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Conversion failed. Is the Python API running?")
      onTable(new File([result.csv], `scanned-${kind}.csv`, { type: "text/csv" }))
      setMessage({ error: false, text: `Converted ${queue.length} file${queue.length === 1 ? "" : "s"}. Check the table below before applying it.` })
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Conversion failed." })
    } finally {
      setConverting(false)
    }
  }

  return (
    <Details title="Scan images & PDFs with AI">
      <p className="scan-intro">
        Add photos or PDFs of lab sheets, as many as you need. Nothing is sent until you press{" "}
        <strong>Convert to table</strong>; the result opens in step 2 for checking before it is applied.
      </p>
      <div
        className={`upload-zone scan-zone${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled && !converting) add(Array.from(event.dataTransfer.files))
        }}
      >
        <Icon name="report" />
        <h3>Drop images or PDFs here</h3>
        <p>PDF, PNG, JPEG, or WebP · up to {maxFiles} files and 6 MB per conversion</p>
        <input
          ref={input}
          type="file"
          accept={accepted.join(",")}
          multiple
          className="sr-only"
          aria-label="Choose images or PDFs to scan"
          disabled={disabled || converting}
          onChange={(event) => add(Array.from(event.target.files ?? []))}
        />
        <div className="upload-actions">
          <Button disabled={disabled || converting} onClick={() => input.current?.click()}>
            Add files
          </Button>
        </div>
      </div>
      {queue.length > 0 && (
        <ul className="scan-queue">
          {queue.map((item) => (
            <li key={item.id}>
              {item.preview ? <img src={item.preview} alt="" /> : <span className="scan-pdf">PDF</span>}
              <span>
                <strong>{item.file.name}</strong>
                <small>{size(item.file.size)}</small>
              </span>
              <button
                type="button"
                className="row-delete"
                aria-label={`Remove ${item.file.name}`}
                title="Remove"
                disabled={converting}
                onClick={() => remove(item)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="scan-actions">
        <label>
          Convert into
          <select value={kind} disabled={converting} onChange={(event) => setKind(event.target.value as DataKind)}>
            {(Object.keys(kindNames) as DataKind[]).map((key) => (
              <option key={key} value={key}>
                {kindNames[key]}
              </option>
            ))}
          </select>
        </label>
        <span className={total > maxBytes ? "is-over" : undefined}>
          {queue.length} file{queue.length === 1 ? "" : "s"} · {size(total)} of 6 MB
        </span>
        <Button primary disabled={disabled || converting || !queue.length || total > maxBytes} onClick={() => void convert()}>
          {converting ? "Converting…" : "Convert to table"}
        </Button>
      </div>
      {message && (
        <p className={message.error ? "import-error" : "scan-success"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </Details>
  )
}
