"""Offline integrity and leakage checks for the bundled public reference dataset."""

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from backend.prepare_public_evo2_data import BLOCK, FLANK, GENES


def verify_dataset(directory):
    root = Path(directory).resolve()
    catalog = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
    if catalog["schema_version"] != "hemoforge-evo2-public-data-v1" or catalog["genome_build"] != "GRCh38":
        raise ValueError("Unexpected dataset schema or assembly.")
    for entry in catalog["files"]:
        path = (root / entry["path"]).resolve()
        if not path.is_relative_to(root):
            raise ValueError("Dataset path traversal is not allowed.")
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != entry["sha256"] or len(content) != entry["bytes"]:
            raise ValueError("Dataset file integrity mismatch: " + entry["path"])
    genes = {row["gene"]: row for row in catalog["genes"]}
    references = {}
    for gene in GENES:
        text = (root / gene / "reference.fasta").read_text(encoding="utf-8").splitlines()
        if text[0] != ">" + genes[gene]["contig"]:
            raise ValueError("Reference FASTA contig mismatch.")
        references[gene] = "".join(text[1:])
        if len(references[gene]) != genes[gene]["reference_bases"] or set(references[gene]) - set("ACGTN"):
            raise ValueError("Reference sequence length/alphabet mismatch.")
    rows = [json.loads(line) for line in (root / "sequence_pairs.jsonl").read_text(encoding="utf-8").splitlines()]
    if len(rows) != catalog["sequence_pair_count"] or not rows:
        raise ValueError("Sequence pair count mismatch.")
    ids, blocks = set(), {}
    for row in rows:
        gene = row["gene"]
        if gene not in genes or row["contig"] != genes[gene]["contig"]:
            raise ValueError("Unknown gene/contig association.")
        ref, alt = row["reference_sequence"], row["alternate_sequence"]
        position = row["position_1based"]
        block = (position - 1) // BLOCK
        key = (gene, position, row["ref"], row["alt"])
        if key in ids:
            raise ValueError("Duplicated allelic site.")
        ids.add(key)
        if (len(ref) != 2 * FLANK + 1 or len(alt) != len(ref) or set(ref + alt) - set("ACGT")
            or [i for i, (a, b) in enumerate(zip(ref, alt)) if a != b] != [FLANK]
            or ref[FLANK] != row["ref"] or alt[FLANK] != row["alt"]
            or hashlib.sha256(ref.encode()).hexdigest() != row["reference_sha256"]
            or hashlib.sha256(alt.encode()).hexdigest() != row["alternate_sha256"]):
            raise ValueError("Sequence pair/allele integrity mismatch.")
        offset = position - genes[gene]["reference_window_start_1based"]
        if ref != references[gene][offset - FLANK:offset + FLANK + 1]:
            raise ValueError("Sequence pair does not match its local GRCh38 reference.")
        if ((position - FLANK - 1) // BLOCK != block or (position + FLANK - 1) // BLOCK != block
            or row["block_id"] != f"{gene}:{block}" or row["split"] not in {"train", "validation", "test"}):
            raise ValueError("Sequence window crosses its genomic split block.")
        if row["block_id"] in blocks and blocks[row["block_id"]] != row["split"]:
            raise ValueError("Genomic block appears in multiple splits.")
        blocks[row["block_id"]] = row["split"]
        if (row["clinical_label"] is not None or row["donor_genotype"] is not None or row["evo2_score"] is not None
            or row["score_status"] != "not_run" or row["evidence"] != "public_reference_unverified"):
            raise ValueError("Public reference data must not impersonate donor, clinical, or model evidence.")
    with (root / "variants.csv").open(encoding="utf-8", newline="") as file:
        csv_rows = list(csv.DictReader(file))
    if {(r["gene"], int(r["position_1based"]), r["ref"], r["alt"]) for r in csv_rows} != ids:
        raise ValueError("Variant CSV and sequence pairs disagree.")
    splits = dict(Counter(r["split"] for r in rows))
    if splits != catalog["split_counts"] or set(splits) != {"train", "validation", "test"}:
        raise ValueError("Split counts disagree with the dataset catalog.")
    return {"status": "passed", "sequence_pairs": len(rows), "genes": len(genes), "splits": splits,
            "no_cross_split_sequence_overlap": True, "model_inference_run": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify the public sequence dataset locally, without network or inference.")
    parser.add_argument("directory", nargs="?", default="public/datasets/evo2")
    args = parser.parse_args()
    print(json.dumps(verify_dataset(args.directory), indent=2))
