import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.api import app
from backend.input_files import read_table
from backend.models import ExperimentRequest, GrowthRequest
from backend.predictions import predict_experiments, predict_growth

ROOT = Path(__file__).resolve().parents[1]


def growth_payload():
    return {"samples": [{"hour": 0, "count": 1}, {"hour": 24, "count": 1.6},
                        {"hour": 48, "count": 2.2}, {"hour": 72, "count": 4}],
            "as_of_hour": 48, "horizon": 24, "seed": 42, "source_hash": "a" * 64}


def experiment_payload():
    file = ROOT / "public/examples/hemogpt-example-experiments.csv"
    return {"rows": read_table(file.read_bytes(), file.name, "experiments")}


class PredictionTests(unittest.TestCase):
    def test_growth_is_repeatable_positive_and_uses_no_future_measurements(self):
        payload = growth_payload()
        first = predict_growth(GrowthRequest(**payload))
        payload["samples"][-1]["count"] = 999999
        second = predict_growth(GrowthRequest(**payload))
        self.assertEqual(first["result"], second["result"])
        self.assertNotEqual(first["requestId"], second["requestId"])
        self.assertEqual(first["result"]["measurementCount"], 3)
        self.assertEqual(first["sourceHash"], "a" * 64)
        self.assertTrue(np.all(np.array(first["result"]["paths"]) > 0))
        for row in first["result"]["distribution"]:
            self.assertLessEqual(row["lower95"], row["median"])
            self.assertLessEqual(row["median"], row["upper95"])

    def test_seed_and_horizon_behavior(self):
        payload = growth_payload()
        short = predict_growth(GrowthRequest(**payload))["result"]
        payload["horizon"] = 72
        long = predict_growth(GrowthRequest(**payload))["result"]
        self.assertEqual(short["distribution"], long["distribution"][:25])
        payload["seed"] = 43
        self.assertNotEqual(long["distribution"], predict_growth(GrowthRequest(**payload))["result"]["distribution"])

    def test_between_sample_cutoff_keeps_uncertainty(self):
        payload = growth_payload()
        payload["as_of_hour"] = 50.5
        result = predict_growth(GrowthRequest(**payload))["result"]
        self.assertEqual(result["distribution"][0]["hour"], 50.5)
        self.assertLess(result["distribution"][0]["lower95"], result["distribution"][0]["upper95"])

    def test_bad_growth_data_is_rejected(self):
        for mutation in ("missing", "zero", "duplicate", "early", "outside"):
            payload = growth_payload()
            if mutation == "missing": payload["samples"][1]["count"] = None
            if mutation == "zero": payload["samples"][1]["count"] = 0
            if mutation == "duplicate": payload["samples"][1]["hour"] = 0
            if mutation == "early": payload["as_of_hour"] = 24
            if mutation == "outside": payload["as_of_hour"] = 100
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                predict_growth(GrowthRequest(**payload))

    def test_gp_fits_uploaded_outcomes_and_evaluates_whole_conditions(self):
        payload = experiment_payload()
        result = predict_experiments(ExperimentRequest(**payload))["result"]
        self.assertEqual(len(result["ranked"]), 4)
        self.assertEqual(len(result["validation"]), 4)
        self.assertTrue(all(row["n"] == 3 for row in result["ranked"]))
        self.assertTrue(all(row["uncertainty"] >= 0 and row["ei"] >= 0 for row in result["ranked"]))
        payload["rows"][0]["response"] = 20
        changed = predict_experiments(ExperimentRequest(**payload))["result"]
        self.assertNotEqual(result["mae"], changed["mae"])
        self.assertNotEqual(result["ranked"], changed["ranked"])

    def test_gp_rejects_mixed_units_and_conflicting_replicates(self):
        for field, value in [("response_unit", "wrong_unit"), ("lactate_mg_l", 12)]:
            payload = experiment_payload()
            payload["rows"][0][field] = value
            with self.assertRaises(ValidationError):
                ExperimentRequest(**payload)

    def test_file_formats_and_limits(self):
        text = "batch_id,elapsed_hours,cell_count_million\nA,0,1\n"
        for name, content in [("x.csv", text.encode()), ("x.tsv", text.replace(",", "\t").encode()),
                              ("x.json", json.dumps([{"batch_id": "A", "elapsed_hours": 0, "cell_count_million": 1}]).encode())]:
            self.assertEqual(len(read_table(content, name, "culture")), 1)
        for content in [b"", b"x" * (2 * 1024 * 1024 + 1), b"x,x\n1,2", b"batch_id,elapsed_hours,cell_count_million\nA,0"]:
            with self.assertRaises(ValueError):
                read_table(content, "x.csv", "culture")


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_api_predicts_and_serializes_both_models(self):
        self.assertEqual(self.client.get("/api/health").json()["status"], "ok")
        for route, data in [("growth", growth_payload()), ("experiments", experiment_payload())]:
            response = self.client.post("/api/predict/" + route, json=data)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["engine"], "python-numpy")
            self.assertEqual(len(response.json()["requestId"]), 64)
            json.dumps(response.json(), allow_nan=False)

    def test_invalid_requests_return_useful_errors_without_echoing_data(self):
        payload = growth_payload()
        payload["seed"] = 1.5
        payload["private_field"] = "PRIVATE_INPUT_SHOULD_NOT_APPEAR"
        response = self.client.post("/api/predict/growth", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn("seed", response.json()["detail"])
        self.assertNotIn("PRIVATE_INPUT", response.text)
        payload = growth_payload()
        payload["samples"][0]["count"] = 0
        self.assertEqual(self.client.post("/api/predict/growth", json=payload).status_code, 422)


class StreamlitTests(unittest.TestCase):
    def test_streamlit_uses_api_for_both_example_workflows(self):
        from streamlit.testing.v1 import AppTest
        client = TestClient(app)
        requests = []

        def local_api(request, timeout):
            route = request.full_url.removeprefix("http://127.0.0.1:8000")
            requests.append(route)
            response = client.post(route, json=json.loads(request.data))
            self.assertEqual(response.status_code, 200, response.text)
            return io.BytesIO(response.content)

        with patch("urllib.request.urlopen", local_api):
            at = AppTest.from_file(str(ROOT / "streamlit_app.py"), default_timeout=20).run()
            self.assertEqual(len(at.exception), 0)
            at.button[0].click().run()
            self.assertEqual(len(at.exception), 0)
            self.assertEqual(len(at.success), 1)
            at.selectbox[0].select("Experiment response").run()
            at.button[0].click().run()
            self.assertEqual(len(at.exception), 0)
            self.assertEqual(len(at.success), 1)
        self.assertEqual(requests, ["/api/predict/growth", "/api/predict/experiments"])


if __name__ == "__main__":
    unittest.main()
