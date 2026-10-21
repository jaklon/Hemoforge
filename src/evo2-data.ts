export interface Evo2Draft {
  mode: "paired_fasta" | "vcf_window"
  gene: "KEL" | "SLC14A1"
  sample_id: string
  study_id: string
  genome_build: "GRCh38" | "synthetic_fixture"
  evidence: "user_supplied" | "public_reference_unverified" | "software_test_only"
  reference_label: string
  contig: string
  reference_fasta: string
  alternate_fasta: string
  vcf_text: string
  start: string
}

export const emptyEvo2Draft: Evo2Draft = {
  mode: "paired_fasta", gene: "KEL", sample_id: "", study_id: "", genome_build: "GRCh38", evidence: "user_supplied",
  reference_label: "", contig: "", reference_fasta: "", alternate_fasta: "", vcf_text: "", start: "",
}

export function evo2Payload(draft: Evo2Draft) {
  const start = draft.start.trim() ? Number(draft.start) : null
  if (start !== null && (!Number.isSafeInteger(start) || start < 1)) throw new Error("Use a positive whole-number reference start.")
  if (draft.mode === "vcf_window" && start === null) throw new Error("VCF preparation requires the first reference base's genomic coordinate.")
  const common = { gene: draft.gene, sample_id: draft.sample_id, study_id: draft.study_id,
    genome_build: draft.genome_build, evidence: draft.evidence, reference_label: draft.reference_label,
    contig: draft.contig, reference_fasta: draft.reference_fasta, reference_start_1based: start }
  return draft.mode === "paired_fasta" ? { ...common, mode: draft.mode, alternate_fasta: draft.alternate_fasta }
    : { ...common, mode: draft.mode, vcf_text: draft.vcf_text, flank_bp: 128 }
}

export function evo2ExportUrl(id: string) {
  return `/api/v1/evo2/preparations/${encodeURIComponent(id)}/export`
}

export interface Evo2Variant {
  id: string
  variant_id: string
  gene: "KEL" | "SLC14A1"
  contig: string
  position_1based: number
  ref: string
  alt: string
  split: "train" | "validation" | "test"
  consequence_annotation: string
}

export interface Evo2Prepared {
  preparation_id: string
  manifest_fingerprint: string
  execution_status: "prepared_only"
  manifest: {
    tasks: { task_id: string; gene: string; variant_id: string | null; position_1based: number | null;
      sequence_length: number; score_status: "not_run"; delta_log_likelihood: null }[]
    warnings: string[]
    source_hashes: Record<string, string>
  }
}

export function evo2VariantsUrl(gene: string, split: string, q: string, offset: number) {
  const params = new URLSearchParams({ offset: String(offset), limit: "20" })
  if (gene) params.set("gene", gene)
  if (split) params.set("split", split)
  if (q.trim()) params.set("q", q.trim())
  return `/api/v1/evo2/dataset/variants?${params}`
}

export function evo2DatasetPayload(ids: string[]) {
  if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length) throw new Error("Select 1–20 unique variants.")
  return { variant_ids: [...ids] }
}

export function evo2NvidiaPayload(ids: string[]) {
  if (ids.length !== 1) throw new Error("Select exactly one public variant for NVIDIA trial inference.")
  return { variant_id: ids[0] }
}

export function evo2NvidiaExportUrl(id: string) {
  return `/api/v1/evo2/nvidia/results/${encodeURIComponent(id)}/export`
}
