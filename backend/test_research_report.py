"""Formal report downloads preserve snapshot data and validate bounded input."""

import copy
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.accounts import account_id
from backend.api import app


def report_request():
    return {
        "researcher": "Alex Researcher", "supervisor": "Dr. Morgan Supervisor",
        "institution": "Example Research Laboratory", "notes": "Confirm the next sample manually.",
        "source_added_at": "2026-10-22T08:00:00Z",
        "report": {
            "generated_at": "2026-10-23T08:00:00Z", "checkpoint_hour": 48,
            "data_window": {"from_hour": 45, "through_hour": 48},
            "batch_id": "DEMO-R1", "dataset_id": "software_test_only",
            "quality_flag": "software_test_only", "source_name": "culture-demo.csv", "source_sha256": None,
            "last_measurement_hour": 48, "last_count": 2.61, "change_since_previous": 1.14,
            "new_measurements": 1, "status": "normal", "open_warnings": [],
            "summary": "New measurement at 48h. No configured growth rule triggered.",
            "recommendation": "Await the next source measurement; no equipment action is inferred.",
        },
    }


class ResearchReportTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides[account_id] = lambda: "test-account"

    def tearDown(self):
        app.dependency_overrides.pop(account_id, None)

    def test_download_is_a_pdf_with_unique_document_number(self):
        first = self.client.post("/api/reports/checkpoint.pdf", json=report_request())
        second = self.client.post("/api/reports/checkpoint.pdf", json=report_request())
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.content.startswith(b"%PDF-"))
        self.assertEqual(first.headers["content-type"], "application/pdf")
        self.assertEqual(first.headers["cache-control"], "no-store")
        self.assertRegex(first.headers["content-disposition"], r'filename="HF-RPT-\d{8}-[A-F0-9]{12}\.pdf"')
        self.assertNotEqual(first.headers["content-disposition"], second.headers["content-disposition"])

    def test_requires_a_signed_in_account(self):
        app.dependency_overrides.pop(account_id)
        response = self.client.post("/api/reports/checkpoint.pdf", json=report_request())
        self.assertEqual(response.status_code, 401)

    def test_long_legacy_inputs_and_literal_names_export_safely(self):
        request = report_request()
        request["notes"] = "<b>Literal note & source</b>\n" * 160
        request["researcher"] = "Renée <Researcher> & Team"
        request["institution"] = "Example laboratory " * 8
        request["report"]["source_name"] = "long-source-name-" * 15
        response = self.client.post("/api/reports/checkpoint.pdf", json=request)
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.content), 20_000)

    def test_missing_samples_and_blank_signatories_export_as_a_template(self):
        request = report_request()
        request.update(researcher="", supervisor="", notes="", institution="", source_added_at=None)
        request["report"].update(last_measurement_hour=None, last_count=None, change_since_previous=None, new_measurements=0)
        response = self.client.post("/api/reports/checkpoint.pdf", json=request)
        self.assertEqual(response.status_code, 200)

    def test_generation_date_is_set_by_the_server_and_cannot_be_overridden(self):
        request = report_request()
        request["report"]["generated_at"] = "2000-01-01T00:00:00Z"
        before = datetime.now(timezone.utc)
        with patch("backend.research_report.render_report", return_value=b"%PDF-test") as renderer:
            response = self.client.post("/api/reports/checkpoint.pdf", json=request)
        self.assertEqual(response.status_code, 200)
        generated = renderer.call_args.args[2]
        self.assertLessEqual(before, generated)
        self.assertLessEqual(generated, datetime.now(timezone.utc))
        request["date"] = "2000-01-01"
        self.assertEqual(self.client.post("/api/reports/checkpoint.pdf", json=request).status_code, 422)

    def test_invalid_snapshot_is_rejected(self):
        for field, value in [("source_sha256", "not-a-hash"), ("last_measurement_hour", 72),
                             ("status", "approved"), ("data_window", {"from_hour": 45, "through_hour": 72})]:
            request = copy.deepcopy(report_request())
            request["report"][field] = value
            response = self.client.post("/api/reports/checkpoint.pdf", json=request)
            self.assertEqual(response.status_code, 422, field)


if __name__ == "__main__":
    unittest.main()
