"""JEV routes: sign-in, CSRF header, per-account quota, job ownership and safe upstream error mapping."""

import unittest
from unittest import mock
from uuid import uuid4

from fastapi.testclient import TestClient

from backend import jev_routes
from backend.accounts import hash_password
from backend.api import app
from backend.db import connect, use_temporary_schema
from backend.jev_client import JEVError

USERS = [{"username": "alice", "password": "test-only-password"}, {"username": "bob", "password": "test-only-password"}]
HEADERS = {"X-HemoForge-Action": "jev-chat"}


class JEVRouteTests(unittest.TestCase):
    def setUp(self):
        use_temporary_schema(self)
        with connect() as db:
            for user in USERS:
                db.execute("INSERT INTO accounts VALUES (%s, %s, %s, '', '', '', '')",
                           (user["username"], user["username"], hash_password(user["password"])))
        self.client = TestClient(app)
        submit = mock.patch.object(jev_routes.jev_client, "submit", side_effect=lambda _: {"job_id": str(uuid4()), "status": "queued"})
        self.submit = submit.start()
        self.addCleanup(submit.stop)

    def sign_in(self, user=0):
        self.client.cookies.clear()
        self.assertEqual(self.client.post("/api/auth/login", json=USERS[user]).status_code, 200)

    def chat(self, headers=HEADERS):
        return self.client.post("/api/v1/jev/chat", json={"message": "Use OpenBioLLM to explain HbA"}, headers=headers)

    def test_routes_need_a_session(self):
        self.assertEqual(self.client.get("/api/v1/jev/status").status_code, 401)
        self.assertEqual(self.chat().status_code, 401)
        self.assertEqual(self.client.get(f"/api/v1/jev/jobs/{uuid4()}").status_code, 401)

    def test_chat_requires_the_action_header(self):
        self.sign_in()
        self.assertEqual(self.chat(headers={}).status_code, 403)
        self.submit.assert_not_called()

    def test_status_reports_upstream_health_or_503(self):
        self.sign_in()
        with mock.patch.object(jev_routes.jev_client, "health", return_value={"status": "online", "models": ["evo2"], "x": 1}):
            self.assertEqual(self.client.get("/api/v1/jev/status").json(), {"status": "online", "models": ["evo2"]})
        with mock.patch.object(jev_routes.jev_client, "health", side_effect=JEVError("down")):
            self.assertEqual(self.client.get("/api/v1/jev/status").status_code, 503)

    def test_quota_and_job_ownership(self):
        self.sign_in()
        job_ids = []
        for _ in range(jev_routes.DAILY_LIMIT):
            response = self.chat()
            self.assertEqual(response.status_code, 202, response.text)
            job_ids.append(response.json()["job_id"])
        self.assertEqual(self.chat().status_code, 429)
        self.assertEqual(self.submit.call_count, jev_routes.DAILY_LIMIT)

        done = {"status": "completed", "selected_model": "openbiollm", "routing_reason": "Explicit", "result": "text", "error": None}
        with mock.patch.object(jev_routes.jev_client, "get_job", return_value=done):
            mine = self.client.get(f"/api/v1/jev/jobs/{job_ids[0]}")
            self.assertEqual(mine.status_code, 200)
            self.assertEqual(mine.json()["selected_model"], "openbiollm")
            self.sign_in(1)
            self.assertEqual(self.client.get(f"/api/v1/jev/jobs/{job_ids[0]}").status_code, 404)

    def test_failed_submissions_release_their_quota_slot(self):
        self.sign_in()
        self.submit.side_effect = JEVError("bad key", 403)
        self.assertEqual(self.chat().status_code, 502)
        with connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM jev_jobs").fetchone()[0], 0)

    def test_missing_server_key_is_reported(self):
        self.sign_in()
        self.submit.side_effect = jev_routes.JEVKeyMissing("JEV API key is not configured")
        response = self.chat()
        self.assertEqual(response.status_code, 503)
        self.assertIn("not configured", response.json()["detail"])

    def test_expired_upstream_job_is_410(self):
        self.sign_in()
        job_id = self.chat().json()["job_id"]
        with mock.patch.object(jev_routes.jev_client, "get_job", side_effect=JEVError("gone", 404)):
            self.assertEqual(self.client.get(f"/api/v1/jev/jobs/{job_id}").status_code, 410)


if __name__ == "__main__":
    unittest.main()
