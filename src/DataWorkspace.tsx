import { useRef, useState } from "react"
import { useWorkspace, checksum } from "./workspace-context"
import {
  exampleFiles,
  parseInput,
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
export default function DataWorkspace({ onRun }: { onRun: () => void }) {
  const workspace = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [staged, setStaged] = useState<InputFile[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  async function readFiles(files: File[]) {
    if (!files.length) return
    if (files.length > 3) {
      setErrors(["Choose up to three files at a time: one per data type."])
      return
    }
    const token = ++generation.current
    setBusy(true)
    setErrors([])
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
    if (inputRef.current) inputRef.current.value = ""
  }
  async function run() {
    if (running || busy) return
    setRunning(true)
    setErrors([])
    try {
      await workspace.apply(staged)
      setStaged([])
      onRun()
    } catch (error) {
      setErrors([
        error instanceof Error
          ? error.message
          : "The run failed. Existing data remain available.",
      ])
    } finally {
      setRunning(false)
    }
  }
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
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        title="Data & runs"
        description="Upload data or try an example, then run."
        action={
          <div className="header-actions">
            <Badge
              tone={
                workspace.backendStatus === "online"
                  ? "success"
                  : workspace.backendStatus === "offline"
                    ? "warning"
                    : "neutral"
              }
            >
              {workspace.backendStatus === "online"
                ? "Python connected"
                : workspace.backendStatus === "offline"
                  ? "Python offline"
                  : "Connecting…"}
            </Badge>
            {workspace.backendStatus === "offline" && (
              <Button onClick={() => void workspace.checkBackend()}>
                Retry
              </Button>
            )}
            <a
              className="button"
              href="http://127.0.0.1:8501"
              target="_blank"
              rel="noreferrer"
            >
              Python lab ↗
            </a>
          </div>
        }
      />
      <Panel
        title="Import data"
        caption="CSV, TSV, or JSON · up to 2 MB and 10,000 rows per file"
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
        {staged.map((file) => (
          <div className="input-preview" key={file.kind}>
            <div className="section-heading">
              <div>
                <h3>{file.name}</h3>
                <p>
                  {kindNames[file.kind]} · {file.rows.length} rows · ready to
                  run
                </p>
              </div>
              <Button
                disabled={running}
                onClick={() =>
                  setStaged(staged.filter((item) => item.kind !== file.kind))
                }
              >
                Remove
              </Button>
            </div>
            <Details title="Preview first 4 rows">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(file.rows[0]).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {file.rows.slice(0, 4).map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((value, j) => (
                          <td key={j}>
                            {value === null
                              ? "Missing"
                              : typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Details>
          </div>
        ))}
        <div className="run-actions">
          <Button primary disabled={busy || running} onClick={() => void run()}>
            {running
              ? "Running analyses…"
              : staged.length
                ? "Run imported data"
                : "Run current workspace"}
          </Button>
          <span>
            {staged.length
              ? `${staged.length} files ready`
              : "Using active inputs"}
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
            <b>Markers:</b>{" "}
            <code>sample_id, kel_rs8176058, slc14a1_rs1058396</code>. Calls such
            as G/G, G/A, A/A; blank or ambiguous calls become unknown. These are
            marker comparisons, not clinical blood matching.
          </p>
        </div>
        <p>
          Inputs are held in this browser for the current session. Prediction
          data is sent to the Python service on this computer and processed in
          memory. No cloud service or stored dataset is used. Export before
          refreshing.
        </p>
      </Details>
    </>
  )
}
