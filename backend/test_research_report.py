"""Reports come from automated Dashboard corrections or saved HemoBot analyses, and export as PDFs."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.accounts import account_id
from backend.api import app
from backend.db import use_temporary_schema
from backend.research_report import AutomatedAction, Report, Signatories, automated_content, render_report


def action(**changes):
    return {"batch_id": "DEMO-R1", "hour": 37, "variable": "Glucose", "unit": "g/L", "side": "low", "limit": 1.5,
            "action": "Glucose feed bolus", "before": 1.48, "after": 3.48, "digits": 2, **changes}


analysis = {
    "context": {"batch_id": "DEMO-R1", "replay_elapsed_hours": 96},
    "request": {"query_en": "Explain the open warnings."},
    "analysis": {
        "response_id": "hemobot-" + "a" * 32, "generated_at": "2026-10-24T07:00:00Z", "llm_engine": "template",
        "execution_status": "fallback", "evidence_quality": "software_test_only", "fallback_reason": None,
        "summary_headline": "Two warnings need manual review", "active_modules_used": ["guard"],
        "cards": [{"module": "guard", "title": "Bioreactor Guard", "status": "warning",
                   "statements": ["Growth slowed after 72h."], "citation_ids": []}],
        "suggested_actions": ["Re-count the 96h sample."],
        "citations": [{"module": "Bioreactor Guard", "reference": "Built-in culture demo",
                       "study_id": "independent-culture-input", "evidence": "software_test_only", "measured_at": 96}],
        "mandatory_scientific_disclaimers": ["Warnings describe trends; they do not diagnose contamination."],
        "analysis_fingerprint": "f" * 64,
    },
}


class ReportStoreTests(unittest.TestCase):
    def setUp(self):
        use_temporary_schema(self)
        self.client = TestClient(app)
        app.dependency_overrides[account_id] = lambda: "demo"
        self.addCleanup(app.dependency_overrides.pop, account_id, None)

    def test_automated_actions_become_reports_once(self):
        body = {"actions": [action(hour=52, variable="Lactate", side="high", limit=20,
                                             action="Medium exchange", before=20.3, after=12.2, unit="mM"), action()]}
        self.assertEqual(self.client.post("/api/reports/automated", json=body).json(), {"created": 2})
        self.assertEqual(self.client.post("/api/reports/automated", json=body).json(), {"created": 0})
        reports = self.client.get("/api/reports").json()
        self.assertEqual([report["title"] for report in reports],
                         ["Medium exchange · Lactate", "Glucose feed bolus · Glucose"])
        glucose = reports[1]
        self.assertEqual((glucose["kind"], glucose["source"], glucose["status"], glucose["hour"]),
                         ("automated", "Dashboard", "action", 37))
        self.assertIn("At 37 h of culture, Glucose decreased to 1.48 g/L, reaching the low action limit of 1.50 g/L",
                      glucose["summary"])
        self.assertIn("Correction: 1.48 g/L → 3.48 g/L", glucose["lines"])
        self.assertEqual([section["heading"] for section in glucose["sections"]],
                         ["Purpose", "Observation", "Action taken", "Assessment", "Recommendation", "Limitations"])
        self.assertIsNone(glucose["chart"])

    def test_hemobot_analysis_is_saved_from_the_audit_store(self):
        response_id = "hemobot-" + "a" * 32
        with patch("backend.research_report.AuditStore.get", return_value=analysis):
            first = self.client.post("/api/reports/hemobot", json={"response_id": response_id}).json()
            again = self.client.post("/api/reports/hemobot", json={"response_id": response_id}).json()
        self.assertEqual(first["number"], again["number"])
        self.assertEqual((first["source"], first["status"], first["batch_id"], first["hour"]),
                         ("HemoBot · Bioreactor Guard", "warning", "DEMO-R1", 96))
        findings = next(section for section in first["sections"] if section["heading"] == "Findings")
        self.assertEqual(findings["paragraphs"], ["Bioreactor Guard (status: warning). Growth slowed after 72h."])
        actions = next(section for section in first["sections"] if section["heading"] == "Recommended review actions")
        self.assertEqual(actions["paragraphs"], ["• Re-count the 96h sample."])
        self.assertIn("Explain the open warnings.", first["summary"])
        with patch("backend.research_report.AuditStore.get", return_value=None):
            missing = self.client.post("/api/reports/hemobot", json={"response_id": "hemobot-" + "b" * 32})
        self.assertEqual(missing.status_code, 404)

    def test_pdf_download_and_other_accounts_cannot_see_reports(self):
        self.client.post("/api/reports/automated", json={"actions": [action()]})
        number = self.client.get("/api/reports").json()[0]["number"]
        pdf = self.client.get(f"/api/reports/{number}/pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF-"))
        self.assertEqual(pdf.headers["content-disposition"], f'attachment; filename="{number}.pdf"')
        app.dependency_overrides[account_id] = lambda: "pocdemo"
        self.assertEqual(self.client.get("/api/reports").json(), [])
        self.assertEqual(self.client.get(f"/api/reports/{number}/pdf").status_code, 404)

    def test_saved_sign_off_names_are_printed_on_every_report(self):
        empty = self.client.get("/api/reports/signatories").json()
        self.assertEqual(empty, {"researcher": "", "supervisor": "", "institution": "Sanguis Biofactory Lab"})
        saved = self.client.put("/api/reports/signatories",
                                json={"researcher": " Alex Researcher ", "supervisor": "Dr. Morgan Supervisor"})
        self.assertEqual(saved.json(), {"researcher": "Alex Researcher", "supervisor": "Dr. Morgan Supervisor",
                                        "institution": "Sanguis Biofactory Lab"})
        self.assertEqual(self.client.get("/api/reports/signatories").json(), saved.json())
        self.client.post("/api/reports/automated", json={"actions": [action()]})
        number = self.client.get("/api/reports").json()[0]["number"]
        with patch("backend.research_report.render_report", return_value=b"%PDF-test") as renderer:
            self.client.get(f"/api/reports/{number}/pdf")
        self.assertEqual(renderer.call_args.args[1].model_dump(), saved.json())
        # Another account keeps its own names.
        app.dependency_overrides[account_id] = lambda: "pocdemo"
        self.assertEqual(self.client.get("/api/reports/signatories").json()["researcher"], "")
        too_long = self.client.put("/api/reports/signatories", json={"researcher": "x" * 121})
        self.assertEqual(too_long.status_code, 422)


class ReportRequestTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_requires_a_signed_in_account(self):
        self.assertEqual(self.client.get("/api/reports").status_code, 401)
        self.assertEqual(self.client.post("/api/reports/automated", json={"actions": [action()]}).status_code, 401)

    def test_invalid_input_is_rejected(self):
        app.dependency_overrides[account_id] = lambda: "demo"
        self.addCleanup(app.dependency_overrides.pop, account_id, None)
        for change in [{"side": "middle"}, {"hour": -1}, {"variable": ""}, {"extra": 1}]:
            response = self.client.post("/api/reports/automated", json={"actions": [action(**change)]})
            self.assertEqual(response.status_code, 422, change)
        bad_id = self.client.post("/api/reports/hemobot", json={"response_id": "../etc/passwd"})
        self.assertEqual(bad_id.status_code, 422)

    def test_long_content_and_literal_markup_flow_onto_more_pages(self):
        report = Report(number="HF-RPT-20261024-ABCDEF123456", created_at=datetime.now(timezone.utc),
                        kind="hemobot", source="HemoBot · All modules", batch_id="DEMO-R1", hour=None,
                        status="normal", title="<b>Literal</b> & title", summary="Summary " * 200,
                        lines=["<i>line</i> & more " * 20] * 40)
        pdf = render_report(report, Signatories(researcher="Renée <Researcher> & Team"))
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertGreater(pdf.count(b"/Type /Page\n"), 1)

    def test_assessment_follows_the_values_after_the_correction(self):
        points = [(36, 1.6), (37, 3.48), (40, 3.3)]
        _, _, sections, chart = automated_content(AutomatedAction(**action(warning=2, points=points)))
        assessment = next(section for section in sections if section.heading == "Assessment").paragraphs[0]
        self.assertIn("By 40 h", assessment)
        self.assertIn("within the warning limit of 2.00 g/L", assessment)
        self.assertEqual((chart.marker, [label for label, _ in chart.limits]),
                         (37, ["Low action limit", "Low warning limit"]))
        _, _, sections, _ = automated_content(AutomatedAction(**action(warning=2, points=[(37, 1.4), (40, 1.2)])))
        self.assertIn("still outside", next(section for section in sections if section.heading == "Assessment").paragraphs[0])
        report = Report(number="HF-RPT-20261024-ABCDEF123457", created_at=datetime.now(timezone.utc),
                        kind="automated", source="Dashboard", batch_id="DEMO-R1", hour=37, status="action",
                        title="Glucose feed bolus · Glucose", summary="Summary", lines=[], sections=sections,
                        chart=chart)
        self.assertTrue(render_report(report, Signatories()).startswith(b"%PDF-"))


if __name__ == "__main__":
    unittest.main()
