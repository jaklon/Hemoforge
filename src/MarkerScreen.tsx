import Evo2Preparation from "./Evo2Preparation"

import { useEffect, useState } from "react"

import { useWorkspace } from "./workspace-context"

import {
  builtInMarkers,
  filterMarkers,
  markerSettingsError,
  type MarkerDefinition,
  type MarkerRow,
  type MarkerTarget,
} from "./marker-screening"

import { Button, Panel, Badge, PageTitle, Details } from "./workspace-ui"

import { csv, downloadFile } from "./workspace-utils"

export default function MarkerScreen({
  checks,

  setChecks,

  onEditData,
}: {
  checks: boolean[]

  setChecks: (value: boolean[]) => void

  onEditData: () => void
}) {
  const {
    inputs,

    markerSettings: settings,

    setMarkerSettings: setSettings,
  } = useWorkspace()

  const source = inputs.markers

  const catalog = [
    ...new Map(
      [...builtInMarkers, ...(source.markers ?? []), ...settings.targets].map(
        (marker) => [marker.rsId, marker],
      ),
    ).values(),
  ]

  const rows = filterMarkers(source.rows as MarkerRow[], settings)

  const error = markerSettingsError(settings)

  const [status, setStatus] = useState("all")

  const [pageSize, setPageSize] = useState(25)

  const [page, setPage] = useState(0)

  const [custom, setCustom] = useState({
    gene: "",

    rsId: "",

    alleles: "A,C,G,T",
  })

  const [customError, setCustomError] = useState("")

  const filtered =
    status === "all" ? rows : rows.filter((row) => row.status === status)

  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1)

  const safePage = Math.min(page, maxPage)

  useEffect(() => setPage(0), [settings, source, status, pageSize])

  function update(index: number, change: Partial<MarkerTarget>) {
    setSettings((old) => ({
      ...old,

      targets: old.targets.map((target, i) =>
        i === index ? { ...target, ...change } : target,
      ),
    }))
  }

  function add(marker: MarkerDefinition) {
    if (settings.targets.some((target) => target.rsId === marker.rsId)) {
      setCustomError(
        `${marker.rsId} is already in this panel. Edit its existing target.`,
      )

      return
    }

    if (settings.targets.length >= 100) {
      setCustomError("Use at most 100 markers per local panel.")

      return
    }

    setSettings((old) => ({
      ...old,

      targets: [...old.targets, { ...marker, genotype: "*" }],
    }))

    setCustomError("")
  }

  return (
    <>
      <PageTitle
        title="RareMatch"
        description="Build a marker panel and choose which profiles to find."
        action={
          <Badge>
            {source.evidence === "user_supplied"
              ? "Researcher-supplied data"
              : "Synthetic demo"}
          </Badge>
        }
      />
      <p className="context-strip">
        Source: <b>{source.name}</b>
        <a
          href="#data"
          onClick={(event) => {
            event.preventDefault()

            onEditData()
          }}
        >
          Edit scenario data
        </a>
      </p>
      <p>
        <a className="method-link" href="#methods/markers">
          Matching rules &amp; references
        </a>
      </p>
      <Panel
        title="Marker panel"
        caption="Choose any imported marker, or define a custom marker for your simulation."
        action={
          <Button
            onClick={() => {
              const next = catalog.find(
                (marker) =>
                  !settings.targets.some(
                    (target) => target.rsId === marker.rsId,
                  ),
              )

              if (next) add(next)
              else document.getElementById("custom-marker-gene")?.focus()
            }}
          >
            Add marker
          </Button>
        }
      >
        <div className="marker-controls">
          {settings.targets.map((target, index) => (
            <fieldset className="marker-card" key={index}>
              <legend>Marker {index + 1}</legend>
              <label>
                Gene / marker
                <select
                  value={target.rsId}
                  onChange={(event) => {
                    const marker = catalog.find(
                      (entry) => entry.rsId === event.target.value,
                    )!

                    update(index, { ...marker, genotype: "*" })
                  }}
                >
                  {catalog.map((marker) => (
                    <option
                      key={marker.rsId}
                      value={marker.rsId}
                      disabled={
                        marker.rsId !== target.rsId &&
                        settings.targets.some(
                          (entry) => entry.rsId === marker.rsId,
                        )
                      }
                    >
                      {marker.gene || "Unmapped gene"} · {marker.rsId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target genotype
                <input
                  value={target.genotype}
                  placeholder="A/G or *"
                  aria-invalid={!target.genotype || undefined}
                  onChange={(event) =>
                    update(index, {
                      genotype: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label>
                Allowed DNA letters
                <input
                  value={target.alleles.join(",")}
                  onChange={(event) =>
                    update(index, {
                      alleles: event.target.value

                        .toUpperCase()

                        .split(/[\s,;/]+/),
                    })
                  }
                />
              </label>
              <small>
                * accepts any known genotype. Missing calls still follow your
                rule below.
              </small>
              <Button
                onClick={() =>
                  setSettings({
                    ...settings,

                    targets: settings.targets.filter((_, i) => i !== index),
                  })
                }
              >
                Remove marker {index + 1}
              </Button>
            </fieldset>
          ))}
        </div>
        <form
          noValidate
          className="custom-marker-form"
          onSubmit={(event) => {
            event.preventDefault()

            const rsId = custom.rsId.trim().toLowerCase()

            const known = catalog.find((marker) => marker.rsId === rsId)

            const marker = known ?? {
              gene: custom.gene.trim().toUpperCase(),

              rsId,

              alleles: custom.alleles

                .toUpperCase()

                .split(/[\s,;/]+/)

                .filter(Boolean),
            }

            const failure = markerSettingsError({
              ...settings,

              targets: [{ ...marker, genotype: "*" }],
            })

            if (failure) {
              setCustomError(failure)

              return
            }

            add(marker)
          }}
        >
          <div className="settings-grid">
            <label htmlFor="custom-marker-gene">
              Gene label (optional)
              <input
                id="custom-marker-gene"
                value={custom.gene}
                placeholder="e.g. ACKR1"
                onChange={(event) => {
                  const gene = event.target.value.toUpperCase()

                  const known = catalog.find(
                    (marker) =>
                      marker.gene === gene &&
                      !settings.targets.some(
                        (target) => target.rsId === marker.rsId,
                      ),
                  )

                  setCustom({
                    ...custom,

                    gene,

                    ...(known
                      ? { rsId: known.rsId, alleles: known.alleles.join(",") }
                      : {}),
                  })
                }}
              />
            </label>
            <label htmlFor="custom-marker-rs">
              Marker rs ID
              <input
                id="custom-marker-rs"
                value={custom.rsId}
                placeholder="e.g. rs12075"
                onChange={(event) => {
                  const rsId = event.target.value.toLowerCase()

                  const known = catalog.find((marker) => marker.rsId === rsId)

                  setCustom({
                    ...custom,

                    rsId,

                    ...(known
                      ? { gene: known.gene, alleles: known.alleles.join(",") }
                      : {}),
                  })
                }}
                aria-invalid={!!customError}
                aria-describedby="custom-marker-help"
              />
            </label>
            <label>
              Allowed DNA letters
              <input
                value={custom.alleles}
                onChange={(event) =>
                  setCustom({ ...custom, alleles: event.target.value })
                }
              />
            </label>
          </div>
          <p className="panel-note" id="custom-marker-help">
            Known markers keep their linked gene. New gene–rs mappings are
            researcher supplied. Add the matching rs column to your scenario
            data to populate calls.
          </p>
          {customError && (
            <p role="alert" className="import-error">
              {customError}
            </p>
          )}
          <button className="button" type="submit">
            Add custom marker
          </button>
        </form>
        <div className="settings-grid panel-note">
          <label>
            Match rule
            <select
              value={settings.mode}
              onChange={(event) =>
                setSettings({
                  ...settings,

                  mode: event.target.value as typeof settings.mode,
                })
              }
            >
              <option value="all">Match all selected markers</option>
              <option value="any">Match any selected marker</option>
            </select>
          </label>
          <label>
            Missing or unsupported calls
            <select
              value={settings.missing}
              onChange={(event) =>
                setSettings({
                  ...settings,

                  missing: event.target.value as typeof settings.missing,
                })
              }
            >
              <option value="unknown">Keep undecidable profiles unknown</option>
              <option value="exclude">
                Exclude profiles with missing calls
              </option>
              <option value="ignore">Compare known calls only</option>
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="import-error">
            {error}
          </p>
        )}
      </Panel>
      <div className="screening-stats" aria-live="polite">
        <span>
          <b>{rows.length}</b> profiles
        </span>
        {(["match", "excluded", "unknown"] as const).map((state) => (
          <span key={state}>
            <b>{rows.filter((row) => row.status === state).length}</b>{" "}
            {state === "match" ? "matches" : state}
          </span>
        ))}
      </div>
      <Panel
        title="Marker screening results"
        caption={
          settings.missing === "ignore"
            ? "Coverage shows how many selected markers had usable calls."
            : "Results follow the selected marker panel and matching rules."
        }
        action={
          <Button
            icon="download"
            disabled={!!error}
            onClick={() =>
              downloadFile(
                "hemogpt-marker-results.csv",

                csv([
                  [
                    "sample_id",

                    ...settings.targets.map(
                      (target) => `${target.gene}_${target.rsId}`,
                    ),

                    "status",

                    "checked_markers",

                    "total_markers",

                    "target_signature",

                    "match_rule",

                    "missing_rule",

                    "source",

                    "sha256",
                  ],

                  ...filtered.map((row) => [
                    row.id,

                    ...settings.targets.map(
                      (target) => row.calls[target.rsId] ?? "./.",
                    ),

                    row.status,

                    row.checkedMarkers,

                    row.totalMarkers,

                    JSON.stringify(settings.targets),

                    settings.mode,

                    settings.missing,

                    source.name,

                    source.sha256,
                  ]),
                ]),

                "text/csv;charset=utf-8",
              )
            }
          >
            Export results CSV
          </Button>
        }
      >
        <div className="settings-grid table-filter">
          <label>
            Show profiles
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All profiles</option>
              <option value="match">Matches only</option>
              <option value="excluded">Excluded only</option>
              <option value="unknown">Unknown only</option>
            </select>
          </label>
          <label>
            Rows per page
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Sample ID</th>
                {settings.targets.map((target) => (
                  <th key={target.rsId}>
                    {target.gene} {target.rsId}
                  </th>
                ))}
                <th>Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered

                  .slice(safePage * pageSize, (safePage + 1) * pageSize)

                  .map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      {settings.targets.map((target) => (
                        <td key={target.rsId}>
                          {row.calls[target.rsId] ?? "./."}
                        </td>
                      ))}
                      <td>
                        {row.checkedMarkers}/{row.totalMarkers}
                      </td>
                      <td>
                        <Badge
                          tone={
                            row.status === "match"
                              ? "brand"
                              : row.status === "unknown"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={settings.targets.length + 3}>
                    No profiles in this view. Change the targets or show all
                    profiles.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <Button disabled={!safePage} onClick={() => setPage(safePage - 1)}>
            Previous
          </Button>
          <span>
            {filtered.length} results · page {safePage + 1} / {maxPage + 1}
          </span>
          <Button
            disabled={safePage === maxPage}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </Panel>
      <Panel
        title="Post-harvest verification"
        caption="Laboratory requests"
        action={<Badge tone="warning">Lab results pending</Badge>}
      >
        <div className="qc-checklist">
          {[
            "Request paired post-harvest genotyping / sequencing",

            "Request phenotype / serology confirmation",

            "Reconcile laboratory results with the initial marker profile",
          ].map((text, i) => (
            <label key={text}>
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(event) =>
                  setChecks(
                    checks.map((checked, j) =>
                      i === j ? event.target.checked : checked,
                    ),
                  )
                }
              />
              <span>{text}</span>
            </label>
          ))}
        </div>
        <Details title="Screening assumptions">
          <p>
            Comparisons use unphased, diploid A/C/G/T calls. A|G and G/A compare
            equally. Strand orientation must agree with the source. Custom
            mappings and allowed letters describe your scenario; they are not
            independently verified. Gene labels alone do not change source
            calls.
          </p>
          <p>
            Marker matching does not establish full blood type or transfusion
            compatibility. Checklist selections record planned verification.
          </p>
        </Details>
      </Panel>
      <Evo2Preparation />
    </>
  )
}
