import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from backend.agent_config import AgentSettings
from backend.agent_llm import select_evidence
from backend.agent_models import AnalyzeRequest, EvidencePlan
from backend.agent_service import INFERENCE_SLOT, analyze
from backend.agent_store import AuditStore, fingerprint
from backend.agent_tools import claim_catalog, collect_context
from backend.api import app
from backend.db import use_temporary_schema


def payload():
    source = {"name": "synthetic.csv", "sha256": "", "evidence": "software_test_only"}
    return {"query_en": "Summarize the evidence across all modules.", "mode": "template",
            "active_context": {"batch_id": "A", "replay_elapsed_hours": 96}, "inputs": {
                "culture": {**source, "rows": [
                    {"batch_id": "A", "hour": t, "count": n, "channels": {"lactate_mmol_l": l}}
                    for t, n, l in [(0, 1, 1), (24, 1.6, 2), (48, 2.2, 3), (72, 2, 4), (96, 1.8, 5), (120, 99999, 99999)]]},
                "experiments": {**source, "rows": [
                    {"condition_id": name, "lactate_mg_l": l, "ammonia_mg_l": a, "response": r + delta, "response_unit": "fold_change"}
                    for name, l, a, r in [("LL", 0, 0, 8), ("HL", 850, 0, 5), ("LH", 0, 41, 6), ("HH", 850, 41, 4)]
                    for delta in [-0.1, 0.1]]},
                "markers": {**source, "rows": [{"sample_id": "M1", "kel": "A|G", "slc": "G/G"},
                                               {"sample_id": "M2", "kel": "./.", "slc": "G/G"}]}}}


