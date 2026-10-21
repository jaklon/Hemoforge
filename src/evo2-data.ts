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
