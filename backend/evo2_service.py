"""Small, local-only sequence preflight. No networking, model imports, or inference."""

import hashlib
import re
from datetime import datetime, timezone
from uuid import uuid4

from backend.agent_store import AuditStore, fingerprint
from backend.marker_calls import normalize_call
from backend.evo2_models import CostPolicy, PairedFastaRequest, PreparationManifest, PreparedBundle, SequenceTask

POLICY = CostPolicy().model_dump()
SCORING_OPTIONS = {"reduce_method": "sum", "prepend_bos": True, "average_reverse_complement": False, "batch_size": 1}
LIMITS = [
    "Software validation does not verify genome assembly, gene annotation, sample identity, or biological quality.",
    "A single-variant reference/alternate comparison does not reconstruct donor haplotypes from two SNPs.",
    "No pathogenicity, antigen phenotype, genomic stability, or laboratory release conclusion is established.",
    "Inference is disabled. No external API, model download, or GPU provisioning is triggered by preparation.",
]


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def status():
    return {"name": "Evo 2 preparation", "status": "disabled_budget_lock", "policy": POLICY,
            "candidate_model": "evo2_7b_base", "available_operations": ["marker_readiness", "prepare_sequences", "export_manifest"],
            "required_inputs": ["verified reference sequence and assembly", "reference/alternate sequence pair or VCF with reference window", "compatible local GPU and reviewed local weights for later inference"],
            "limitations": LIMITS}


def marker_readiness(source):
    rows = source.rows
    known = lambda call: normalize_call(call) in {"G/G", "G/A", "A/A"}
    resolved = sum(known(r.kel) and known(r.slc) for r in rows)
    return {"status": "needs_sequence_data", "profile_count": len(rows), "resolved_two_marker_profiles": resolved,
            "profiles_with_unknown_calls": len(rows) - resolved, "marker_ids": ["rs8176058", "rs1058396"],
            "source_name": source.name, "reported_source_sha256": source.sha256,
            "content_sha256": fingerprint([r.model_dump() for r in rows]), "evidence": source.evidence,
            "sequence_records_available": 0, "score_status": "not_run", "delta_log_likelihood": None,
            "policy": POLICY, "missing_requirements": status()["required_inputs"], "limitations": LIMITS}


def parse_fasta(text, max_bases=131072):
    lines = [line.strip() for line in text.lstrip("\ufeff").splitlines() if line.strip()]
    if not lines or not lines[0].startswith(">") or len(lines[0]) > 300:
        raise ValueError("Use a single-record FASTA with a non-empty header.")
    record_id = lines[0][1:].split()[0] if lines[0][1:].strip() else ""
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}", record_id) or any(line.startswith(">") for line in lines[1:]):
        raise ValueError("Use exactly one FASTA record with a simple record identifier.")
    sequence = "".join(lines[1:]).upper()
    if not 33 <= len(sequence) <= max_bases or re.fullmatch(r"[ACGT]+", sequence) is None:
        raise ValueError(f"Use 33 to {max_bases} unambiguous A/C/G/T bases; N, gaps, and other symbols require review.")
    return record_id, sequence


def task_material(task):
    return task.model_dump(exclude={"task_id"}) if isinstance(task, SequenceTask) else task


def make_task(request, reference, alternate, index, position=None, variant_id=None, genotype=None):
    if len(reference) != len(alternate) or not 33 <= len(reference) <= 8191:
        raise ValueError("The first adapter supports equal-length SNV pairs up to 8191 bases, reserving one BOS token.")
    differences = [i for i, (ref, alt) in enumerate(zip(reference, alternate)) if ref != alt]
    if differences != [index] or index < 16 or len(reference) - index - 1 < 16:
        raise ValueError("Each task needs exactly one SNV with at least sixteen reference bases on each side.")
    values = {"sample_id": request.sample_id, "study_id": request.study_id, "gene": request.gene,
              "genome_build": request.genome_build, "evidence": request.evidence, "contig": request.contig,
              "position_1based": position, "variant_id": variant_id, "genotype": genotype,
              "reference_sequence": reference, "alternate_sequence": alternate,
              "reference_sha256": text_hash(reference), "alternate_sha256": text_hash(alternate),
              "variant_index_0based": index, "ref": reference[index], "alt": alternate[index],
              "sequence_length": len(reference), "score_status": "not_run", "delta_log_likelihood": None}
    return SequenceTask(task_id=fingerprint(values), **values)


