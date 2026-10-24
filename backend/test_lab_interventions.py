"""Offline mass balance, decision authorization and closed-loop transport regressions."""

import copy
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.api import app
from backend.culture_simulation import Culture, INTERVENTION_SECONDS
from backend.lab_interventions import InterventionRequest, queue_intervention, cancel_intervention
from backend.virtual_lab import Command, Session, sessions

HEADERS = {"origin": "http://127.0.0.1:8443", "x-hemoforge-action": "virtual-lab"}


def act(session, action, **values):
    session.apply(Command(seq=session.seq + 1, action=action, **values))


def sample(session):
    for action in ("collect", "load", "analyze"):
        act(session, action)
    for _ in range(16):
        act(session, "advance", seconds=0.5)


def decision(session, **values):
    return InterventionRequest(request_id="a" * 32, kind="feed", amount=10,
        source_sample_id=session.results[-1]["sample_id"], note="Review FLEX2 result", **values)


class MassBalanceTests(unittest.TestCase):
    def test_feed_conserves_cells_and_mixes_solutes_by_volume(self):
        culture = Culture("nutrient_limited")
        initial = culture.amounts()
        outcome = culture.intervene("feed", 25)
        self.assertEqual(outcome["volume_after_ml"], 525)
        self.assertEqual(culture.added_ml, 25)
        final = culture.amounts()
        for i in (0, 1, 4, 5):
            self.assertAlmostEqual(final[i], initial[i], places=10)
        self.assertAlmostEqual(final[2] - initial[2], 24 * 25 / 1000)
        self.assertAlmostEqual(final[3] - initial[3], 4 * 25 / 1000)
        self.assertLess(culture.state[0], 1)  # Dilution, not cell destruction.
        culture.intervene("feed", 25)
        before = copy.deepcopy(culture)
        with self.assertRaises(ValueError):
            culture.intervene("feed", 10)
        self.assertEqual(culture, before)

    def test_exchange_retains_cells_and_volume_but_replaces_extracellular_medium(self):
        culture = Culture("metabolite_stress")
        initial = culture.state.copy()
        outcome = culture.intervene("medium_exchange", 50)
        self.assertEqual(culture.state[:2], initial[:2])
        self.assertEqual(culture.volume_ml, 500)
        self.assertEqual(culture.state[4:], [v * 0.5 for v in initial[4:]])
        self.assertEqual(outcome["exchanged_medium_ml"], 250)
        self.assertEqual(culture.exchanged_ml, 250)
        self.assertEqual(culture.withdrawn_ml, 0)  # Sampling ledger is separate.

    def test_intervention_changes_future_culture_kinetics(self):
        control, treated = Culture("nutrient_limited"), Culture("nutrient_limited")
        treated.intervene("medium_exchange", 50)
        for _ in range(8):
            control.advance(6); treated.advance(6)
        self.assertGreater(treated.state[0], control.state[0])
        self.assertGreater(treated.state[2], control.state[2])


