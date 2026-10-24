"""Read-only live-module boundaries: publication, intervention segments and numeric plans."""

import copy
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.api import app
from backend.lab_analytics import AnalyticsRequest, live_analytics
from backend.lab_interventions import InterventionRequest, queue_intervention
from backend.virtual_lab import Command, Session, sessions

HEADERS = {"origin": "http://127.0.0.1:8443", "x-hemoforge-action": "virtual-lab"}


def act(session, action, **values):
    session.apply(Command(seq=session.seq + 1, action=action, **values))


def collect_at(session, hour):
    if session.hour < hour:
        act(session, "play")
        while hour - session.hour > 1e-9:
            act(session, "advance", seconds=min(0.5, (hour - session.hour) / session.speed))
    for action in ("collect", "load", "analyze"):
        act(session, action)
    for _ in range(16): act(session, "advance", seconds=0.5)


def prepared_session():
    session = Session()
    for hour in (0, 12, 24): collect_at(session, hour)
    return session


def analyze(snapshot, **settings):
    return live_analytics(snapshot, AnalyticsRequest(source_hash=snapshot["measurements_sha256"], **settings))


class LiveAnalyticsTests(unittest.TestCase):
    def test_existing_growth_engine_and_target_use_released_source_counts(self):
        snapshot = prepared_session().snapshot()
        result = analyze(snapshot)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["source_sample_ids"], ["FLEX2-001", "FLEX2-002", "FLEX2-003"])
        self.assertEqual(result["forecast"]["modelVersion"], "growth-lognormal-v2")
        self.assertEqual(result["forecast"]["result"]["measurementCount"], 3)
        self.assertEqual(result["forecast"]["result"]["fromHour"], 24)
        self.assertEqual(result["forecast"]["result"]["observedCount"], snapshot["measurements"][-1]["count"])
        self.assertEqual(result["target_plan"]["observed_count"], snapshot["measurements"][-1]["count"])
        self.assertGreater(result["target_plan"]["doubling_hours"], 0)
        self.assertEqual(result["experiment_gp"]["status"], "withheld")
        self.assertEqual(result["forecast"]["sourceHash"], result["fit_input_hash"])
        reached = analyze(snapshot, target_million=1)["target_plan"]
        self.assertEqual(reached["status"], "observed_target_reached")
        self.assertGreater(reached["doubling_hours"], 0)

    def test_pending_rejected_and_future_available_rows_never_enter_fit(self):
        session = Session()
        act(session, "collect"); act(session, "load"); act(session, "analyze")
        self.assertIsNone(analyze(session.snapshot())["forecast"])
        snapshot = prepared_session().snapshot()
        baseline = analyze(snapshot)["forecast"]["result"]
        future = {**snapshot["measurements"][-1], "sample_id": "FLEX2-999", "count": 999999,
                  "collected_at_hour": 24.01, "available_at_hour": 25}
        rejected = {**future, "available_at_hour": 24.02, "quality": {"status": "rejected", "flags": ["underfilled"]}}
        snapshot["measurements"].extend([future, rejected])
        result = analyze(snapshot)
        self.assertEqual(result["forecast"]["result"], baseline)
        self.assertEqual(len(result["source_sample_ids"]), 3)

    def test_applied_intervention_resets_training_cancelled_does_not(self):
        session = prepared_session()
        session.controller = True
        request = InterventionRequest(request_id="a" * 32, kind="feed", amount=10,
                                      source_sample_id="FLEX2-003", note="Test segment boundary")
        queue_intervention(session, request, 168)
        self.assertEqual(analyze(session.snapshot())["status"], "intervention_in_progress")
        act(session, "execute", intervention_id=request.request_id)
        for _ in range(8): act(session, "advance", seconds=0.5)
        result = analyze(session.snapshot())
        self.assertEqual(result["segment_id"], request.request_id)
        self.assertEqual(result["training_samples"], [])
        for hour in (25, 37, 49): collect_at(session, hour)
        result = analyze(session.snapshot())
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["source_sample_ids"], ["FLEX2-004", "FLEX2-005", "FLEX2-006"])
        snapshot = session.snapshot()
        snapshot["interventions"].append({"id": "b" * 32, "status": "cancelled", "completed_at_hour": 49})
        self.assertEqual(analyze(snapshot)["segment_id"], request.request_id)

    def test_sparse_short_stale_and_invalid_trends_have_no_static_fallback(self):
        session = Session()
        for hour in (0, 1, 2): collect_at(session, hour)
        self.assertEqual(analyze(session.snapshot())["status"], "needs_time_span")
        snapshot = prepared_session().snapshot()
        snapshot["culture_hours"] = 50
        self.assertEqual(analyze(snapshot)["status"], "stale")
        self.assertIsNone(analyze(snapshot)["forecast"])
        snapshot["culture_hours"] = 24.075
        snapshot["measurements"][-1]["count"] = 0
        self.assertEqual(analyze(snapshot)["status"], "needs_review")
        self.assertEqual(analyze(snapshot)["target_plan"]["status"], "withheld")

    def test_non_growing_and_out_of_run_targets_are_explicit(self):
        snapshot = prepared_session().snapshot()
        for row, count in zip(snapshot["measurements"], (1000, 900, 800)): row["count"] = count
        self.assertEqual(analyze(snapshot)["target_plan"]["status"], "non_growing")
        self.assertIsNone(analyze(snapshot)["target_plan"]["target_hour"])
        self.assertEqual(analyze(snapshot, target_million=700)["target_plan"]["status"], "observed_target_reached")
        for row, count in zip(snapshot["measurements"], (500, 501, 502)): row["count"] = count
        self.assertEqual(analyze(snapshot, target_million=1_000_000)["target_plan"]["status"], "beyond_run")