def parse_vcf(request, reference):
    lines = [line for line in request.vcf_text.lstrip("\ufeff").splitlines() if line.strip()]
    if not lines or re.fullmatch(r"##fileformat=VCFv4\.[1-5]", lines[0]) is None:
        raise ValueError("Use a VCF v4 file with tab-separated columns and a #CHROM header.")
    header = None
    tasks = []
    seen = set()
    for line in lines[1:]:
        if line.startswith("##"):
            if header is not None:
                raise ValueError("VCF metadata must precede its column header.")
            if line in {"##reference=GRCh37", "##reference=hg19"} and request.genome_build == "GRCh38":
                raise ValueError("VCF reference declaration conflicts with the requested genome build.")
            continue
        if line.startswith("#"):
            columns = line.split("\t")
            if header is not None or columns[:8] != ["#CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO"]:
                raise ValueError("Use one standard VCF column header.")
            if len(columns) == 9 or (len(columns) > 8 and (columns[8] != "FORMAT" or len(set(columns[9:])) != len(columns[9:]))):
                raise ValueError("VCF FORMAT columns require uniquely named samples.")
            if len(columns) > 8 and request.sample_id not in columns[9:]:
                raise ValueError("The selected sample ID is absent from the VCF sample columns.")
            header = columns
            continue
        if header is None:
            raise ValueError("VCF records require a preceding #CHROM header.")
        fields = line.split("\t")
        if len(fields) != len(header):
            raise ValueError("Every VCF row must match its header column count.")
        chrom, raw_position, variant_id, ref, alt, _qual, filtering, _info = fields[:8]
        if chrom != request.contig or not raw_position.isascii() or not raw_position.isdecimal() or not 1 <= int(raw_position) <= 1_000_000_000:
            raise ValueError("VCF contig and positive one-based positions must match the supplied reference window.")
        if ref not in "ACGT" or len(ref) != 1 or alt not in "ACGT" or len(alt) != 1 or ref == alt:
            raise ValueError("Only biallelic A/C/G/T SNVs are supported; indels, symbolic/multiple alleles, and ambiguous bases need a separate adapter.")
        if filtering not in {"PASS", "."} or len(variant_id) > 120:
            raise ValueError("Filtered variants or oversized variant identifiers require review.")
        genotype = None
        if len(header) > 8:
            formats = fields[8].split(":")
            values = fields[header.index(request.sample_id)].split(":")
            if len(set(formats)) != len(formats) or "GT" not in formats or len(values) != len(formats):
                raise ValueError("Sample records require a well-formed GT field.")
            genotype = values[formats.index("GT")]
            if re.fullmatch(r"[01](?:[/|][01])?", genotype) is None or "1" not in genotype:
                raise ValueError("Each selected sample must have a resolved genotype carrying the ALT allele; missing and reference-only calls are not inferred.")
        position = int(raw_position)
        if position in seen:
            raise ValueError("Duplicate VCF positions are not combined or silently deduplicated.")
        seen.add(position)
        offset = position - request.reference_start_1based
        flank = request.flank_bp
        if offset < flank or offset + flank >= len(reference):
            raise ValueError("The supplied reference window does not cover both requested variant flanks.")
        if reference[offset] != ref:
            raise ValueError("The VCF REF allele does not match the supplied forward reference sequence.")
        sequence = reference[offset - flank:offset + flank + 1]
        alternate = sequence[:flank] + alt + sequence[flank + 1:]
        tasks.append(make_task(request, sequence, alternate, flank, position, None if variant_id == "." else variant_id, genotype))
        if len(tasks) > 20:
            raise ValueError("Prepare at most twenty independent SNVs per request.")
    if not tasks:
        raise ValueError("The VCF contains no supported variants.")
    return tasks


