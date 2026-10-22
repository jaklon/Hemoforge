"""Browse and prepare the shipped, verified public snapshot. No network or model client."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator

from backend.agent_store import fingerprint
from backend.evo2_models import PairedFastaRequest, PreparationManifest
from backend.evo2_service import LIMITS, make_task, persist_preparation
from backend.models import InputModel
from backend.prepare_public_evo2_data import FLANK
from backend.verify_evo2_data import verify_dataset

DATASET_ROOT = Path(__file__).resolve().parents[1] / "public" / "datasets" / "evo2"
DATASET_ID = "hemoforge-evo2-public-data-v1"


class DatasetPreparationRequest(InputModel):
    variant_ids: list[str] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def valid_selection(self):
        import re
        if len(set(self.variant_ids)) != len(self.variant_ids) or any(
            re.fullmatch(r"(?:KEL|SLC14A1):rs[0-9]+:[0-9]+:[ACGT]:[ACGT]", value) is None for value in self.variant_ids
        ):
            raise ValueError("Select one to twenty unique public variant IDs from the dataset catalogue.")
        return self


def row_id(row):
    return f"{row['gene']}:{row['variant_id']}:{row['position_1based']}:{row['ref']}:{row['alt']}"


class PublicDataset:
    def __init__(self, root):
        # Fail closed if the bundled snapshot is missing/corrupt. Never fetch replacements.
        self.root = Path(root)
        verify_dataset(self.root)
        catalog_bytes = (self.root / "catalog.json").read_bytes()
        pairs_bytes = (self.root / "sequence_pairs.jsonl").read_bytes()
        self.catalog = json.loads(catalog_bytes)
        self.catalog_sha256 = hashlib.sha256(catalog_bytes).hexdigest()
        self.pairs_sha256 = hashlib.sha256(pairs_bytes).hexdigest()
        self.rows = [json.loads(line) for line in pairs_bytes.splitlines()]
        self.by_id = {row_id(row): row for row in self.rows}
        if len(self.by_id) != len(self.rows):
            raise ValueError("Duplicate public dataset identities.")

    def summary(self):
        return {"dataset_id": DATASET_ID, "provider": self.catalog["provider"],
                "release_info": self.catalog["release_info"], "created_at": self.catalog["created_at"],
                "genome_build": self.catalog["genome_build"], "evidence": self.catalog["evidence"],
                "sequence_pair_count": len(self.rows), "window_bases": self.catalog["window_bases"],
                "genes": [{"gene": row["gene"], "selected_count": row["selected_count"]} for row in self.catalog["genes"]],
                "split_counts": self.catalog["split_counts"], "integrity_status": "verified_local_snapshot",
                "catalog_sha256": self.catalog_sha256, "sequence_pairs_sha256": self.pairs_sha256,
                "max_batch_size": 20, "inference_enabled": False, "limitations": self.catalog["limitations"]}

    @staticmethod
    def metadata(row):
        return {"id": row_id(row), **{key: value for key, value in row.items()
                                     if key not in {"reference_sequence", "alternate_sequence"}}}

    def variants(self, gene=None, split=None, q="", offset=0, limit=20):
        query = q.strip().lower()
        rows = [row for row in self.rows if (gene is None or row["gene"] == gene)
                and (split is None or row["split"] == split)
                and (not query or query in " ".join(str(row[key]) for key in
                     ("variant_id", "gene", "contig", "position_1based", "consequence_annotation")).lower())]
        return {"dataset_id": DATASET_ID, "total": len(rows), "offset": offset, "limit": limit,
                "items": [self.metadata(row) for row in rows[offset:offset + limit]]}

    def variant(self, id):
        row = self.by_id[id]
        return {"id": id, **row, "reference_window_start_1based": row["position_1based"] - FLANK}

    def prepare(self, selection):
        # Resolve every ID before any persistence. Clients cannot replace sequences or scores.
        rows = [self.by_id[id] for id in selection.variant_ids]
        tasks = []
        for row in rows:
            request = PairedFastaRequest(mode="paired_fasta", sample_id="PUBLIC-REFERENCE-NO-DONOR",
                study_id="Ensembl-public-reference/" + row["split"], gene=row["gene"], genome_build="GRCh38",
                evidence="public_reference_unverified", reference_label="Ensembl GRCh38 public reference",
                contig=row["contig"], reference_start_1based=row["position_1based"] - FLANK,
                reference_fasta=">" + row["contig"] + "\n" + row["reference_sequence"],
                alternate_fasta=">ALT\n" + row["alternate_sequence"])
            tasks.append(make_task(request, row["reference_sequence"], row["alternate_sequence"], FLANK,
                                   row["position_1based"], row["variant_id"]))
        manifest = PreparationManifest(
            input_fingerprint=fingerprint({"dataset_id": DATASET_ID, "variant_ids": selection.variant_ids,
                                           "sequence_pairs_sha256": self.pairs_sha256}),
            reference_label=f"Ensembl GRCh38; releases {self.catalog['release_info']['releases']}; {DATASET_ID}",
            reference_window_start_1based=None,
            source_hashes={"dataset_catalog_sha256": self.catalog_sha256, "dataset_sequence_pairs_sha256": self.pairs_sha256,
                           "selected_public_records_sha256": fingerprint(rows)}, tasks=tasks,
            warnings=LIMITS + self.catalog["limitations"] + [
                "Tasks are independent public reference examples, not donor samples. study_id records the development split.",
                "Each task has its own reference start: position_1based minus variant_index_0based. No common reference window or phasing is implied.",
            ])
        return persist_preparation(manifest)


@lru_cache(maxsize=1)
def get_public_dataset():
    # A process holds one immutable verified snapshot; restart the API after replacing dataset files.
    return PublicDataset(DATASET_ROOT)
