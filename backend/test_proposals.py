"""Proposals from the Work with us form are validated and stored."""

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from backend import proposals
from backend.api import app

VALID = {"name": "Ada", "email": "ada@lab.test", "company": "Lab Co", "plan": "Lab", "proposal": "Run a pilot."}


class ProposalTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / "proposals.sqlite3"
        patch = mock.patch.object(proposals, "DATABASE", self.database)
        patch.start()
        self.addCleanup(patch.stop)
        self.client = TestClient(app)

    def test_valid_proposal_is_stored(self):
        response = self.client.post("/api/proposals", json=VALID)
        self.assertEqual(response.status_code, 201)
        db = sqlite3.connect(self.database)
        rows = db.execute("SELECT id, company, plan FROM proposals").fetchall()
        db.close()
        self.assertEqual(rows, [(response.json()["id"], "Lab Co", "Lab")])

    def test_invalid_proposals_are_rejected(self):
        for change in [{"email": "not-an-email"}, {"plan": "Free"}, {"name": "  "}, {"extra": 1}]:
            response = self.client.post("/api/proposals", json={**VALID, **change})
            self.assertEqual(response.status_code, 422, change)
        self.assertFalse(self.database.exists())


if __name__ == "__main__":
    unittest.main()
