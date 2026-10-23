"""Demo sign-in, profile edits, notifications and account state round-trip through the database."""

import unittest

from fastapi.testclient import TestClient

from backend.api import app
from backend.accounts import hash_password
from backend.db import connect, use_temporary_schema

# Each test gets its own account, so the seeded demo password stays out of the repo.
DEMO = {"username": "tester", "password": "test-only-password"}


class AccountTests(unittest.TestCase):
    def setUp(self):
        use_temporary_schema(self)
        with connect() as db:
            db.execute("INSERT INTO accounts VALUES ('test', %s, %s, 'Test Researcher', '', '', '')",
                       (DEMO["username"], hash_password(DEMO["password"])))
        self.client = TestClient(app)

    def sign_in(self):
        response = self.client.post("/api/auth/login", json=DEMO)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_routes_need_a_session(self):
        for method, path in [("get", "/api/auth/me"), ("get", "/api/notifications"), ("get", "/api/account/state")]:
            self.assertEqual(getattr(self.client, method)(path).status_code, 401, path)

    def test_wrong_password_is_rejected(self):
        response = self.client.post("/api/auth/login", json={**DEMO, "password": "nope"})
        self.assertEqual(response.status_code, 401)

    def test_sign_in_profile_and_sign_out(self):
        self.assertEqual(self.sign_in()["name"], "Test Researcher")
        edited = {"username": "ada", "name": "Ada", "email": "ada@lab.test", "company": "Lab", "role": "Lead"}
        self.assertEqual(self.client.put("/api/account", json=edited).json(), edited)
        self.assertEqual(self.client.get("/api/auth/me").json(), edited)
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={**DEMO, "username": "ada"}).status_code, 200)

    def test_password_change(self):
        self.sign_in()
        wrong = self.client.put("/api/account/password", json={"current": "bad", "next": "longenough"})
        self.assertEqual(wrong.status_code, 403)
        ok = self.client.put("/api/account/password", json={"current": DEMO["password"], "next": "longenough"})
        self.assertEqual(ok.status_code, 204)
        self.assertEqual(self.client.post("/api/auth/login", json=DEMO).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={**DEMO, "password": "longenough"}).status_code, 200)

    def test_notifications_and_state(self):
        self.sign_in()
        for message in ["first", "second"]:
            self.client.post("/api/notifications", json={"message": message, "tone": "info", "page": "data"})
        self.assertEqual([row["message"] for row in self.client.get("/api/notifications").json()], ["second", "first"])
        self.assertEqual(self.client.delete("/api/notifications").status_code, 204)
        self.assertEqual(self.client.get("/api/notifications").json(), [])
        self.assertEqual(self.client.put("/api/account/state/sidebar-updates", json=["guard"]).status_code, 204)
        self.assertEqual(self.client.get("/api/account/state").json(), {"sidebar-updates": ["guard"]})
        self.assertEqual(self.client.put("/api/account/state/Bad Key", json=1).status_code, 422)

    def test_database_health(self):
        self.assertEqual(self.client.get("/api/health/db").json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
