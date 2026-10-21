import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.agent_config import AgentSettings
from backend.agent_models import MarkerInput
from backend.agent_store import fingerprint
from backend.api import app
from backend.evo2_models import PairedFastaRequest, VcfWindowRequest
from backend.evo2_service import load_preparation, marker_readiness, prepare, validate_bundle
from backend.evo2_worker import run_local, score_with_model
from backend.prepare_public_evo2_data import PublicDataClient, assign_splits, eligible_variants, select_examples
from backend.verify_evo2_data import verify_dataset


def pair_request():
    return PairedFastaRequest(mode="paired_fasta", sample_id="SYNTHETIC-ONLY", study_id="software-fixture",
        gene="KEL", genome_build="synthetic_fixture", evidence="software_test_only", reference_label="Synthetic sequence, not GRCh38",
        contig="SYNTHETIC", reference_fasta=">SYNTHETIC\n" + "A" * 33, alternate_fasta=">ALT\n" + "A" * 16 + "G" + "A" * 16)


def vcf_request():
    base = pair_request().model_dump(exclude={"mode", "alternate_fasta", "reference_start_1based"})
    return VcfWindowRequest(**base, mode="vcf_window", reference_start_1based=1000, flank_bp=16,
        vcf_text="##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\nSYNTHETIC\t1016\trs123\tA\tG\t.\t.\t.\n")


