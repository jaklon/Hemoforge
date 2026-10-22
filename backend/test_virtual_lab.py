"""Offline engine and two-window transport regressions; no database/model calls."""

import unittest
import time
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.api import app
from backend.virtual_lab import Command, Session, sessions

ORIGIN = {"origin": "http://127.0.0.1:8443"}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.session = Session()

    def act(self, action, **values):
        self.session.apply(Command(seq=self.session.seq + 1, action=action, **values))

    def test_clock_requires_running_animation_and_duplicate_steps_are_idempotent(self):
        self.act("advance", seconds=0.5)
        self.assertEqual(self.session.hour, 0)
        self.act("play")
        command = Command(seq=3, action="advance", seconds=0.5)
        self.session.apply(command)
        self.session.apply(command)
        self.assertEqual(self.session.hour, 3)
        self.act("pause")
        self.act("advance", seconds=0.5)
        self.assertEqual(self.session.hour, 3)
        with self.assertRaises(ValueError):
            self.session.apply(Command(seq=99, action="play"))

    def test_sampling_freezes_values_and_publishes_only_after_completed_assay(self):
        self.act("collect")
        self.assertNotIn("count", str(self.session.snapshot()["sample"]))
        self.assertEqual(self.session.snapshot()["measurements"], [])
        with self.assertRaises(ValueError):
            self.act("analyze")
        self.act("load")
        self.act("analyze")
        self.act("advance", seconds=0.5)
        self.act("pause")
        self.assertEqual(self.session.results, [])
        self.act("play")
        for _ in range(9):
            self.act("advance", seconds=0.5)
        self.assertFalse(self.session.running)
        result = self.session.results[0]
        self.assertEqual(result["collected_at_hour"], 0)
        self.assertAlmostEqual(result["available_at_hour"], 0.075)
        self.assertEqual(result["count"], result["viable_cell_density_million_ml"] * result["volume_ml"])
        self.assertEqual(result["channels"]["ph"], 7.3)
        self.assertNotIn("do_percent", result["channels"])
        self.assertNotIn("temperature_c", result["channels"])

    def test_frame_partition_does_not_change_scenario_results(self):
        other = Session()
        for session, seconds, steps in [(self.session, 0.25, 40), (other, 0.5, 20)]:
            session.apply(Command(seq=1, action="play"))
            for index in range(steps):
                session.apply(Command(seq=index + 2, action="advance", seconds=seconds))
            session.apply(Command(seq=steps + 2, action="collect"))
        self.assertEqual(self.session.frozen, other.frozen)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.context = patch.dict(sessions, {}, clear=True)
        self.context.start()
        self.addCleanup(self.context.stop)
        self.network = patch("socket.create_connection", side_effect=AssertionError("No external network allowed"))
        self.network.start()
        self.addCleanup(self.network.stop)
        self.client = TestClient(app)

    def create(self):
        response = self.client.post("/api/v1/lab/sessions", headers={**ORIGIN, "x-hemoforge-action": "virtual-lab"})
        self.assertEqual(response.status_code, 201)
        return response.json()

    def test_origin_action_and_controller_authorization(self):
        self.assertEqual(self.client.post("/api/v1/lab/sessions").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/lab/sessions", headers={
            "origin": "https://untrusted.example", "x-hemoforge-action": "virtual-lab"}).status_code, 403)
        remote = TestClient(app, client=("203.0.113.1", 1234))
        self.assertEqual(remote.post("/api/v1/lab/sessions", headers={**ORIGIN,
            "x-hemoforge-action": "virtual-lab"}).status_code, 403)
        session = self.create()
        path = f"/api/v1/lab/sessions/{session['session_id']}/stream"
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(path, headers=ORIGIN) as ws:
                ws.send_json({"role": "controller", "token": "wrong"})
                ws.receive_json()
        self.assertFalse(sessions[session["session_id"]].controller)

    def test_two_windows_receive_same_result_reconnect_and_disconnect_pause(self):
        created = self.create()
        path = f"/api/v1/lab/sessions/{created['session_id']}/stream"
        with self.client.websocket_connect(path, headers=ORIGIN) as viewer:
            viewer.send_json({"role": "viewer"})
            self.assertEqual(viewer.receive_json()["measurements"], [])
            with self.client.websocket_connect(path, headers=ORIGIN) as controller:
                controller.send_json({"role": "controller", "token": created["controller_token"]})
                controller.receive_json()
                for seq, action in enumerate(["collect", "load", "analyze"] + ["advance"] * 10, 1):
                    controller.send_json({"seq": seq, "action": action, "seconds": 0.5})
                    current = controller.receive_json()
                    self.assertEqual(current["ack_seq"], seq)
                self.assertEqual(len(current["measurements"]), 1)
                while True:
                    received = viewer.receive_json()
                    if received["ack_seq"] == 13:
                        break
                self.assertEqual(received["measurements_sha256"], current["measurements_sha256"])
                self.assertNotIn("controller_token", str(received))
                controller.send_json({"seq": 14, "action": "play"})
                self.assertTrue(controller.receive_json()["running"])
            while True:
                received = viewer.receive_json()
                if not received["controller_connected"]:
                    break
            self.assertFalse(received["running"])
        with self.client.websocket_connect(path, headers=ORIGIN) as reopened:
            reopened.send_json({"role": "viewer"})
            self.assertEqual(len(reopened.receive_json()["measurements"]), 1)

    def test_viewers_cannot_write_and_wrong_origins_cannot_subscribe(self):
        created = self.create()
        path = f"/api/v1/lab/sessions/{created['session_id']}/stream"
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(path, headers={"origin": "https://untrusted.example"}):
                pass
        with self.client.websocket_connect(path, headers=ORIGIN) as viewer:
            viewer.send_json({"role": "viewer"})
            viewer.receive_json()
            viewer.send_json({"seq": 1, "action": "play"})
            with self.assertRaises(WebSocketDisconnect):
                viewer.receive_json()
        self.assertFalse(sessions[created["session_id"]].running)

    def test_lost_animation_heartbeat_stops_without_advancing_time(self):
        created = self.create()
        session = sessions[created["session_id"]]
        session.running = True
        session.last_tick = time.monotonic() - 3
        path = f"/api/v1/lab/sessions/{created['session_id']}/stream"
        with self.client.websocket_connect(path, headers=ORIGIN) as viewer:
            viewer.send_json({"role": "viewer"})
            snapshot = viewer.receive_json()
            self.assertFalse(snapshot["running"])
            self.assertEqual(snapshot["culture_hours"], 0)
            self.assertIn("heartbeat", snapshot["reason"])


if __name__ == "__main__":
    unittest.main()
