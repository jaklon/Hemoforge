import { useEffect, useRef, useState } from "react"
import { useWorkspace, checksum } from "./workspace-context"
import {
  channels,
  exampleFiles,
  parseInput,
  scenarioCsv,
  toScenarioTable,
  type DataKind,
  type InputFile,
} from "./workspace-data"
import { Button, Panel, Badge, PageTitle, Icon, Details } from "./workspace-ui"
import { downloadFile } from "./workspace-utils"
const kindNames: Record<DataKind, string> = {
  culture: "Culture measurements",
  experiments: "Experiment results",
  markers: "Genetic marker calls",
}
const columnLabels: Record<string, string> = {
  batch_id: "Batch",
  cell_line: "Cell line",
  elapsed_hours: "Time (h)",
  cell_count_million: "Cells (million)",
  condition_id: "Condition",
  lactate_mg_l: "Lactate (mg/L)",
  ammonia_mg_l: "Ammonia (mg/L)",
  response: "Result",
  response_unit: "Result unit",
  sample_id: "Sample",
  ...Object.fromEntries(
    channels.map((channel) => [
      channel.key,
      channel.unit ? `${channel.label} (${channel.unit})` : channel.label,
    ]),
  ),
}
const columnLabel = (key: string) =>
  columnLabels[key] ??
  key.replace(/^(?:(.+)_)?(rs\d+)$/, (_, gene, rs) =>
    gene ? `${gene.toUpperCase()} ${rs}` : rs,
  )