def prepare(request, database_path):
    record_id, reference = parse_fasta(request.reference_fasta, 8191 if isinstance(request, PairedFastaRequest) else 131072)
    if record_id != request.contig:
        raise ValueError("The reference FASTA record ID must exactly match the declared contig; orientation/aliases are not inferred.")
    hashes = {"reference_text_sha256": text_hash(request.reference_fasta), "reference_sequence_sha256": text_hash(reference)}
    if isinstance(request, PairedFastaRequest):
        _, alternate = parse_fasta(request.alternate_fasta, 8191)
        differences = [i for i, (a, b) in enumerate(zip(reference, alternate)) if a != b]
        if len(reference) != len(alternate) or len(differences) != 1:
            raise ValueError("Provide equal-length reference/alternate sequences differing at exactly one nucleotide.")
        index = differences[0]
        position = request.reference_start_1based + index if request.reference_start_1based is not None else None
        tasks = [make_task(request, reference, alternate, index, position)]
        hashes["alternate_text_sha256"] = text_hash(request.alternate_fasta)
    else:
        tasks = parse_vcf(request, reference)
        hashes["vcf_text_sha256"] = text_hash(request.vcf_text)
    warnings = LIMITS + ["Gene, study, sample association, and reference identity are operator declarations and remain unverified.",
                         "Multiple tasks are scored independently; no phasing, compound-variant, or post-harvest comparison is inferred.",
                         "A VCF FILTER of '.' means filtering was not reported, not that laboratory quality passed."]
    manifest = PreparationManifest(input_fingerprint=fingerprint(request.model_dump()), reference_label=request.reference_label,
                                   reference_window_start_1based=request.reference_start_1based,
                                   source_hashes=hashes, tasks=tasks, warnings=warnings)
    return persist_preparation(manifest, database_path)


def persist_preparation(manifest, database_path):
    bundle = PreparedBundle(preparation_id="evo2prep-" + uuid4().hex, prepared_at=datetime.now(timezone.utc).isoformat(),
                            manifest_fingerprint=fingerprint(manifest.model_dump()), manifest=manifest)
    store = AuditStore(database_path)
    with store.connect() as db:
        db.execute("CREATE TABLE IF NOT EXISTS evo2_preparations (id TEXT PRIMARY KEY, bundle_json TEXT NOT NULL)")
        db.execute("INSERT INTO evo2_preparations VALUES (?, ?)", (bundle.preparation_id, bundle.model_dump_json()))
    return bundle


def load_preparation(id, database_path):
    if re.fullmatch(r"evo2prep-[a-f0-9]{32}", id) is None:
        return None
    store = AuditStore(database_path)
    with store.connect() as db:
        exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='evo2_preparations'").fetchone()
        row = db.execute("SELECT bundle_json FROM evo2_preparations WHERE id = ?", (id,)).fetchone() if exists else None
    return PreparedBundle.model_validate_json(row[0]) if row else None


def validate_bundle(data):
    bundle = PreparedBundle.model_validate(data)
    manifest = bundle.manifest
    if manifest.scoring_options != SCORING_OPTIONS or fingerprint(manifest.model_dump()) != bundle.manifest_fingerprint:
        raise ValueError("Preparation fingerprint or fixed scoring options do not match.")
    ids = set()
    for task in manifest.tasks:
        ref, alt = task.reference_sequence, task.alternate_sequence
        differences = [i for i, (a, b) in enumerate(zip(ref, alt)) if a != b]
        if (len(ref) != len(alt) or len(ref) != task.sequence_length or differences != [task.variant_index_0based]
            or len(ref) - task.variant_index_0based - 1 < 16 or ref[task.variant_index_0based] != task.ref
            or alt[task.variant_index_0based] != task.alt or task.reference_sha256 != text_hash(ref)
            or task.alternate_sha256 != text_hash(alt) or task.task_id != fingerprint(task_material(task)) or task.task_id in ids):
            raise ValueError("Prepared sequence task integrity check failed.")
        ids.add(task.task_id)
    return bundle