class DecisionEngineTests(unittest.TestCase):
    def setUp(self):
        self.session = Session()
        self.session.controller = True
        sample(self.session)

    def test_no_transfer_until_rendered_completion_and_retries_are_idempotent(self):
        session = self.session
        original = copy.deepcopy(session.results)
        request = decision(session)
        record = queue_intervention(session, request, 168)
        self.assertEqual(record["status"], "queued")
        act(session, "advance", seconds=0.5)
        self.assertEqual(session.culture.volume_ml, 499)
        with self.assertRaises(ValueError): act(session, "collect")
        act(session, "execute", intervention_id=record["id"])
        act(session, "advance", seconds=0.5)
        act(session, "pause")
        hour = session.hour
        act(session, "advance", seconds=0.5)
        self.assertEqual(session.hour, hour)
        self.assertEqual(session.culture.volume_ml, 499)
        act(session, "play")
        for _ in range(int(INTERVENTION_SECONDS / 0.5) - 1): act(session, "advance", seconds=0.5)
        self.assertEqual(session.culture.volume_ml, 509)
        self.assertAlmostEqual(session.hour, 0.125)
        self.assertEqual(record["status"], "applied")
        with self.assertRaises(ValueError):
            cancel_intervention(session, record["id"], "Too late")
        self.assertEqual(queue_intervention(session, request, 168), record)
        self.assertEqual(session.culture.volume_ml, 509)
        self.assertEqual(session.results, original)
        with self.assertRaises(ValueError):
            queue_intervention(session, request.model_copy(update={"amount": 25}), 168)
        with self.assertRaises(ValueError):
            queue_intervention(session, request.model_copy(update={"request_id": "b" * 32}), 168)
        sample(session)
        self.assertEqual(session.results[-1]["volume_ml"], 508)
        self.assertEqual(session.results[0], original[0])
        queued = queue_intervention(session, decision(session).model_copy(update={"request_id": "b" * 32}), 168)
        self.assertEqual(queued["source_sample_id"], "FLEX2-002")

    def test_cancel_retains_elapsed_biology_without_applying_transfer(self):
        session = self.session
        record = queue_intervention(session, decision(session), 168)
        act(session, "execute", intervention_id=record["id"])
        act(session, "advance", seconds=0.5)
        hour = session.hour
        cancel_intervention(session, record["id"], "Operator cancelled")
        self.assertEqual(session.culture.volume_ml, 499)
        self.assertFalse(session.running)
        self.assertEqual(session.phase, "complete")
        self.assertEqual(record["completed_at_hour"], round(hour, 6))
        act(session, "advance", seconds=0.5)
        self.assertEqual(session.hour, hour)
        self.assertEqual(cancel_intervention(session, record["id"], "retry")["status"], "cancelled")

    def test_stale_missing_busy_disconnected_full_and_end_run_decisions_are_refused(self):
        request = decision(self.session)
        variants = [
            {"controller": False}, {"hour": 25}, {"hour": 167.96}, {"phase": "loaded"},
            {"results": []}, {"interventions": [{"id": str(i), "status": "cancelled"} for i in range(40)]},
        ]
        for changes in variants:
            session = copy.deepcopy(self.session)
            for key, value in changes.items(): setattr(session, key, value)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                queue_intervention(session, request, 168)
            self.assertEqual(session.culture.volume_ml, 499)
        self.session.culture.volume_ml = 550
        with self.assertRaises(ValueError): queue_intervention(self.session, request, 168)
        with self.assertRaises(ValueError):
            queue_intervention(self.session, request.model_copy(update={"source_sample_id": "FLEX2-999"}), 168)


