"""Merge regressions: configurable website inputs must reach HemoBot unchanged."""

import unittest

from backend.agent_models import AnalyzeRequest
from backend.agent_tools import claim_catalog, collect_context
from backend.models import ExperimentRequest
from backend.predictions import predict_experiments
from backend.test_agent import payload


class WorkspaceBridgeTests(unittest.TestCase):
    def test_custom_marker_calls_and_missing_policies_match_the_configurable_panel(self):
        data = payload()
        data["inputs"]["markers"]["rows"] = [
            {"sample_id": "CUSTOM-1", "calls": {"rs12075": "T|C"}},
            {"sample_id": "CUSTOM-2", "calls": {"rs12075": "./."}},
        ]
        data["active_context"]["marker_settings"] = {
            "targets": [{"gene": "ACKR1", "rsId": "rs12075", "alleles": ["C", "T"], "genotype": "C/T"}],
            "mode": "all", "missing": "unknown",
        }
        for policy, expected in [("unknown", {"match": 1, "excluded": 0, "unknown": 1}),
                                 ("ignore", {"match": 1, "excluded": 0, "unknown": 1}),
                                 ("exclude", {"match": 1, "excluded": 1, "unknown": 0})]:
            data["active_context"]["marker_settings"]["missing"] = policy
            result = collect_context(AnalyzeRequest(**data))["modules"]["match"]
            self.assertEqual(result["counts"], expected)
            self.assertEqual(result["status"], "pending_lab_verification")

    def test_monitoring_and_fractional_report_windows_follow_current_settings(self):
        data = payload()
        data["active_context"].update({"replay_elapsed_hours": 110, "report_interval": 2.5,
                                      "monitoring": {"declineCount": 1, "dropPercent": 5, "staleHours": 5}})
        context = collect_context(AnalyzeRequest(**data))
        events = context["modules"]["guard"]["events"]
        self.assertEqual([event["rule"] for event in events],
                         ["configured_consecutive_declines", "configured_consecutive_declines", "configured_stale_sample"])
        self.assertEqual(events[-1]["value"], 14)
        self.assertEqual(context["modules"]["pilot"]["checkpoint_count"], 44)
        self.assertEqual(context["modules"]["pilot"]["reports"][0]["checkpoint_hour"], 2.5)
        self.assertNotIn("99999", str(context))
        warning = next(claim.text for claim in claim_catalog(context) if claim.id == "guard_warning")
        self.assertIn("14 h old", warning)
        self.assertNotIn("non-positive", warning)

    def test_plan_settings_use_the_same_python_model_as_cultureplan(self):
        data = payload()
        data["active_context"]["plan_settings"] = {
            "objective": "minimize", "lengthScale": 1.3, "noise": 0.25, "exploration": 0.1}
        request = AnalyzeRequest(**data)
        actual = collect_context(request)["modules"]["plan"]
        expected = predict_experiments(ExperimentRequest(rows=request.inputs.experiments.rows,
            objective="minimize", length_scale=1.3, noise_sd=0.25, exploration=0.1))["result"]
        self.assertEqual(actual["ranked"], expected["ranked"])
        self.assertEqual(actual["mae"], expected["mae"])
