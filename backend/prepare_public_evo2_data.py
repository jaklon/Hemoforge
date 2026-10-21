"""Explicitly download free public Ensembl data, then construct offline SNV examples.

No model/provider credentials, inference, or cloud provisioning are supported.
No network request happens on import or unless --download-public-data is supplied.
"""

import argparse
import csv
import hashlib
import io
import json
import re
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from backend.agent_store import fingerprint
from backend.evo2_models import PairedFastaRequest
from backend.evo2_service import text_hash

BASE = "https://rest.ensembl.org"
GENES = ("KEL", "SLC14A1")
FLANK = 128
BLOCK = 4096


class PublicDataClient:
    def __init__(self, cache, allow_download=False):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.allow_download = allow_download
        self.sources = {}

    def get(self, path):
        if not path.startswith("/") or "http:" in path or "https:" in path:
            raise ValueError("Only fixed public Ensembl API paths are supported.")
        url = BASE + path
        cached = self.cache / (hashlib.sha256(url.encode()).hexdigest() + ".json")
        meta = cached.with_suffix(".source.json")
        if not cached.is_file() or not meta.is_file():
            if not self.allow_download:
                raise ValueError("Public data is not cached. Downloading requires the explicit --download-public-data flag.")
            for attempt in range(3):
                try:
                    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "HemoForge-free-public-reference-preparation/1.0"})
                    with urllib.request.urlopen(request, timeout=35) as response:
                        raw = response.read(20 * 1024 * 1024 + 1)
                    if len(raw) > 20 * 1024 * 1024:
                        raise ValueError("Public response exceeds the twenty MB size cap.")
                    json.loads(raw)
                    cached.write_bytes(raw)
                    meta.write_text(json.dumps({"url": url, "retrieved_at": datetime.now(timezone.utc).isoformat(),
                                               "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}), encoding="utf-8")
                    break
                except (urllib.error.URLError, TimeoutError):
                    if attempt == 2:
                        raise
                    time.sleep(1 + attempt)
        raw = cached.read_bytes()
        provenance = json.loads(meta.read_text(encoding="utf-8"))
        if provenance["url"] != url or hashlib.sha256(raw).hexdigest() != provenance["sha256"]:
            raise ValueError("Public response cache integrity check failed.")
        self.sources[url] = provenance
        return json.loads(raw)


def eligible_variants(rows, gene, lookup, reference, reference_start):
    eligible, rejected, seen = [], Counter(), set()
    for row in rows:
        position = row.get("start")
        alleles = row.get("alleles", [])
        if (row.get("assembly_name") != "GRCh38" or row.get("seq_region_name") != lookup["seq_region_name"]
            or row.get("strand") != 1 or not isinstance(position, int) or row.get("end") != position
            or len(alleles) != 2 or any(a not in {"A", "C", "G", "T"} for a in alleles)
            or alleles[0] == alleles[1] or re.fullmatch(r"rs[0-9]+", row.get("id", "")) is None):
            rejected["not_supported_biallelic_forward_grch38_snv"] += 1
            continue
        if not lookup["start"] <= position <= lookup["end"]:
            rejected["outside_gene_interval"] += 1
            continue
        offset = position - reference_start
        if offset < FLANK or offset + FLANK >= len(reference) or reference[offset] != alleles[0]:
            rejected["reference_allele_or_window_mismatch"] += 1
            continue
        sequence = reference[offset - FLANK:offset + FLANK + 1]
        if set(sequence) - set("ACGT"):
            rejected["ambiguous_reference_window"] += 1
            continue
        # Keep each entire sequence in one genomic block. Different splits cannot share bases.
        block = (position - 1) // BLOCK
        if (position - FLANK - 1) // BLOCK != block or (position + FLANK - 1) // BLOCK != block:
            rejected["split_boundary_buffer"] += 1
            continue
        identity = (position, alleles[0], alleles[1])
        if identity in seen:
            rejected["duplicate_allelic_site"] += 1
            continue
        seen.add(identity)
        eligible.append({"gene": gene, "variant_id": row["id"], "contig": row["seq_region_name"], "position_1based": position,
                         "ref": alleles[0], "alt": alleles[1], "consequence_annotation": row.get("consequence_type", "not_reported"),
                         "source_database": row.get("source", "not_reported"), "block_id": f"{gene}:{block}",
                         "reference_sequence": sequence, "alternate_sequence": sequence[:FLANK] + alleles[1] + sequence[FLANK + 1:]})
    return eligible, dict(rejected)


def select_examples(rows, limit):
    groups = defaultdict(list)
    for row in rows:
        groups[row["consequence_annotation"]].append(row)
    queues = [deque(sorted(groups[key], key=lambda r: fingerprint({"seed": 42, "variant": r["variant_id"], "gene": r["gene"]})))
              for key in sorted(groups)]
    chosen = []
    while len(chosen) < limit and any(queues):
        for queue in queues:
            if queue and len(chosen) < limit:
                chosen.append(queue.popleft())
    return sorted(chosen, key=lambda r: (r["position_1based"], r["variant_id"]))


def assign_splits(rows):
    blocks = sorted({r["block_id"] for r in rows}, key=lambda b: fingerprint({"seed": 42, "block": b}))
    if len(blocks) < 3:
        raise ValueError("At least three genomic blocks are required for separated preparation splits.")
    holdout = max(1, len(blocks) // 5)
    groups = {block: "test" if i < holdout else "validation" if i < 2 * holdout else "train" for i, block in enumerate(blocks)}
    return [{**row, "split": groups[row["block_id"]]} for row in rows]


def fasta(contig, sequence):
    return ">" + contig + "\n" + "\n".join(sequence[i:i + 80] for i in range(0, len(sequence), 80)) + "\n"


def build_dataset(client, output, per_gene=500):
    output = Path(output)
    if output.exists():
        raise ValueError("Choose a new output directory; existing datasets are never overwritten.")
    release = client.get("/info/data?content-type=application%2Fjson")
    all_rows, genes, generated, anchors = [], [], {}, []
    for gene in GENES:
        lookup = client.get(f"/lookup/symbol/homo_sapiens/{gene}?content-type=application%2Fjson")
        if lookup.get("assembly_name") != "GRCh38" or lookup.get("display_name") != gene or lookup.get("object_type") != "Gene":
            raise ValueError("The public gene annotation is not the requested GRCh38 gene.")
        start, end, contig = lookup["start"] - FLANK, lookup["end"] + FLANK, lookup["seq_region_name"]
        reference = client.get(f"/sequence/region/homo_sapiens/{contig}:{start}..{end}:1?content-type=application%2Fjson")
        sequence = reference.get("seq", "").upper()
        if (reference.get("molecule") != "dna" or f"GRCh38:{contig}:{start}:{end}:1" not in reference.get("id", "")
            or len(sequence) != end - start + 1 or set(sequence) - set("ACGTN")):
            raise ValueError("Reference assembly, forward orientation, or sequence length verification failed.")
        variants = []
        # Region chunks avoid oversized overlap responses and have a strict per-request cap.
        for lower in range(lookup["start"], lookup["end"] + 1, 16000):
            upper = min(lookup["end"], lower + 15999)
            variants.extend(client.get(f"/overlap/region/homo_sapiens/{contig}:{lower}-{upper}?feature=variation&content-type=application%2Fjson"))
        candidates, rejected = eligible_variants(variants, gene, lookup, sequence, start)
        expected_anchor = "rs8176058" if gene == "KEL" else "rs1058396"
        for variant in variants:
            if variant.get("id") != expected_anchor:
                continue
            position = variant["start"]
            offset = position - start
            if variant.get("assembly_name") != "GRCh38" or variant.get("strand") != 1 or sequence[offset] != variant["alleles"][0]:
                raise ValueError("Anchor SNP reference verification failed.")
            anchors.append({"gene": gene, "variant_id": expected_anchor, "contig": contig,
                            "position_1based": position, "reference_allele": sequence[offset], "reported_alleles": variant["alleles"],
                            "evidence": "public_reference_unverified", "genome_build": "GRCh38", "donor_genotype": None,
                            "note": "This source record is multiallelic when more than two alleles are reported. No donor genotype or haplotype is inferred; the main dataset retains biallelic sites only."})
        selected = assign_splits(select_examples(candidates, per_gene))
        if len(selected) < min(100, per_gene):
            raise ValueError("Insufficient verified public SNV examples; no records will be invented.")
        generated[f"{gene}/reference.fasta"] = fasta(contig, sequence)
        generated[f"{gene}/gene.json"] = json.dumps({**lookup, "reference_window_start_1based": start, "reference_window_end_1based": end,
                                                     "reference_sequence_id": reference["id"], "evidence": "public_reference_unverified"}, indent=2) + "\n"
        genes.append({"gene": gene, "ensembl_gene_id": lookup["id"], "contig": contig, "gene_start": lookup["start"], "gene_end": lookup["end"],
                      "gene_strand": lookup["strand"], "reference_window_start_1based": start, "reference_bases": len(sequence),
                      "overlap_records_received": len(variants), "eligible_snv_count": len(candidates), "selected_count": len(selected),
                      "excluded_counts": rejected, "consequence_counts": dict(Counter(r["consequence_annotation"] for r in selected))})
        vcf = ["##fileformat=VCFv4.2", "##reference=GRCh38", "##source=Ensembl-public-reference-no-donor-genotypes",
               "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO"]
        vcf.extend(f"{r['contig']}\t{r['position_1based']}\t{r['variant_id']}\t{r['ref']}\t{r['alt']}\t.\t.\t." for r in selected)
        generated[f"{gene}/variants.vcf"] = "\n".join(vcf) + "\n"
        all_rows.extend(selected)
    generated["anchor_markers.json"] = json.dumps(anchors, indent=2) + "\n"
    pairs = []
    examples = []
    for row in all_rows:
        pairs.append({**row, "genome_build": "GRCh38", "evidence": "public_reference_unverified", "clinical_label": None,
                      "donor_genotype": None, "evo2_score": None, "score_status": "not_run",
                      "reference_sha256": text_hash(row["reference_sequence"]), "alternate_sha256": text_hash(row["alternate_sequence"])})
    generated["sequence_pairs.jsonl"] = "".join(json.dumps(row, sort_keys=True) + "\n" for row in pairs)
    columns = ["gene", "variant_id", "contig", "position_1based", "ref", "alt", "consequence_annotation", "source_database", "block_id", "split"]
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(pairs)
    generated["variants.csv"] = buffer.getvalue()
    for gene in GENES:
        for row in [r for r in pairs if r["gene"] == gene][:3]:
            request = {"mode": "paired_fasta", "sample_id": "PUBLIC-REFERENCE-NO-DONOR", "study_id": "Ensembl-public-reference",
                       "gene": gene, "genome_build": "GRCh38", "evidence": "public_reference_unverified",
                       "reference_label": f"Ensembl GRCh38 {row['contig']}:{row['position_1based'] - FLANK}-{row['position_1based'] + FLANK}; {row['variant_id']}",
                       "contig": row["contig"], "reference_start_1based": row["position_1based"] - FLANK,
                       "reference_fasta": fasta(row["contig"], row["reference_sequence"]),
                       "alternate_fasta": fasta("ALT", row["alternate_sequence"])}
            PairedFastaRequest(**request)
            examples.append({"id": row["variant_id"], "gene": gene, "request": request})
    generated["examples.json"] = json.dumps(examples, indent=2) + "\n"
    catalog = {"schema_version": "hemoforge-evo2-public-data-v1", "created_at": datetime.now(timezone.utc).isoformat(),
               "provider": "Ensembl REST (public, no API key)", "release_info": release, "genome_build": "GRCh38",
               "evidence": "public_reference_unverified", "gene_count": len(GENES), "sequence_pair_count": len(pairs),
               "window_bases": 2 * FLANK + 1, "selection_seed": 42, "selection": "round-robin consequence annotation, deterministic hash order",
               "split_method": "gene-specific 4096-base genomic blocks; complete windows stay within blocks; no base overlaps across splits",
               "split_counts": dict(Counter(r["split"] for r in pairs)), "genes": genes,
               "model_inference_run": False, "model_scores_available": False, "donor_profiles_available": False,
               "clinical_labels_available": False, "free_public_data_only": True,
               "sources": list(client.sources.values()),
               "files": [{"path": name, "sha256": text_hash(content), "bytes": len(content.encode())} for name, content in generated.items()],
               "limitations": ["Public reference/variant records, not donor sequences or verified antigen phenotypes.",
                               "Consequence annotations are source metadata, not clinical labels or Evo 2 predictions.",
                               "Alternate windows are derived in silico from reported alleles; no donor haplotype is reconstructed.",
                               "Each retained variant has a reference allele checked against the downloaded forward GRCh38 window.",
                               "Preparation splits support software development; this is not a clinically validated benchmark."]}
    output.mkdir(parents=True)
    for name, content in generated.items():
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8", newline="\n")
    (output / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    return catalog


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare public KEL/SLC14A1 sequence data. No model or paid API is used.")
    parser.add_argument("--output", default="public/datasets/evo2")
    parser.add_argument("--cache", default=".cache/evo2-public")
    parser.add_argument("--per-gene", type=int, default=500, choices=range(100, 1001), metavar="100..1000")
    parser.add_argument("--download-public-data", action="store_true")
    args = parser.parse_args()
    summary = build_dataset(PublicDataClient(args.cache, args.download_public_data), args.output, args.per_gene)
    print(json.dumps({"sequence_pairs": summary["sequence_pair_count"], "genes": summary["gene_count"],
                      "splits": summary["split_counts"], "inference_run": False, "output": args.output}, indent=2))