class AgentTests(unittest.TestCase):
    def setUp(self):
        use_temporary_schema(self)
        self.settings = AgentSettings(mode="template")

    def test_replay_context_withholds_future_counts_channels_and_warnings(self):
        data = payload()
        data["active_context"]["replay_elapsed_hours"] = 48
        context = collect_context(AnalyzeRequest(**data))
        self.assertEqual(len(context["modules"]["guard"]["measurements"]), 3)
        self.assertEqual(context["modules"]["guard"]["events"], [])
        self.assertNotIn("99999", json.dumps(context))
        catalog = json.dumps([c.model_dump() for c in claim_catalog(context)])
        self.assertNotIn("99999", catalog)
        self.assertEqual(context["modules"]["guard"]["channels"]["lactate_mmol_l"]["value"], 3)

    def test_guard_and_checkpoint_follow_source_timing(self):
        request = AnalyzeRequest(**payload())
        context = collect_context(request)
        guard = context["modules"]["guard"]
        self.assertEqual(guard["status"], "warning")
        self.assertEqual(guard["events"][0]["hour"], 96)
        self.assertAlmostEqual(guard["fold_change"], 1.8)
        request.active_context.replay_elapsed_hours = 51
        checkpoint = collect_context(request)["modules"]["pilot"]["latest_checkpoint"]
        self.assertEqual(checkpoint["checkpoint_hour"], 51)
        self.assertEqual(checkpoint["new_measurements"], 0)
        self.assertEqual(checkpoint["last_measurement_hour"], 48)

    def test_invalid_counts_withhold_growth_and_keep_marker_unknowns(self):
        data = payload()
        data["inputs"]["culture"]["rows"][1]["count"] = None
        request = AnalyzeRequest(**data)
        context = collect_context(request)
        self.assertEqual(context["modules"]["guard"]["status"], "needs_review")
        self.assertIsNone(context["modules"]["guard"]["fold_change"])
        self.assertIsNone(context["modules"]["guard"]["growth_rate_per_hour"])
        self.assertEqual(context["modules"]["match"]["counts"], {"match": 1, "excluded": 0, "unknown": 1})
        self.assertEqual(context["modules"]["match"]["status"], "pending_lab_verification")

    def test_actual_experiment_changes_refit_the_agent_context(self):
        data = payload()
        first = collect_context(AnalyzeRequest(**data))["modules"]["plan"]
        data["inputs"]["experiments"]["rows"][0]["response"] = 30
        second = collect_context(AnalyzeRequest(**data))["modules"]["plan"]
        self.assertNotEqual(first["ranked"], second["ranked"])
        self.assertNotEqual(first["mae"], second["mae"])
        self.assertIn("factorial_effects", first)
        self.assertEqual(first["factorial_effects"]["significance_test"], "not_performed")

    def test_templates_and_audit_are_repeatable_and_reconstructible(self):
        request = AnalyzeRequest(**payload())
        first, second = analyze(request, self.settings), analyze(request, self.settings)
        self.assertEqual(first.analysis_fingerprint, second.analysis_fingerprint)
        self.assertNotEqual(first.response_id, second.response_id)
        self.assertEqual(first.analysis_fingerprint, "sha256:" + fingerprint(first.audit_manifest))
        audit = AuditStore().get(first.response_id)
        self.assertEqual(first.context_fingerprint, "sha256:" + fingerprint(audit["context"]))
        self.assertNotIn("99999", json.dumps(audit))
        self.assertEqual(first.evidence_quality, "software_test_only")
        self.assertIn("stage classification", first.biomedical_analysis_markdown.lower())
        self.assertEqual(first.rarematch_roadmap_evo2_extension["current_mvp_status"], "roadmap_preview_only")

    def test_boundaries_never_reach_inference_or_change_qc_status(self):
        data = payload()
        data["mode"] = "auto"
        data["active_context"]["verification_requests"] = [True] * 3
        self.settings.mode = "auto"
        for query in ["Automatically adjust the bioreactor pump", "Approve the product for patient transfusion", "Merge the independent studies into a donor-to-harvest batch"]:
            data["query_en"] = query
            with patch("backend.agent_service.select_evidence") as model:
                result = analyze(AnalyzeRequest(**data), self.settings)
            model.assert_not_called()
            self.assertEqual(result.execution_status, "blocked")
            self.assertIn("pending_lab_verification", json.dumps(result.model_dump()))

    def test_inference_failure_and_busy_service_fall_back_honestly(self):
        data = payload()
        data["mode"] = "auto"
        request = AnalyzeRequest(**data)
        self.settings.mode = "auto"
        with patch("backend.agent_service.select_evidence", side_effect=httpx.ConnectError("private connection details")):
            response = analyze(request, self.settings)
        self.assertEqual(response.execution_status, "fallback")
        self.assertNotIn("private connection", response.model_dump_json())
        INFERENCE_SLOT.acquire()
        try:
            with patch("backend.agent_service.select_evidence") as model:
                response = analyze(request, self.settings)
            model.assert_not_called()
            self.assertIn("occupied", response.fallback_reason)
        finally:
            INFERENCE_SLOT.release()

    def test_successful_model_cannot_remove_mandatory_scientific_limits(self):
        data = payload()
        data["mode"], data["module"] = "auto", "guard"
        self.settings.mode = "auto"
        with patch("backend.agent_service.select_evidence", return_value=(EvidencePlan(language="en", claim_ids=["guard_count"], action_ids=[]), "digest")):
            response = analyze(AnalyzeRequest(**data), self.settings)
        self.assertEqual(response.execution_status, "succeeded")
        self.assertIn("does not establish contamination", response.biomedical_analysis_markdown)
        self.assertIn("Additional proposal warning rules", response.biomedical_analysis_markdown)

    def test_http_contract_validation_storage_exports_and_host_boundary(self):
        with patch("backend.agent_routes.get_settings", return_value=self.settings):
            client = TestClient(app)
            response = client.post("/api/v1/hemobot/analyze", json=payload())
            self.assertEqual(response.status_code, 200, response.text)
            id = response.json()["response_id"]
            for format in ["json", "html", "markdown"]:
                exported = client.get(f"/api/v1/hemobot/analyses/{id}/export?format={format}")
                self.assertEqual(exported.status_code, 200)
                self.assertIn("attachment", exported.headers["content-disposition"])
                self.assertIn("sandbox", exported.headers["content-security-policy"])
            self.assertEqual(client.get("/api/v1/hemobot/analyses/not-found/export").status_code, 404)
            data = payload()
            data["active_context"]["batch_id"] = "missing"
            self.assertEqual(client.post("/api/v1/hemobot/analyze", json=data).status_code, 422)
            data = payload()
            data["active_context"]["completed_lab_results"] = True
            self.assertEqual(client.post("/api/v1/hemobot/analyze", json=data).status_code, 422)
            self.assertEqual(client.get("/api/health", headers={"host": "attacker.example"}).status_code, 400)
            oversized = client.post("/api/v1/hemobot/analyze", content=b"x" * (8 * 1024 * 1024 + 1))
            self.assertEqual(oversized.status_code, 413)

    def test_imported_identifiers_are_escaped_in_html_export(self):
        data = payload()
        for row in data["inputs"]["culture"]["rows"]:
            row["batch_id"] = "<script>alert('x')</script>"
        data["active_context"]["batch_id"] = "<script>alert('x')</script>"
        with patch("backend.agent_routes.get_settings", return_value=self.settings):
            client = TestClient(app)
            response = client.post("/api/v1/hemobot/analyze", json=data)
            export = client.get(f"/api/v1/hemobot/analyses/{response.json()['response_id']}/export?format=html")
        self.assertNotIn("<script>", export.text)
        self.assertIn("&lt;script&gt;", export.text)