class Evo2PreparationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = str(Path(self.directory.name) / "audit.sqlite3")

    def tearDown(self):
        self.directory.cleanup()

    def test_marker_readiness_does_not_reconstruct_sequences(self):
        source = MarkerInput(name="test.csv", evidence="software_test_only", rows=[
            {"sample_id": "A", "kel": "A|G", "slc": "G/G"}, {"sample_id": "B", "kel": "./.", "slc": "G/G"}])
        with patch("socket.create_connection", side_effect=AssertionError("network must not run")):
            result = marker_readiness(source)
        self.assertEqual(result["profile_count"], 2)
        self.assertEqual(result["resolved_two_marker_profiles"], 1)
        self.assertEqual(result["sequence_records_available"], 0)
        self.assertIsNone(result["delta_log_likelihood"])
        self.assertFalse(result["policy"]["external_providers_enabled"])

    def test_preparation_is_local_reproducible_exportable_and_never_scored(self):
        with patch("socket.create_connection", side_effect=AssertionError("network must not run")):
            first = prepare(pair_request(), self.database)
            second = prepare(pair_request(), self.database)
        self.assertNotEqual(first.preparation_id, second.preparation_id)
        self.assertEqual(first.manifest_fingerprint, second.manifest_fingerprint)
        self.assertEqual(validate_bundle(first.model_dump()), first)
        self.assertEqual(load_preparation(first.preparation_id, self.database), first)
        task = first.manifest.tasks[0]
        self.assertEqual(task.variant_index_0based, 16)
        self.assertIsNone(task.position_1based)
        self.assertIsNone(task.delta_log_likelihood)
        self.assertEqual(first.manifest.laboratory_status, "pending_lab_verification")

    def test_ambiguous_wrong_contig_multirecord_and_non_snv_pairs_are_rejected(self):
        mutations = [{"reference_fasta": ">OTHER\n" + "A" * 33}, {"alternate_fasta": ">ALT\n" + "N" * 33},
                     {"alternate_fasta": ">ALT\n" + "A" * 33}, {"alternate_fasta": ">ALT\n" + "A" * 34},
                     {"reference_fasta": ">SYNTHETIC\n" + "A" * 33 + "\n>OTHER\nAAAA"}]
        for change in mutations:
            data = pair_request().model_dump()
            data.update(change)
            with self.subTest(change=list(change)), self.assertRaises(ValueError):
                prepare(PairedFastaRequest(**data), self.database)

    def test_vcf_coordinates_ref_alleles_and_sample_genotypes_are_checked(self):
        request = vcf_request()
        task = prepare(request, self.database).manifest.tasks[0]
        self.assertEqual(task.position_1based, 1016)
        for old, new in [("1016", "1015"), ("\tA\tG\t", "\tC\tG\t"), ("\tA\tG\t", "\tA\tG,T\t"),
                         ("\tA\tG\t", "\tAA\tG\t"), ("\t.\t.\t.\n", "\t.\tLowQual\t.\n")]:
            data = request.model_dump()
            data["vcf_text"] = data["vcf_text"].replace(old, new)
            with self.subTest(change=new), self.assertRaises(ValueError):
                prepare(VcfWindowRequest(**data), self.database)
        data = request.model_dump()
        data["vcf_text"] = data["vcf_text"].replace("\tINFO\n", "\tINFO\tFORMAT\tSYNTHETIC-ONLY\n").replace("\t.\t.\t.\n", "\t.\t.\t.\tGT\t0/1\n")
        self.assertEqual(prepare(VcfWindowRequest(**data), self.database).manifest.tasks[0].genotype, "0/1")
        for genotype in ["./.", "0/0", "0/2"]:
            with self.subTest(genotype=genotype), self.assertRaises(ValueError):
                prepare(VcfWindowRequest(**{**data, "vcf_text": data["vcf_text"].replace("0/1", genotype)}), self.database)

    def test_manifest_tampering_and_fake_scores_fail_validation(self):
        bundle = prepare(pair_request(), self.database).model_dump()
        for change in ["sequence", "score", "policy", "task_hash"]:
            data = copy.deepcopy(bundle)
            if change == "sequence": data["manifest"]["tasks"][0]["alternate_sequence"] = "G" * 33
            if change == "score": data["manifest"]["tasks"][0]["delta_log_likelihood"] = -20
            if change == "policy": data["manifest"]["policy"]["inference_enabled"] = True
            if change == "task_hash": data["manifest"]["tasks"][0]["task_id"] = "a" * 64
            # Even rehashing an edited manifest does not bypass semantic or policy checks.
            data["manifest_fingerprint"] = fingerprint(data["manifest"])
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_bundle(data)

    def test_worker_budget_lock_precedes_all_heavy_imports(self):
        bundle = prepare(pair_request(), self.database)
        with patch.dict(os.environ, {"EVO2_ENABLE_LOCAL_INFERENCE": "0"}), patch("builtins.__import__", wraps=__import__) as imports:
            result = run_local(bundle, None, None, execute=True)
        self.assertEqual(result["status"], "disabled_budget_lock")
        self.assertNotIn("torch", [call.args[0] for call in imports.call_args_list])
        self.assertNotIn("evo2", [call.args[0] for call in imports.call_args_list])
        with patch.dict(os.environ, {"EVO2_ENABLE_LOCAL_INFERENCE": "1"}), self.assertRaises(ValueError):
            run_local(bundle, None, None, execute=True)

    def test_scorer_contract_uses_fixed_options_and_labels_test_results_unverified(self):
        bundle = prepare(pair_request(), self.database)
        class SyntheticScorer:
            def score_sequences(inner, sequences, **options):
                self.assertEqual(options["reduce_method"], "sum")
                self.assertTrue(options["prepend_bos"])
                self.assertEqual(len(sequences), 2)
                return [-100.0, -105.0]
        result = score_with_model(bundle, SyntheticScorer(), "a" * 64, "synthetic-test-scorer")
        self.assertEqual(result["scores"][0]["delta_log_likelihood"], -5)
        self.assertEqual(result["evidence_quality"], "unverified_exploratory")
        self.assertEqual(result["laboratory_status"], "pending_lab_verification")

    def test_api_policy_validation_local_export_and_score_lock(self):
        settings = AgentSettings(database_path=self.database)
        with patch("backend.evo2_routes.get_settings", return_value=settings), patch("socket.create_connection", side_effect=AssertionError("no external requests")):
            client = TestClient(app)
            self.assertFalse(client.get("/api/v1/evo2/status").json()["policy"]["inference_enabled"])
            response = client.post("/api/v1/evo2/prepare", json=pair_request().model_dump())
            self.assertEqual(response.status_code, 200, response.text)
            id = response.json()["preparation_id"]
            export = client.get(f"/api/v1/evo2/preparations/{id}/export")
            self.assertEqual(export.status_code, 200)
            self.assertIn("attachment", export.headers["content-disposition"])
            self.assertEqual(client.post("/api/v1/evo2/score", json={"force": True, "api_key": "not-used"}).status_code, 409)
            data = pair_request().model_dump()
            data["provider_url"] = "https://paid.invalid"
            self.assertEqual(client.post("/api/v1/evo2/prepare", json=data).status_code, 422)


