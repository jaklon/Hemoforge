import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.api import app
from backend.db import connect, use_temporary_schema
from backend.evo2_dataset import DATASET_ROOT, DatasetPreparationRequest, PublicDataset, get_public_dataset, row_id
from backend.evo2_service import load_preparation, validate_bundle
from backend.evo2_worker import run_local


class DatasetIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = PublicDataset(DATASET_ROOT)

    def setUp(self):
        use_temporary_schema(self)
        self.directory = tempfile.TemporaryDirectory()
        self.source = patch("backend.evo2_routes.get_public_dataset", return_value=self.dataset)
        self.network = patch("socket.create_connection", side_effect=AssertionError("No network or inference allowed"))
        for context in (self.source, self.network):
            context.start()
            self.addCleanup(context.stop)
        self.addCleanup(self.directory.cleanup)
        self.client = TestClient(app)

    def test_catalog_all_pages_filters_search_and_sequence_preview(self):
        summary = self.client.get("/api/v1/evo2/dataset").json()
        self.assertEqual(summary["sequence_pair_count"], 1000)
        self.assertEqual(summary["integrity_status"], "verified_local_snapshot")
        self.assertFalse(summary["inference_enabled"])
        ids = set()
        for offset in range(0, 1000, 100):
            response = self.client.get("/api/v1/evo2/dataset/variants", params={"offset": offset, "limit": 100})
            self.assertEqual(response.status_code, 200)
            page = response.json()
            self.assertEqual(page["total"], 1000)
            self.assertNotIn("reference_sequence", page["items"][0])
            ids.update(row["id"] for row in page["items"])
        self.assertEqual(len(ids), 1000)
        for gene in ("KEL", "SLC14A1"):
            self.assertEqual(self.client.get("/api/v1/evo2/dataset/variants", params={"gene": gene}).json()["total"], 500)
            for split in ("train", "validation", "test"):
                result = self.client.get("/api/v1/evo2/dataset/variants", params={"gene": gene, "split": split}).json()
                self.assertTrue(all(row["gene"] == gene and row["split"] == split for row in result["items"]))
        row = self.dataset.rows[0]
        result = self.client.get("/api/v1/evo2/dataset/variants", params={"q": row["variant_id"]}).json()
        self.assertEqual(result["items"][0]["id"], row_id(row))
        detail = self.client.get("/api/v1/evo2/dataset/variants/" + row_id(row)).json()
        self.assertEqual(detail["reference_sequence"], row["reference_sequence"])
        self.assertIsNone(detail["evo2_score"])
        self.assertIsNone(detail["clinical_label"])
        self.assertIsNone(detail["donor_genotype"])
        self.assertEqual(self.client.get("/api/v1/evo2/dataset/variants", params={"q": "NO-SUCH-VARIANT"}).json()["items"], [])

    def test_multi_gene_batch_uses_server_sequences_persists_exports_and_stays_locked(self):
        # Include both genes and all splits in a single bounded batch.
        rows = [next(row for row in self.dataset.rows if row["gene"] == gene and row["split"] == split)
                for gene in ("KEL", "SLC14A1") for split in ("train", "validation", "test")]
        request = {"variant_ids": [row_id(row) for row in rows]}
        first = self.client.post("/api/v1/evo2/dataset/prepare", json=request)
        self.assertEqual(first.status_code, 200, first.text)
        bundle = validate_bundle(first.json())
        self.assertEqual(load_preparation(bundle.preparation_id), bundle)
        self.assertIsNone(bundle.manifest.reference_window_start_1based)
        self.assertEqual(bundle.manifest.source_hashes["dataset_sequence_pairs_sha256"], self.dataset.pairs_sha256)
        for row, task in zip(rows, bundle.manifest.tasks):
            self.assertEqual(task.reference_sequence, row["reference_sequence"])
            self.assertEqual(task.alternate_sequence, row["alternate_sequence"])
            self.assertEqual(task.position_1based, row["position_1based"])
            self.assertEqual(task.variant_id, row["variant_id"])
            self.assertTrue(task.study_id.endswith("/" + row["split"]))
            self.assertEqual(task.sample_id, "PUBLIC-REFERENCE-NO-DONOR")
            self.assertIsNone(task.genotype)
            self.assertIsNone(task.delta_log_likelihood)
        second = self.client.post("/api/v1/evo2/dataset/prepare", json=request).json()
        self.assertEqual(second["manifest_fingerprint"], bundle.manifest_fingerprint)
        export = self.client.get(f"/api/v1/evo2/preparations/{bundle.preparation_id}/export")
        self.assertEqual(export.status_code, 200)
        self.assertEqual(export.headers["cache-control"], "no-store")
        self.assertEqual(json.loads(export.content), bundle.model_dump())
        self.assertEqual(run_local(bundle, None, None)["status"], "disabled_budget_lock")
        self.assertEqual(self.client.post("/api/v1/evo2/score", json={"force": True}).status_code, 409)

    def test_invalid_selection_is_atomic_and_cannot_accept_sequences_scores_or_providers(self):
        id = row_id(self.dataset.rows[0])
        cases = [({"variant_ids": []}, 422), ({"variant_ids": [id] * 2}, 422),
                 ({"variant_ids": [row_id(row) for row in self.dataset.rows[:21]]}, 422),
                 ({"variant_ids": [id, "KEL:rs0:1:A:G"]}, 404),
                 ({"variant_ids": ["../../private"]}, 422),
                 ({"variant_ids": [id], "inference_enabled": True}, 422),
                 ({"variant_ids": [id], "provider_url": "https://paid.invalid"}, 422),
                 ({"variant_ids": [id], "reference_sequence": "G" * 257}, 422),
                 ({"variant_ids": [id], "evo2_score": -2}, 422)]
        for payload, status in cases:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/api/v1/evo2/dataset/prepare", json=payload).status_code, status)
        with connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM evo2_preparations").fetchone()[0], 0)
        for query in [{"limit": 101}, {"offset": -1}, {"gene": "OTHER"}, {"split": "other"}]:
            self.assertEqual(self.client.get("/api/v1/evo2/dataset/variants", params=query).status_code, 422)
        self.assertEqual(self.client.get("/api/v1/evo2/dataset/variants/unknown").status_code, 404)

    def test_missing_or_modified_dataset_fails_closed_without_download(self):
        with patch("backend.evo2_routes.get_public_dataset", side_effect=ValueError("bad snapshot")):
            self.assertEqual(self.client.get("/api/v1/evo2/dataset").status_code, 503)
            self.assertEqual(self.client.post("/api/v1/evo2/dataset/prepare", json={"variant_ids": [row_id(self.dataset.rows[0])]}).status_code, 503)
        root = Path(self.directory.name) / "snapshot"
        shutil.copytree(DATASET_ROOT, root)
        (root / "sequence_pairs.jsonl").write_text("tampered")
        with self.assertRaises(ValueError):
            PublicDataset(root)
        get_public_dataset.cache_clear()
        with patch("backend.evo2_dataset.DATASET_ROOT", Path(self.directory.name) / "missing"), self.assertRaises(OSError):
            get_public_dataset()
        get_public_dataset.cache_clear()

    def test_maximum_twenty_variant_batch_is_valid(self):
        selection = DatasetPreparationRequest(variant_ids=[row_id(row) for row in self.dataset.rows[:20]])
        bundle = self.dataset.prepare(selection)
        self.assertEqual(len(validate_bundle(bundle.model_dump()).manifest.tasks), 20)


if __name__ == "__main__":
    unittest.main()