const pageSize = 50
export default function DataWorkspace({
  onRun,
}: {
  onRun: (kind?: DataKind) => void
}) {
  const workspace = useWorkspace()
  const { editor, setEditor } = workspace
  const inputRef = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [staged, setStaged] = useState<InputFile[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editorErrors, setEditorErrors] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [editorDirty, setEditorDirty] = useState(false)
  function loadIntoEditor(kind: DataKind, source?: InputFile) {
    const file =
      source ??
      staged.find((item) => item.kind === kind) ??
      workspace.inputs[kind]
    setEditor(toScenarioTable(file, workspace.markerSettings.targets))
    setEditorErrors([])
    setEditorDirty(false)
    setPage(0)
  }
  function editRows(rows: string[][]) {
    setEditor({ ...editor, rows })
    setEditorDirty(true)
  }
  useEffect(() => {
    // Only fill an empty editor; edits survive switching pages.
    if (!editor.rows.length) loadIntoEditor(editor.kind)
  }, [])
  async function parseFiles(files: File[]) {
    const parsed: InputFile[] = []
    const messages: string[] = []
    for (const file of files) {
      try {
        if (!/\.(csv|tsv|json)$/i.test(file.name))
          throw new Error(
            "Use CSV, TSV, or JSON. Save an Excel sheet as CSV first.",
          )
        if (!file.size || file.size > 2 * 1024 * 1024)
          throw new Error("File must be non-empty and at most 2 MB.")
        const bytes = await file.arrayBuffer()
        const sha256 = await checksum(bytes)
        const data = parseInput(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          file.name,
        )
        parsed.push({
          ...data,
          name: file.name,
          sha256,
          loaded_at: new Date().toISOString(),
          evidence: /^hemogpt-example-/i.test(file.name)
            ? "software_test_only"
            : "user_supplied",
        })
      } catch (error) {
        messages.push(
          `${file.name}: ${
            error instanceof Error ? error.message : "Could not read this file."
          }`,
        )
      }
    }
    return { parsed, messages }
  }
  async function readFiles(files: File[]) {
    if (!files.length) return
    if (files.length > 3) {
      setErrors(["Choose up to three files at a time: one per data type."])
      return
    }
    const token = ++generation.current
    setBusy(true)
    setErrors([])
    const { parsed, messages } = await parseFiles(files)
    if (token !== generation.current) return
    setStaged((old) => {
      const all = [...old]
      for (const file of parsed) {
        const index = all.findIndex((item) => item.kind === file.kind)
        if (index >= 0) all.splice(index, 1)
        all.push(file)
      }
      return all
    })
    setErrors(messages)
    setBusy(false)
    if (messages.length)
      workspace.notify(
        `${messages.length} file${messages.length > 1 ? "s" : ""} rejected`,
        "error",
      )
    else if (parsed.length)
      workspace.notify(
        `Loaded ${parsed.map((file) => file.name).join(", ")}`,
        "success",
      )
    if (inputRef.current) inputRef.current.value = ""
    // Show the upload straight away so it can be checked or corrected below.
    if (parsed.length) loadIntoEditor(parsed[0].kind, parsed[0])
  }
  async function applyAll() {
    if (running || busy) return
    let files = staged
    if (editorDirty) {
      const { parsed, messages } = await parseFiles([
        new File([scenarioCsv(editor)], `edited-${editor.kind}.csv`),
      ])
      if (messages.length) {
        setEditorErrors(
          // Parser rows count the CSV header; the table does not.
          messages.map((message) =>
            message
              .replace(/^edited-\w+\.csv: /, "")
              .replace(/^Row (\d+)/, (_, row) => `Row ${Number(row) - 1}`)
              .replace(/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g, (key) =>
                editor.columns.includes(key) ? `"${columnLabel(key)}"` : key,
              ),
          ),
        )
        return
      }
      files = [...staged.filter((file) => file.kind !== editor.kind), ...parsed]
    }
    setEditorErrors([])
    setRunning(true)
    try {
      await workspace.apply(files)
      setStaged([])
      setEditorDirty(false)
      onRun(files.length === 1 ? files[0].kind : undefined)
    } catch (error) {
      workspace.notify("Apply failed · existing data remain active", "error")
      setEditorErrors([
        error instanceof Error
          ? error.message
          : "The run failed. Existing data remain available.",
      ])
    } finally {
      setRunning(false)
    }
  }
  function updateCell(row: number, column: number, value: string) {
    editRows(
      editor.rows.map((cells, i) =>
        i === row
          ? cells.map((cell, j) => (j === column ? value : cell))
          : cells,
      ),
    )
  }
  const pages = Math.max(1, Math.ceil(editor.rows.length / pageSize))
  const firstRow = Math.min(page, pages - 1) * pageSize
  const editorSource = (
    staged.find((item) => item.kind === editor.kind) ??
    workspace.inputs[editor.kind]
  ).name
  const pending = new Set([
    ...staged.map((file) => file.kind),
    ...(editorDirty ? [editor.kind] : []),
  ])
  async function loadExamples() {
    setBusy(true)
    try {
      const files = await Promise.all(
        (Object.keys(exampleFiles) as DataKind[]).map(async (kind) => ({
          ...parseInput(exampleFiles[kind], "example.csv"),
          name: `hemogpt-example-${kind}.csv`,
          sha256: await checksum(new TextEncoder().encode(exampleFiles[kind])),
          loaded_at: new Date().toISOString(),
          evidence: "software_test_only" as const,
        })),
      )
      setStaged(files)
      setErrors([])
      workspace.notify("Loaded example data", "success")
      loadIntoEditor(
        editor.kind,
        files.find((file) => file.kind === editor.kind),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        title="Data & Runs"
        description="Upload files, check and edit them, then apply them to every page."
        action={
          // The top bar shows backend status; keep only the way to reconnect.
          workspace.backendStatus === "offline" && (
            <Button onClick={() => void workspace.checkBackend()}>
              Retry connection
            </Button>
          )
        }
      />
      <Panel
        title="1 · Upload files"
        caption="CSV, TSV, or JSON · up to 2 MB and 10,000 rows per file · one file per data type"
      >
        <div
          className={`upload-zone${dragging ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            if (!busy && !running)
              void readFiles(Array.from(event.dataTransfer.files))
          }}
        >
          <Icon name="data" />
          <h3>Drag files here</h3>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.json"
            multiple
            className="sr-only"
            aria-label="Choose data files"
            disabled={busy || running}
            onChange={(event) =>
              void readFiles(Array.from(event.target.files ?? []))
            }
          />
          <div className="upload-actions">
            <Button
              disabled={busy || running}
              onClick={() => inputRef.current?.click()}
            >
              Choose files
            </Button>
            <Button
              disabled={busy || running}
              onClick={() => void loadExamples()}
            >
              Try example data
            </Button>
          </div>
        </div>
        <div className="import-feedback" aria-live="polite">
          {busy && (
            <p>
              Reading files…{" "}
              <button
                className="text-button"
                onClick={() => {
                  generation.current++
                  setBusy(false)
                }}
              >
                Cancel reading
              </button>
            </p>
          )}
          {errors.map((message, i) => (
            <p className="import-error" role="alert" key={i}>
              {message}
            </p>
          ))}
        </div>
        {staged.length > 0 && (
          <ul className="staged-files">
            {staged.map((file) => (
              <li key={file.kind}>
                <Icon name="data" />
                <button
                  type="button"
                  className="staged-file-name"
                  title="Show in the table below"
                  onClick={() => loadIntoEditor(file.kind, file)}
                >
                  <strong>{file.name}</strong>
                  <span>
                    {kindNames[file.kind]} · {file.rows.length.toLocaleString()}{" "}
                    rows
                  </span>
                </button>
                <button
                  type="button"
                  className="row-delete"
                  title="Remove"
                  aria-label={`Remove ${file.name}`}
                  disabled={running}
                  onClick={() => {
                    setStaged(staged.filter((item) => item.kind !== file.kind))
                    if (editor.kind === file.kind)
                      loadIntoEditor(file.kind, workspace.inputs[file.kind])
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="2 · Check and edit"
        caption={`${editorSource}${editorDirty ? " · edited" : ""} · the original file is not changed`}
      >
        <div className="scenario-toolbar">
          <label>
            Data to edit
            <select
              value={editor.kind}
              disabled={busy || running}
              onChange={(event) =>
                loadIntoEditor(event.target.value as DataKind)
              }
            >
              {(Object.keys(kindNames) as DataKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {kindNames[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll scenario-table">
          <table>
            <thead>
              <tr>
                <th aria-label="Row number">#</th>
                {editor.columns.map((key) => (
                  <th key={key} title={key}>
                    {columnLabel(key)}
                  </th>
                ))}
                <th aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {editor.rows
                .slice(firstRow, firstRow + pageSize)
                .map((cells, i) => {
                  const row = firstRow + i
                  return (
                    <tr key={row}>
                      <td className="numeric">{row + 1}</td>
                      {cells.map((value, column) => (
                        <td key={column}>
                          <input
                            value={value}
                            disabled={running}
                            aria-label={`Row ${row + 1} ${columnLabel(editor.columns[column])}`}
                            onChange={(event) =>
                              updateCell(row, column, event.target.value)
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="row-delete"
                          title="Delete row"
                          disabled={running}
                          aria-label={`Delete row ${row + 1}`}
                          onClick={() =>
                            editRows(editor.rows.filter((_, j) => j !== row))
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="scenario-pager">
          <button
            className="text-button"
            disabled={running}
            onClick={() => {
              // A copy of the last row is the quickest start for a new sample.
              editRows([
                ...editor.rows,
                editor.rows.at(-1)?.slice() ?? editor.columns.map(() => ""),
              ])
              setPage(Math.floor(editor.rows.length / pageSize))
            }}
          >
            + Add row
          </button>
          <span className="scenario-pages">
            Rows {editor.rows.length ? firstRow + 1 : 0}–
            {Math.min(firstRow + pageSize, editor.rows.length)} of{" "}
            {editor.rows.length}
            {pages > 1 && (
              <>
                <button
                  type="button"
                  className="pager-button"
                  aria-label="Previous rows"
                  disabled={firstRow === 0}
                  onClick={() => setPage(firstRow / pageSize - 1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="pager-button"
                  aria-label="Next rows"
                  disabled={firstRow + pageSize >= editor.rows.length}
                  onClick={() => setPage(firstRow / pageSize + 1)}
                >
                  ›
                </button>
              </>
            )}
          </span>
        </div>
        <div aria-live="polite">
          {editorErrors.map((message, i) => (
            <p className="import-error" role="alert" key={i}>
              {message}
            </p>
          ))}
        </div>
        <div className="run-actions">
          <Button
            primary
            disabled={busy || running}
            onClick={() => void applyAll()}
          >
            {running
              ? "Applying…"
              : pending.size
                ? "Apply to all pages"
                : "Re-run analyses"}
          </Button>
          <Button
            disabled={busy || running || !editorDirty}
            onClick={() => loadIntoEditor(editor.kind)}
          >
            Undo edits
          </Button>
          <Button
            icon="download"
            disabled={!editor.rows.length}
            onClick={() =>
              downloadFile(
                `edited-${editor.kind}.csv`,
                scenarioCsv(editor),
                "text/csv;charset=utf-8",
              )
            }
          >
            Download CSV
          </Button>
          <span role="status">
            {pending.size > 0 &&
              `${pending.size} of 3 data types ready to apply`}
            {workspace.run?.planError &&
              ` Data applied. CulturePlan needs a new fit: ${workspace.run.planError}`}
          </span>
        </div>
      </Panel>
      <p className="local-data-note">
        Python on this computer · Export before refreshing to keep your work.
      </p>
      <Details title="Active inputs & connections">
        <div className="input-connections">
          {(["culture", "experiments", "markers"] as const).map((kind) => {
            const file =
              staged.find((item) => item.kind === kind) ??
              workspace.inputs[kind]
            return (
              <article key={kind}>
                <div>
                  <h3>{kindNames[kind]}</h3>
                  <p>
                    {kind === "culture"
                      ? "Guard → ErythroPilot reports → growth simulation → research report"
                      : kind === "experiments"
                        ? "CulturePlan → GP estimates and condition review → research report"
                        : "RareMatch → signature results and lab checklist → research report"}
                  </p>
                </div>
                <div>
                  <strong>{file.name}</strong>
                  <p>{file.rows.length} rows</p>
                  <Badge
                    tone={
                      file.evidence === "user_supplied" ? "brand" : "neutral"
                    }
                  >
                    {file.evidence === "user_supplied"
                      ? "Imported · unverified evidence"
                      : "Synthetic demo"}
                  </Badge>
                </div>
              </article>
            )
          })}
        </div>
        {workspace.run && (
          <div className="panel-note">
            <strong>Last run completed · {workspace.run.generatedAt}</strong>
            <p>
              Run fingerprint <code>{workspace.run.id}</code>
            </p>
            <p>
              Each module uses its own listed input. No connection between
              biological sample IDs is assumed.
            </p>
          </div>
        )}
      </Details>
      <Details title="Download example files">
        <p>Synthetic data for practicing the workflow.</p>
        <div className="example-downloads">
          {(["culture", "experiments", "markers"] as const).map((kind) => (
            <article key={kind}>
              <h3>{kindNames[kind]}</h3>
              <p>
                {kind === "culture"
                  ? "Two batches with timed cell counts and optional pH, temperature, glucose, and lactate."
                  : kind === "experiments"
                    ? "Twelve experimental runs across four settings, with measured response values."
                    : "Six test profiles with two marker calls, including missing and ambiguous calls."}
              </p>
              <Button
                icon="download"
                onClick={() =>
                  downloadFile(
                    `hemogpt-example-${kind}.csv`,
                    exampleFiles[kind],
                    "text/csv;charset=utf-8",
                  )
                }
              >
                Download example CSV
              </Button>
            </article>
          ))}
        </div>
      </Details>
      <Details title="File format & import help">
        <p>
          Use these headers in CSV/TSV, or keys in JSON. One file per data type;
          a new file replaces the pending input of that type. Other active
          inputs stay in use.
        </p>
        <div className="column-guide">
          <p>
            <b>Culture:</b>{" "}
            <code>batch_id, elapsed_hours, cell_count_million</code>. Optional{" "}
            <code>
              cell_line, ph, temperature_c, do_percent, glucose_mmol_l,
              glutamine_mmol_l, lactate_mmol_l, ammonia_mmol_l,
              viability_percent
            </code>
            . Counts are absolute millions of cells, not cells/mL. Times must
            increase within each batch. Blank counts stay missing; zero counts
            trigger review.
          </p>
          <p>
            <b>Experiments:</b>{" "}
            <code>
              condition_id, lactate_mg_l, ammonia_mg_l, response, response_unit
            </code>
            . One row per replicate. Keep the same response unit throughout.
          </p>
          <p>
            <b>Markers:</b> <code>sample_id</code> plus any number of{" "}
            <code>GENE_rs123</code> or <code>rs123</code> columns. Calls use
            A/C/G/T pairs such as G/G, A/G, C/T, or phased A|G. JSON can supply
            a <code>markers</code> array with gene, rsId, and alleles, plus rows
            with a calls object. Missing or unsupported calls follow your
            selected screening rule. These are marker comparisons, not clinical
            blood matching.
          </p>
        </div>
        <p>
          Inputs remain in this browser until the session ends. Predictions are
          processed by the local Python API. HemoBot analyses additionally save
          source snapshots and audits to local SQLite; Ollama mode sends evidence
          statements and your question to the configured model server. Export
          browser-only work before refreshing.
        </p>
      </Details>
    </>
  )
}
