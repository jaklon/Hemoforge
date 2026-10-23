"""Offline process/PAT/provenance and two-monitor regressions; no equipment."""
import copy
import json
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.api import app
from backend.biostat import BiostatSession, BiostatCulture
from backend.virtual_lab import Command, sessions
from backend.lab_analytics import AnalyticsRequest, live_analytics
from backend.lab_interventions import InterventionRequest, queue_intervention, cancel_intervention

HEADERS = {"origin": "http://127.0.0.1:8443", "x-hemoforge-action": "virtual-lab"}


def act(s, action, **values):
    s.apply(Command(seq=s.seq + 1, action=action, **values))


def advance(s, hour, seconds=0.5):
    act(s, "play"); act(s, "speed", speed=1)
    while s.hour < hour - 1e-8:
        act(s, "advance", seconds=min(seconds, hour - s.hour))


def decision(s, **changes):
    return InterventionRequest(**{"request_id": "a" * 32, "kind": "feed", "amount": 10,
        "source_sample_id": s.results[-1]["sample_id"], "note": "Review online PAT signals", **changes})


def analyze(s):
    snap = s.snapshot()
    return live_analytics(snap, AnalyticsRequest(source_hash=snap["measurements_sha256"]))


class BiostatTests(unittest.TestCase):
    def test_automatic_cadence_release_delay_no_withdrawal_or_manual_assay(self):
        s = BiostatSession()
        self.assertEqual(s.snapshot()["sensor_readings"], [])
        advance(s, 0.01, 0.01)
        self.assertEqual([r["device"] for r in s.sensor_readings], ["core"])
        self.assertEqual(s.results, [])
        advance(s, 0.03, 0.01)
        self.assertEqual(len(s.results), 1)
        self.assertNotIn("glucose_mmol_l", s.results[0]["channels"])
        advance(s, 2.11)
        trace = [r for r in s.sensor_readings if r["device"] == "trace"]
        self.assertEqual([r["measured_at_hour"] for r in trace], [0, 2])
        self.assertEqual([r["available_at_hour"] for r in trace], [0.1, 2.1])
        self.assertEqual(s.culture.volume_ml, 12500)
        self.assertEqual(s.culture.withdrawn_ml, 0)
        for action in ("collect", "load", "analyze"):
            with self.assertRaises(ValueError): act(s, action)

    def test_snapshot_distinguishes_sensor_channels_and_estimates_without_private_state(self):
        s = BiostatSession(); advance(s, 4); snap = s.snapshot()
        for row in snap["sensor_readings"]:
            self.assertEqual(row["source_kind"], "virtual_sensor")
            for key in ("glutamine_mmol_l", "ammonium_mmol_l", "viability_percent", "enucleation_percent"):
                self.assertNotIn(key, row["channels"])
        for row in snap["measurements"]:
            self.assertEqual(row["source_kind"], "model_estimate")
            self.assertTrue(row["source_sensor_ids"])
            self.assertIn("NOT biologically calibrated", row["calibration_profile"])
            self.assertAlmostEqual(row["count"], row["viable_cell_density_million_ml"] * row["volume_ml"], delta=0.01)
        for key in ("controller_token", "pairing_code", "operator_token", "state", "frozen"):
            self.assertNotIn(f'"{key}"', json.dumps(snap))
        self.assertEqual(snap["schema_version"], 4)

    def test_seed_and_frame_partition_reproduce_sensor_history(self):
        a, b = BiostatSession(seed=7), BiostatSession(seed=7)
        advance(a, 12, 0.5); advance(b, 12, 0.25)
        self.assertEqual(a.sensor_readings, b.sensor_readings)
        self.assertEqual(a.results, b.results)
        c = BiostatSession(seed=8); advance(c, 12)
        self.assertNotEqual(a.sensor_readings[0]["channels"], c.sensor_readings[0]["channels"])

    def test_pause_duplicate_ticks_and_end_boundary(self):
        s = BiostatSession(); act(s, "advance", seconds=0.5)
        self.assertEqual(s.hour, 0)
        advance(s, 1)
        c = Command(seq=s.seq + 1, action="advance", seconds=0.5)
        s.apply(c); before = s.snapshot(); s.apply(c)
        self.assertEqual(before, s.snapshot())
        act(s, "pause"); hour = s.hour; act(s, "advance", seconds=0.5)
        self.assertEqual(s.hour, hour)
        advance(s, 168)
        self.assertEqual(s.hour, 168)
        self.assertFalse(s.running)
        self.assertLessEqual(len(s.sensor_readings), 700)

    def test_setpoints_affect_future_values_without_rewriting_history(self):
        s = BiostatSession(); advance(s, 3); old = copy.deepcopy(s.sensor_readings)
        act(s, "setpoints", ph_setpoint=7.1, do_setpoint=50, temperature_setpoint=36)
        advance(s, 8)
        self.assertEqual(s.sensor_readings[:len(old)], old)
        self.assertAlmostEqual(s.culture.temperature, 36, delta=0.1)
        self.assertAlmostEqual(s.culture.ph, 7.1, delta=0.1)
        self.assertEqual(s.snapshot()["controller"]["mode"], "AUTO")
        self.assertEqual(len(s.controller_events), 1)
        self.assertEqual(analyze(s)["segment_id"], "initial:expansion:SP-1")

    def test_fault_blocks_decisions_and_forecast_until_sensor_recovers(self):
        s = BiostatSession(); s.controller = True; advance(s, 10)
        self.assertEqual(analyze(s)["status"], "ready")
        act(s, "sensor_fault", sensor="trace"); advance(s, 12.2)
        trace = [r for r in s.sensor_readings if r["device"] == "trace"][-1]
        self.assertEqual(trace["channels"], {})
        self.assertEqual(trace["quality"]["status"], "rejected")
        self.assertIsNone(analyze(s)["forecast"])
        with self.assertRaises(ValueError): queue_intervention(s, decision(s), 168)
        act(s, "sensor_fault", sensor="trace"); advance(s, 15.2)
        self.assertEqual(analyze(s)["status"], "ready")
        self.assertEqual(queue_intervention(s, decision(s), 168)["status"], "queued")

    def test_dense_samples_thinned_and_differentiation_withholds_growth_forecast(self):
        s = BiostatSession(); advance(s, 40); result = analyze(s)
        times = [row["hour"] for row in result["training_samples"]]
        self.assertLessEqual(len(times), 13)
        self.assertGreaterEqual(times[0], 16)
        self.assertTrue(all(b - a >= 2 for a, b in zip(times, times[1:])))
        advance(s, 41)
        self.assertEqual(analyze(s)["segment_id"], result["segment_id"])
        advance(s, 80)
        self.assertEqual(s.snapshot()["stage"], "differentiation")
        self.assertIsNone(analyze(s)["forecast"])
        self.assertEqual(analyze(s)["target_plan"]["status"], "withheld")
        self.assertIn("RBC", analyze(s)["reason"])

    def test_feed_mass_balance_and_nonideal_retention(self):
        c = BiostatCulture("metabolite_stress"); initial = c.amounts()
        c.intervene("feed", 10)
        self.assertEqual(c.volume_ml, 13000)
        self.assertAlmostEqual(c.amounts()[0], initial[0])
        self.assertAlmostEqual(c.amounts()[2] - initial[2], 24 * 0.5)
        x, lactate = c.state[0], c.state[4]; result = c.intervene("medium_exchange", 50)
        self.assertAlmostEqual(c.state[0], x * 0.99)
        self.assertAlmostEqual(c.state[4], lactate / 2)
        self.assertEqual(result["retention_fraction"], 0.98)

    def test_horizons_and_target_eta_do_not_cross_the_assumed_phase_boundary(self):
        s = BiostatSession(); advance(s, 60)
        self.assertIsNone(analyze(s)["forecast"])
        snap = s.snapshot()
        shorter = live_analytics(snap, AnalyticsRequest(source_hash=snap["measurements_sha256"], horizon=12, target_million=1_000_000))
        self.assertEqual(shorter["status"], "ready")
        self.assertEqual(shorter["target_plan"]["status"], "beyond_phase")
        self.assertIsNone(shorter["target_plan"]["target_hour"])

    def test_transfer_applies_once_after_rendering_and_requires_new_evidence(self):
        s = BiostatSession(); s.controller = True; advance(s, 3)
        request = decision(s); record = queue_intervention(s, request, 168)
        self.assertEqual(s.culture.volume_ml, 12500)
        act(s, "execute", intervention_id=record["id"])
        for _ in range(7): act(s, "advance", seconds=0.5)
        self.assertEqual(s.culture.volume_ml, 12500)
        act(s, "advance", seconds=0.5)
        self.assertEqual(s.culture.volume_ml, 13000)
        self.assertEqual(queue_intervention(s, request, 168)["status"], "applied")
        self.assertEqual(s.culture.volume_ml, 13000)
        with self.assertRaises(ValueError): queue_intervention(s, decision(s, request_id="b" * 32), 168)
        advance(s, 5)
        r = queue_intervention(s, decision(s, request_id="b" * 32), 168)
        act(s, "execute", intervention_id=r["id"]); act(s, "advance", seconds=0.5)
        cancel_intervention(s, r["id"], "cancelled")
        self.assertEqual(s.culture.volume_ml, 13000)