class AnalyticsEndpointTests(unittest.TestCase):
    def setUp(self):
        self.context = patch.dict(sessions, {}, clear=True); self.context.start(); self.addCleanup(self.context.stop)
        self.network = patch("socket.create_connection", side_effect=AssertionError("No external network"))
        self.network.start(); self.addCleanup(self.network.stop)
        self.client = TestClient(app)
        self.session = prepared_session()
        sessions[self.session.id] = self.session
        self.path = f"/api/v1/lab/sessions/{self.session.id}/analytics"
        self.body = {"source_hash": self.session.snapshot()["measurements_sha256"]}

    def test_read_only_endpoint_uses_authoritative_observations_without_hidden_state(self):
        before = copy.deepcopy(self.session.__dict__)
        response = self.client.post(self.path, headers=HEADERS, json=self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.session.__dict__, before)
        self.session.frozen = {"count": 9999999}
        self.session.culture.state = [99999] * 6
        second = self.client.post(self.path, headers=HEADERS, json=self.body).json()
        self.assertEqual(second["forecast"]["result"], response.json()["forecast"]["result"])
        for secret in (self.session.token, "controller_token", "operator_token", "pairing_code"):
            self.assertNotIn(secret, response.text)

    def test_local_origin_hash_and_bounded_settings_are_enforced(self):
        self.assertEqual(self.client.post(self.path, json=self.body).status_code, 403)
        remote = TestClient(app, client=("203.0.113.1", 5000))
        self.assertEqual(remote.post(self.path, headers=HEADERS, json=self.body).status_code, 403)
        self.assertEqual(self.client.post(self.path, headers=HEADERS, json={"source_hash": "f" * 64}).status_code, 409)
        for changes in ({"horizon": 720}, {"target_million": 0}, {"target_million": True},
                        {"target_million": 1_000_001}, {"samples": [{"count": 999}]},
                        {"provider_url": "https://untrusted.example"}):
            self.assertEqual(self.client.post(self.path, headers=HEADERS, json={**self.body, **changes}).status_code, 422)


if __name__ == "__main__": unittest.main()