class OllamaContractTests(unittest.TestCase):
    def test_structured_ollama_call_validates_ids_language_and_module_coverage(self):
        context = collect_context(AnalyzeRequest(**payload()))
        catalog = claim_catalog(context)
        for ids, language, success in [(["guard_count"], "en", True), (["fabricated_999"], "en", False),
                                       (["guard_count", "guard_count"], "en", False), (["match_lab"], "en", False),
                                       (["guard_count"], "id", False)]:
            calls = []

            def handler(request):
                calls.append(request)
                if request.url.path == "/api/tags":
                    return httpx.Response(200, json={"models": [{"name": "test-model", "digest": "weights-digest"}]})
                body = json.loads(request.content)
                self.assertFalse(body["stream"])
                self.assertEqual(body["options"]["num_gpu"], 0)
                self.assertEqual(body["options"]["seed"], 42)
                self.assertIn("enum", body["format"]["properties"]["claim_ids"]["items"])
                return httpx.Response(200, json={"done": True, "done_reason": "stop", "message": {
                    "content": json.dumps({"language": language, "claim_ids": ids, "action_ids": []})}})

            client = httpx.Client(transport=httpx.MockTransport(handler))
            settings = AgentSettings(ollama_model="test-model")
            with self.subTest(ids=ids, language=language), patch("backend.agent_llm.httpx.Client", return_value=client):
                if success:
                    plan, digest = select_evidence(settings, "Explain warnings", catalog, ["guard"], [])
                    self.assertEqual(digest, "weights-digest")
                else:
                    with self.assertRaises(ValueError):
                        select_evidence(settings, "Explain warnings", catalog, ["guard"], [])

    def test_llamacpp_openai_call_uses_json_schema_and_validates_ids(self):
        catalog = claim_catalog(collect_context(AnalyzeRequest(**payload())))
        for ids, finish, success in [(["guard_count"], "stop", True), (["fabricated_999"], "stop", False),
                                     (["guard_count"], "length", False)]:
            def handler(request):
                if request.url.path == "/health":
                    return httpx.Response(200, json={"status": "ok"})
                self.assertEqual(request.url.path, "/v1/chat/completions")
                body = json.loads(request.content)
                self.assertIn("enum", body["response_format"]["json_schema"]["schema"]["properties"]["claim_ids"]["items"])
                return httpx.Response(200, json={"choices": [{"finish_reason": finish, "message": {
                    "content": json.dumps({"language": "en", "claim_ids": ids, "action_ids": []})}}]})

            client = httpx.Client(transport=httpx.MockTransport(handler))
            settings = AgentSettings(provider="llamacpp", ollama_url="http://127.0.0.1:8082")
            with self.subTest(ids=ids, finish=finish), patch("backend.agent_llm.httpx.Client", return_value=client):
                if success:
                    plan, digest = select_evidence(settings, "Explain warnings", catalog, ["guard"], [])
                    self.assertEqual(plan.claim_ids, ["guard_count"])
                    self.assertIsNone(digest)
                else:
                    with self.assertRaises(ValueError):
                        select_evidence(settings, "Explain warnings", catalog, ["guard"], [])


if __name__ == "__main__":
    unittest.main()