class BiostatTransportTests(unittest.TestCase):
    def test_default_session_two_monitors_receive_identical_public_receipts(self):
        with patch.dict(sessions, {}, clear=True), patch("socket.create_connection", side_effect=AssertionError("No external network")):
            client = TestClient(app)
            response = client.post("/api/v1/lab/sessions", headers=HEADERS)
            self.assertEqual(response.status_code, 201)
            created = response.json(); path = f"/api/v1/lab/sessions/{created['session_id']}/stream"
            with client.websocket_connect(path, headers=HEADERS) as viewer:
                viewer.send_json({"role": "viewer"})
                self.assertEqual(viewer.receive_json()["schema_version"], 4)
                with client.websocket_connect(path, headers=HEADERS) as controller:
                    controller.send_json({"role": "controller", "token": created["controller_token"]}); controller.receive_json()
                    for seq, (action, values) in enumerate([("play", {}), ("speed", {"speed": 1}), ("advance", {"seconds": 0.5})], 1):
                        controller.send_json({"seq": seq, "action": action, **values})
                        while (current := controller.receive_json())["ack_seq"] != seq: pass
                    while (received := viewer.receive_json())["ack_seq"] != 3: pass
                    self.assertEqual(received["sensor_readings"], current["sensor_readings"])
                    self.assertEqual(received["measurements_sha256"], current["measurements_sha256"])
                    self.assertEqual(len(received["measurements"]), 1)
                while (received := viewer.receive_json())["controller_connected"]: pass
                self.assertFalse(received["running"])
            for changes in ({"ph_setpoint": 9}, {"temperature_setpoint": 100}, {"sensor": "unknown"}):
                with self.assertRaises(ValueError): Command(seq=1, action="setpoints", **changes)


if __name__ == "__main__": unittest.main()
