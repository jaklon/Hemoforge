"""Queued scans are validated before any model would see them."""

import base64
import unittest

from fastapi.testclient import TestClient

from backend.api import app

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 20).decode()


def request(**file):
    return {"kind": "culture", "files": [{"name": "sheet.png", "type": "image/png", "data": PNG, **file}]}


class DocumentScanTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_valid_upload_reports_missing_model(self):
        response = self.client.post("/api/documents/convert", json=request())
        self.assertEqual(response.status_code, 503)
        self.assertIn("No vision model", response.json()["detail"])

    def test_rejects_mismatched_or_unsupported_files(self):
        for change in [{"type": "application/pdf"}, {"data": "not base64!"}, {"type": "text/csv"}]:
            response = self.client.post("/api/documents/convert", json=request(**change))
            self.assertEqual(response.status_code, 422, change)

    def test_rejects_empty_batch(self):
        response = self.client.post("/api/documents/convert", json={"kind": "culture", "files": []})
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
