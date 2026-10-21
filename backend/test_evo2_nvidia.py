"""Synthetic provider tensors only. These tests never call NVIDIA or report biological results."""

import base64
import io
import json
import math
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
import numpy as np
from fastapi.testclient import TestClient

from backend.agent_config import AgentSettings
from backend.api import app
from backend.evo2_dataset import get_public_dataset, row_id
from backend.evo2_nvidia import (ENDPOINT, MAX_BYTES, SLOT, NvidiaScoreRequest, NvidiaSettings, TrialError,
    connect_store, decode_logits, forward, get_nvidia_settings, read_key, score_public_variant, trial_status)


def archive(sequence, *, layer="output_layer", shape=None, invalid=False):
    shape = shape or (len(sequence), 1, 512)
    logits = np.zeros(shape, dtype=np.float32)
    if invalid:
        logits.flat[0] = np.nan
    output = io.BytesIO()
    np.savez_compressed(output, **{layer: logits})
    return output.getvalue()


def provider_payload(sequence):
    return {"data": base64.b64encode(archive(sequence)).decode(), "elapsed_ms": 1}


class NvidiaTrialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = get_public_dataset()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = str(Path(self.directory.name) / "audit.sqlite3")
        self.key = "nvapi-SYNTHETIC_TEST_KEY_NEVER_REAL"
        key_file = Path(self.directory.name) / "key.txt"
        key_file.write_text(self.key)
        self.settings = NvidiaSettings(enabled=True, free_api_confirmed=True, key_file=str(key_file), logits_layer="output_layer")
        self.row = self.dataset.rows[0]
        self.request = NvidiaScoreRequest(variant_id=row_id(self.row))
        self.client = TestClient(app)
        self.headers = {"X-HemoForge-Action": "nvidia-trial", "Origin": "http://127.0.0.1:8443"}
        self.external = []
        original = httpx.Client

        def synthetic_provider(request):
            self.external.append(request)
            self.assertEqual(str(request.url), ENDPOINT)
            self.assertEqual(request.headers["authorization"], "Bearer " + self.key)
            body = json.loads(request.content)
            self.assertEqual(body["output_layers"], ["output_layer"])
            return httpx.Response(200, json=provider_payload(body["sequence"]))

        self.mock_client = patch("backend.evo2_nvidia.httpx.Client", side_effect=lambda **kwargs:
            original(transport=httpx.MockTransport(synthetic_provider), **kwargs))
        contexts = [patch("backend.evo2_routes.get_nvidia_settings", return_value=self.settings),
                    patch("backend.evo2_routes.get_settings", return_value=AgentSettings(database_path=self.database)),
                    patch("socket.create_connection", side_effect=AssertionError("No real network permitted")),
                    patch.dict(os.environ, {"EVO2_NVIDIA_API_KEY": ""})]
        for context in contexts:
            context.start()
            self.addCleanup(context.stop)

    def test_disabled_missing_key_and_status_never_contact_provider_or_leak_credentials(self):
        with self.mock_client:
            response = self.client.get("/api/v1/evo2/nvidia/status")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["availability"], "not_checked_with_provider")
            self.assertNotIn(self.key, response.text)
            self.assertNotIn(self.settings.key_file, response.text)
            for settings in [NvidiaSettings(), NvidiaSettings(enabled=True),
                             self.settings.model_copy(update={"key_file": "missing-key"})]:
                with patch("backend.evo2_routes.get_nvidia_settings", return_value=settings):
                    response = self.client.post("/api/v1/evo2/nvidia/score", json=self.request.model_dump(), headers=self.headers)
                    self.assertEqual(response.status_code, 409)
            self.assertEqual(self.external, [])

    def test_real_adapter_contract_with_synthetic_tensors_cache_and_export(self):
        with self.mock_client:
            first = self.client.post("/api/v1/evo2/nvidia/score", json=self.request.model_dump(), headers=self.headers)
            self.assertEqual(first.status_code, 200, first.text)
            result = first.json()
            self.assertFalse(result["cache_hit"])
            self.assertEqual(result["provider_model"], "arc/evo2-7b-forward")
            self.assertIsNone(result["checkpoint_sha256"])
            self.assertEqual(result["scoring"]["scored_positions"], 256)
            self.assertFalse(result["scoring"]["prepend_bos"])
            self.assertAlmostEqual(result["reference"]["log_likelihood"], -256 * math.log(512))
            self.assertEqual(result["delta_log_likelihood"], 0)  # Uniform synthetic logits, not model evidence.
            second = self.client.post("/api/v1/evo2/nvidia/score", json=self.request.model_dump(), headers=self.headers).json()
            self.assertTrue(second["cache_hit"])
            self.assertEqual(second["new_requests_reserved"], 0)
            self.assertEqual(len(self.external), 2)
            export = self.client.get(f"/api/v1/evo2/nvidia/results/{result['result_id']}/export")
            self.assertEqual(export.status_code, 200)
            self.assertEqual(export.json(), result)
            self.assertEqual(export.headers["cache-control"], "no-store")
            self.assertNotIn(self.key, export.text)
            self.assertNotIn("reference_sequence", export.text)
            self.assertEqual(self.client.post("/api/v1/evo2/score").status_code, 409)
            self.assertEqual(self.client.get("/api/v1/evo2/nvidia/status").json()["requests_used_today"], 2)
            with patch("backend.evo2_routes.get_nvidia_settings", return_value=NvidiaSettings(logits_layer="output_layer")):
                saved = self.client.get("/api/v1/evo2/nvidia/results/latest", params={"variant_id": self.request.variant_id})
                self.assertEqual(saved.status_code, 200)
                self.assertTrue(saved.json()["cache_hit"])
                self.assertEqual(saved.json()["delta_log_likelihood"], result["delta_log_likelihood"])
                missing = self.client.get("/api/v1/evo2/nvidia/results/latest", params={"variant_id": row_id(self.dataset.rows[1])})
                self.assertEqual(missing.status_code, 404)
            self.assertEqual(len(self.external), 2)

    def test_quota_reservations_survive_new_config_and_cached_results_do_not_consume_more(self):
        settings = self.settings.model_copy(update={"daily_request_limit": 2})
        with self.mock_client:
            score_public_variant(self.request, self.dataset, settings, self.database)
            score_public_variant(self.request, self.dataset, settings, self.database)
            other = NvidiaScoreRequest(variant_id=row_id(self.dataset.rows[1]))
            with self.assertRaises(TrialError) as blocked:
                score_public_variant(other, self.dataset, settings, self.database)
            self.assertEqual(blocked.exception.code, "daily_limit_reached")
            status = trial_status(NvidiaSettings(**settings.model_dump()), self.database)
            self.assertEqual(status["requests_remaining"], 0)
            self.assertEqual(len(self.external), 2)

    def test_payment_rate_limit_deprecation_contract_and_redirect_errors_do_not_retry_or_fallback(self):
        original = httpx.Client
        for status in [401, 402, 403, 404, 410, 422, 429, 302, 500]:
            calls = []
            def failure(request):
                calls.append(request)
                return httpx.Response(status, headers={"location": "https://paid.invalid/"}, text=self.key + self.row["reference_sequence"])
            with self.subTest(status=status), patch("backend.evo2_nvidia.httpx.Client", side_effect=lambda **kwargs:
                    original(transport=httpx.MockTransport(failure), **kwargs)), self.assertRaises(TrialError) as blocked:
                forward(self.row["reference_sequence"], self.key, "output_layer")
            self.assertEqual(len(calls), 1)
            self.assertNotIn(self.key, str(blocked.exception))
            self.assertNotIn(self.row["reference_sequence"], str(blocked.exception))

    def test_failed_first_forward_counts_reserved_pair_and_pauses_remaining_requests(self):
        with patch("backend.evo2_nvidia.forward", side_effect=TrialError("provider_payment_required", "Trial access unavailable")) as network:
            for _ in range(2):
                with self.assertRaises(TrialError):
                    score_public_variant(self.request, self.dataset, self.settings, self.database)
            self.assertEqual(network.call_count, 1)
        status = trial_status(self.settings, self.database)
        self.assertEqual(status["requests_used_today"], 2)
        self.assertFalse(status["ready"])
        self.assertEqual(status["status"], "provider_payment_required")

    def test_unknown_injected_private_inputs_cross_origin_and_busy_are_rejected_before_network(self):
        with self.mock_client:
            for data in [{"variant_id": "KEL:rs0:1:A:G"}, {"variant_id": "../../private"},
                         {**self.request.model_dump(), "sequence": "A" * 257},
                         {**self.request.model_dump(), "provider_url": "https://paid.invalid"},
                         {**self.request.model_dump(), "api_key": "not-accepted"},
                         {**self.request.model_dump(), "score": 123}]:
                response = self.client.post("/api/v1/evo2/nvidia/score", json=data, headers=self.headers)
                self.assertIn(response.status_code, {404, 422})
            for headers in [{}, {**self.headers, "Origin": "https://evil.invalid"}, {**self.headers, "Origin": "http://["}]:
                self.assertEqual(self.client.post("/api/v1/evo2/nvidia/score", json=self.request.model_dump(), headers=headers).status_code, 403)
            SLOT.acquire()
            try:
                self.assertEqual(self.client.post("/api/v1/evo2/nvidia/score", json=self.request.model_dump(), headers=self.headers).status_code, 409)
            finally:
                SLOT.release()
            self.assertEqual(self.external, [])

    def test_parser_accepts_explicit_layouts_and_scores_actual_next_base_over_full_vocabulary(self):
        sequence = "ACGT" * 9
        for layer in ("output_layer", "unembed"):
            for shape in ((len(sequence), 512), (1, len(sequence), 512), (len(sequence), 1, 512)):
                value = decode_logits(archive(sequence, layer=layer, shape=shape), "application/zip", sequence, layer)
                self.assertAlmostEqual(value["log_likelihood"], -(len(sequence) - 1) * math.log(512))
        logits = np.zeros((len(sequence), 512), dtype=np.float32)
        for index, base in enumerate(sequence[1:]):
            logits[index, ord(base)] = 2
        output = io.BytesIO()
        np.savez_compressed(output, output_layer=logits)
        result = decode_logits(output.getvalue(), "application/zip", sequence, "output_layer")
        self.assertAlmostEqual(result["log_likelihood"], (len(sequence) - 1) * (2 - math.log(511 + math.exp(2))))

    def test_parser_rejects_invalid_shapes_missing_layers_objects_nonfinite_and_oversize_outputs(self):
        sequence = self.row["reference_sequence"]
        invalid = [archive(sequence, shape=(256, 512)), archive(sequence, shape=(257, 4)),
                   archive(sequence, layer="embedding"), archive(sequence, invalid=True), b"not a ZIP"]
        object_output = io.BytesIO()
        np.savez(object_output, output_layer=np.array([{"unsafe": True}], dtype=object))
        invalid.append(object_output.getvalue())
        for raw in invalid:
            with self.subTest(bytes=len(raw)), self.assertRaises(TrialError):
                decode_logits(raw, "application/zip", sequence, "output_layer")
        with self.assertRaises(TrialError):
            decode_logits(json.dumps({"data": "!invalid!"}).encode(), "application/json", sequence, "output_layer")
        original = httpx.Client
        with patch("backend.evo2_nvidia.httpx.Client", side_effect=lambda **kwargs:
                original(transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b"x" * (MAX_BYTES + 1))), **kwargs)), self.assertRaises(TrialError):
            forward(sequence, self.key, "output_layer")

    def test_hosted_multiline_base64_float64_unembed_output_is_supported_strictly(self):
        sequence = self.row["reference_sequence"]
        logits = np.zeros((1, len(sequence), 512), dtype=np.float64)
        output = io.BytesIO()
        np.savez_compressed(output, **{"unembed.output": logits})
        encoded = base64.encodebytes(output.getvalue()).decode("ascii")
        self.assertIn("\n", encoded)
        raw = json.dumps({"data": encoded, "elapsed_ms": 1}).encode()
        score = decode_logits(raw, "application/json", sequence, "unembed")
        self.assertAlmostEqual(score["log_likelihood"], -256 * math.log(512))
        self.assertEqual(score["tensor_shape"], [1, 257, 512])
        self.assertEqual(NvidiaSettings().logits_layer, "unembed")
        # Do not broadly ignore invalid characters when accepting line-wrapped Base64.
        for extra in ["!", "\u200b", "\u00a0"]:
            with self.subTest(extra=ord(extra)), self.assertRaises(TrialError):
                decode_logits(json.dumps({"data": encoded + extra}).encode(), "application/json", sequence, "unembed")

    def test_configuration_is_opt_in_validated_and_never_includes_a_provider_url(self):
        config = Path(self.directory.name) / "config.json"
        env = {"EVO2_NVIDIA_CONFIG": str(config)}
        with patch.dict(os.environ, env):
            self.assertFalse(get_nvidia_settings().enabled)
            config.write_text(json.dumps({"enabled": True, "free_api_confirmed": True, "key_file": self.settings.key_file}))
            self.assertTrue(get_nvidia_settings().free_api_confirmed)
            self.assertEqual(read_key(get_nvidia_settings()), self.key)
            config.write_text(json.dumps({"daily_request_limit": 21}))
            with self.assertRaises(TrialError):
                get_nvidia_settings()
            config.write_text(json.dumps({"provider_url": "https://paid.invalid"}))
            with self.assertRaises(TrialError):
                get_nvidia_settings()


if __name__ == "__main__":
    unittest.main()
