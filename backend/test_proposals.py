"""Proposals from the Work with us form are validated and stored."""

import unittest

from fastapi.testclient import TestClient

from backend.api import app
from backend.db import connect, use_temporary_schema

VALID = {"name": "Ada", "email": "ada@lab.test", "company": "Lab Co", "plan": "Lab", "proposal": "Run a pilot."}


def stored():
    with connect() as db:
        return db.execute("SELECT id, company, plan FROM proposals").fetchall()


class ProposalTests(unittest.TestCase):
    def setUp(self):
        use_temporary_schema(self)
        self.client = TestClient(app)

    def test_valid_proposal_is_stored(self):
        response = self.client.post("/api/proposals", json=VALID)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(stored(), [(response.json()["id"], "Lab Co", "Lab")])

    def test_invalid_proposals_are_rejected(self):
        for change in [{"email": "not-an-email"}, {"plan": "Free"}, {"name": "  "}, {"extra": 1}]:
            response = self.client.post("/api/proposals", json={**VALID, **change})
            self.assertEqual(response.status_code, 422, change)
        self.assertEqual(stored(), [])


if __name__ == "__main__":
    unittest.main()