class PublicSelectionTests(unittest.TestCase):
    def test_public_download_requires_explicit_opt_in(self):
        with tempfile.TemporaryDirectory() as directory, patch("urllib.request.urlopen") as network:
            with self.assertRaises(ValueError):
                PublicDataClient(directory).get("/info/data")
            network.assert_not_called()

    def test_public_selection_rejects_wrong_ref_and_drops_cross_block_windows(self):
        lookup = {"seq_region_name": "7", "start": 1, "end": 10000}
        records = [{"id": "rs1", "assembly_name": "GRCh38", "seq_region_name": "7", "strand": 1,
                    "start": 500, "end": 500, "alleles": ["A", "G"], "consequence_type": "intron_variant"},
                   {"id": "rs2", "assembly_name": "GRCh38", "seq_region_name": "7", "strand": 1,
                    "start": 4096, "end": 4096, "alleles": ["A", "G"]},
                   {"id": "rs3", "assembly_name": "GRCh38", "seq_region_name": "7", "strand": 1,
                    "start": 600, "end": 600, "alleles": ["C", "G"]}]
        rows, rejected = eligible_variants(records, "KEL", lookup, "A" * 10000, 1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rejected["split_boundary_buffer"], 1)
        self.assertEqual(rejected["reference_allele_or_window_mismatch"], 1)

    def test_selection_and_genomic_splits_are_deterministic(self):
        rows = [{"gene": "KEL", "variant_id": "rs" + str(i), "position_1based": i * 1000,
                 "consequence_annotation": "intron_variant" if i % 2 else "missense_variant", "block_id": f"KEL:{i}"} for i in range(1, 21)]
        self.assertEqual(select_examples(rows, 12), select_examples(list(reversed(rows)), 12))
        result = assign_splits(rows)
        self.assertEqual({r["split"] for r in result}, {"train", "validation", "test"})
        self.assertEqual(len({r["block_id"] for r in result}), len(rows))


class BundledPublicDatasetTests(unittest.TestCase):
    def test_shipped_public_data_is_complete_consistent_and_has_no_model_scores(self):
        root = Path(__file__).resolve().parents[1] / "public" / "datasets" / "evo2"
        with patch("socket.create_connection", side_effect=AssertionError("verification must be offline")):
            result = verify_dataset(root)
        self.assertEqual(result["sequence_pairs"], 1000)
        self.assertTrue(result["no_cross_split_sequence_overlap"])
        self.assertFalse(result["model_inference_run"])
        anchors = json.loads((root / "anchor_markers.json").read_text())
        self.assertEqual({row["variant_id"] for row in anchors}, {"rs8176058", "rs1058396"})
        self.assertTrue(all(row["donor_genotype"] is None for row in anchors))

    def test_every_bundled_ui_example_prepares_locally_without_inference(self):
        root = Path(__file__).resolve().parents[1] / "public" / "datasets" / "evo2"
        examples = json.loads((root / "examples.json").read_text())
        with tempfile.TemporaryDirectory() as directory, patch("socket.create_connection", side_effect=AssertionError("no network")):
            for example in examples:
                bundle = prepare(PairedFastaRequest(**example["request"]), str(Path(directory) / "audit.sqlite3"))
                task = bundle.manifest.tasks[0]
                self.assertEqual(task.evidence, "public_reference_unverified")
                self.assertEqual(task.sequence_length, 257)
                self.assertIsNone(task.delta_log_likelihood)


if __name__ == "__main__":
    unittest.main()
