export interface MarkerDefinition {
  gene: string
  rsId: string
  alleles: string[]
}

export interface MarkerRow {
  sample_id: string
  calls: Record<string, string>
}

export interface MarkerTarget extends MarkerDefinition {
  genotype: string
}

export interface MarkerSettings {
  targets: MarkerTarget[]
  mode: "all" | "any"
  missing: "unknown" | "exclude" | "ignore"
}

export const builtInMarkers: MarkerDefinition[] = [
  { gene: "KEL", rsId: "rs8176058", alleles: ["G", "A"] },
  { gene: "SLC14A1", rsId: "rs1058396", alleles: ["G", "A"] },
]

export const defaultMarkerSettings: MarkerSettings = {
  targets: builtInMarkers.map((marker, i) => ({
    ...marker,
    genotype: i ? "G/G" : "G/A",
  })),
  mode: "all",
  missing: "unknown",
}

// Unphased diploid comparison: A|G and G/A describe the same target.
export function normalizeCall(value: unknown) {
  const text = String(value ?? "./.")
    .trim()
    .toUpperCase()
    .replace(/\|/g, "/")
  return /^[ACGT]\/[ACGT]$/.test(text)
    ? text.split("/").sort().join("/")
    : text || "./."
}

export function markerSettingsError(settings: MarkerSettings) {
  if (!settings.targets.length)
    return "Add at least one marker to start screening."
  if (
    new Set(settings.targets.map((target) => target.rsId)).size !==
    settings.targets.length
  )
    return "Each rs marker can appear only once in a screening panel."
  for (const target of settings.targets) {
    if (!/^rs[1-9]\d*$/i.test(target.rsId))
      return "Use an rs ID such as rs8176058."
    if (
      !target.alleles.length ||
      target.alleles.some((a) => !/^[ACGT]$/.test(a))
    )
      return `${target.rsId}: enter allowed DNA letters using A, C, G, or T.`
    const known = builtInMarkers.find((marker) => marker.rsId === target.rsId)
    if (known && known.gene !== target.gene)
      return `${target.rsId} belongs to ${known.gene}. Select the linked gene.`
    if (
      target.genotype !== "*" &&
      !isUsableCall(target.genotype, target.alleles)
    )
      return `${target.rsId}: use two allowed letters, such as A/G, or * for any known genotype.`
  }
  return ""
}

function isUsableCall(value: string, alleles: string[]) {
  const call = normalizeCall(value)
  return (
    /^[ACGT]\/[ACGT]$/.test(call) &&
    call.split("/").every((letter) => alleles.includes(letter))
  )
}

export function filterMarkers(rows: MarkerRow[], settings: MarkerSettings) {
  const error = markerSettingsError(settings)
  return rows.map((row) => {
    const outcomes = settings.targets.map((target) => {
      const call = row.calls[target.rsId] ?? "./."
      return !isUsableCall(call, target.alleles)
        ? "unknown"
        : target.genotype === "*" ||
            normalizeCall(call) === normalizeCall(target.genotype)
          ? "match"
          : "excluded"
    })
    const known = outcomes.filter((outcome) => outcome !== "unknown")
    const hasUnknown = known.length !== outcomes.length
    let status: "match" | "excluded" | "unknown" = "unknown"
    if (!error && !(hasUnknown && settings.missing === "exclude")) {
      if (settings.missing === "unknown" && hasUnknown) {
        status =
          settings.mode === "any" && known.includes("match")
            ? "match"
            : settings.mode === "all" && known.includes("excluded")
              ? "excluded"
              : "unknown"
      } else if (known.length) {
        status = (
          settings.mode === "all"
            ? known.every((value) => value === "match")
            : known.includes("match")
        )
          ? "match"
          : "excluded"
      }
    } else if (!error && hasUnknown && settings.missing === "exclude")
      status = "excluded"
    return {
      ...row,
      id: row.sample_id,
      status,
      checkedMarkers: known.length,
      totalMarkers: outcomes.length,
    }
  })
}