class DecisionTransportTests(unittest.TestCase):
    def setUp(self):
        self.context = patch.dict(sessions, {}, clear=True); self.context.start()
        self.addCleanup(self.context.stop)
        self.network = patch("socket.create_connection", side_effect=AssertionError("No external network"))
        self.network.start(); self.addCleanup(self.network.stop)
        self.client = TestClient(app)
        # Exercise legacy transport separately from the default BIOSTAT contract.
        created = self.client.post("/api/v1/lab/sessions", headers=HEADERS, json={"device_profile": "legacy-flex2"}).json()
        self.session = sessions[created["session_id"]]
        self.base = f"/api/v1/lab/sessions/{self.session.id}"
        self.controller_headers = {**HEADERS, "x-lab-controller": created["controller_token"]}
        sample(self.session)

    def pair(self):
        code = self.client.post(self.base + "/pairing", headers=self.controller_headers).json()["code"]
        response = self.client.post(self.base + "/pair", headers=HEADERS, json={"code": code})
        self.assertEqual(response.status_code, 200)
        return {**HEADERS, "x-lab-operator": response.json()["operator_token"]}, code

    def test_pairing_is_once_bounded_expiring_session_scoped_and_revocable(self):
        self.assertEqual(self.client.post(self.base + "/pairing", headers=HEADERS).status_code, 403)
        headers, code = self.pair()
        self.assertEqual(self.client.post(self.base + "/pair", headers=HEADERS, json={"code": code}).status_code, 403)
        public = str(self.session.snapshot())
        for secret in (code, self.session.token, headers["x-lab-operator"]): self.assertNotIn(secret, public)
        self.client.post(self.base + "/pairing", headers=self.controller_headers)
        self.session.pairing_expires = time.monotonic() - 1
        self.assertEqual(self.client.post(self.base + "/pair", headers=HEADERS,
            json={"code": self.session.pairing_code}).status_code, 403)
        new_code = self.client.post(self.base + "/pairing", headers=self.controller_headers).json()["code"]
        for _ in range(10):
            self.assertEqual(self.client.post(self.base + "/pair", headers=HEADERS, json={"code": "f" * 12 if new_code != "f" * 12 else "e" * 12}).status_code, 403)
        self.assertEqual(self.client.post(self.base + "/pair", headers=HEADERS, json={"code": new_code}).status_code, 403)
        other = self.client.post("/api/v1/lab/sessions", headers=HEADERS).json()
        body = decision(self.session).model_dump()
        self.assertEqual(self.client.post(f"/api/v1/lab/sessions/{other['session_id']}/interventions", headers=headers, json=body).status_code, 403)
        self.session.controller = True
        self.assertEqual(self.client.post(self.base + "/interventions", headers=headers, json=body).status_code, 201)
        act(self.session, "execute", intervention_id=body["request_id"])
        act(self.session, "advance", seconds=0.5)
        hour = self.session.hour
        self.assertEqual(self.client.post(self.base + "/revoke-operator", headers=self.controller_headers).status_code, 200)
        self.assertEqual(self.session.interventions[-1]["status"], "cancelled")
        self.assertEqual(self.session.culture.volume_ml, 499)
        self.assertEqual(self.session.hour, hour)
        self.assertFalse(self.session.running)
        self.assertEqual(self.client.post(self.base + "/interventions", headers=headers, json=body).status_code, 403)

    def test_intervention_inputs_refuse_unsupported_presets_and_extra_controls(self):
        headers, _ = self.pair()
        self.session.controller = True
        body = decision(self.session).model_dump()
        for changes in ({"kind": "acid_dose"}, {"kind": "feed", "amount": 50},
                        {"kind": "medium_exchange", "amount": 10}, {"amount": 10.5},
                        {"note": "x"}, {"note": "x" * 161}, {"request_id": "../unsafe"},
                        {"source_sample_id": "not-a-sample"}, {"action": "advance"},
                        {"provider_url": "https://untrusted.example"}):
            with self.subTest(changes=changes):
                response = self.client.post(self.base + "/interventions", headers=headers, json={**body, **changes})
                self.assertEqual(response.status_code, 422)
        self.assertEqual(self.session.interventions, [])
        self.assertEqual(self.session.culture.volume_ml, 499)

    def test_authorized_decision_reaches_both_windows_and_applies_once(self):
        headers, _ = self.pair()
        body = decision(self.session).model_dump()
        self.assertEqual(self.client.post(self.base + "/interventions", headers=HEADERS, json=body).status_code, 403)
        bad_origin = {**headers, "origin": "https://untrusted.example"}
        self.assertEqual(self.client.post(self.base + "/interventions", headers=bad_origin, json=body).status_code, 403)
        with self.client.websocket_connect(self.base + "/stream", headers=HEADERS) as viewer:
            viewer.send_json({"role": "viewer"}); viewer.receive_json()
            with self.client.websocket_connect(self.base + "/stream", headers=HEADERS) as controller:
                controller.send_json({"role": "controller", "token": self.session.token}); controller.receive_json()
                response = self.client.post(self.base + "/interventions", headers=headers, json=body)
                self.assertEqual(response.status_code, 201)
                self.assertEqual(self.session.culture.volume_ml, 499)
                while viewer.receive_json()["active_intervention"] is None: pass
                actions = [("execute", {"intervention_id": body["request_id"]})] + [("advance", {"seconds": 0.5})] * 8
                for action, values in actions:
                    seq = self.session.seq + 1
                    controller.send_json({"seq": seq, "action": action, **values})
                    while True:
                        current = controller.receive_json()
                        if current["ack_seq"] == seq: break
                self.assertEqual(current["interventions"][-1]["status"], "applied")
                self.assertEqual(current["working_volume_ml"], 509)
                while True:
                    observed = viewer.receive_json()
                    if observed["ack_seq"] == current["ack_seq"]: break
                self.assertEqual(observed["interventions"], current["interventions"])
                self.assertEqual(observed["measurements_sha256"], current["measurements_sha256"])
                self.assertEqual(self.client.post(self.base + "/interventions", headers=headers, json=body).json()["status"], "applied")
                self.assertEqual(self.session.culture.volume_ml, 509)
        with self.client.websocket_connect(self.base + "/stream", headers=HEADERS) as refreshed:
            refreshed.send_json({"role": "viewer"})
            self.assertEqual(refreshed.receive_json()["interventions"][-1]["status"], "applied")


if __name__ == "__main__": unittest.main()
