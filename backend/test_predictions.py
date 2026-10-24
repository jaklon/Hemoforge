import csv
import json
import unittest

import numpy as np
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.api import app
from backend.models import ExperimentRequest, GrowthRequest
from backend.predictions import predict_experiments, predict_growth



def growth_payload():
    return {"samples": [{"hour": 0, "count": 1}, {"hour": 24, "count": 1.6},
                        {"hour": 48, "count": 2.2}, {"hour": 72, "count": 4}],
            "as_of_hour": 48, "horizon": 24, "seed": 42, "source_hash": "a" * 64}


# A 2x2 lactate/ammonia spiking study: here the metabolites are factors, not outputs.
SPIKING_CSV = """condition_id,lactate_mg_l,ammonia_mg_l,response,response_unit
L0-A0,0,0,7.5,fold_change
L0-A0,0,0,7.8,fold_change
L0-A0,0,0,8.1,fold_change
L850-A0,850,0,4.9,fold_change
L850-A0,850,0,5.3,fold_change
L850-A0,850,0,5.6,fold_change
L0-A41,0,41,6.1,fold_change
L0-A41,0,41,6.4,fold_change
L0-A41,0,41,6.7,fold_change
L850-A41,850,41,3.6,fold_change
L850-A41,850,41,3.9,fold_change
L850-A41,850,41,4.2,fold_change
"""


def experiment_payload():
    return {"rows": list(csv.DictReader(SPIKING_CSV.splitlines()))}


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

    def test_custom_growth_controls_change_execution_and_fingerprint(self):
        payload = growth_payload()
        payload.update(horizon=37, path_count=123, drift_override=0.01, volatility_override=0, lookback_hours=48)
        result = predict_growth(GrowthRequest(**payload))
        self.assertEqual(len(result["result"]["paths"]), 123)
        self.assertEqual(len(result["result"]["distribution"]), 38)
        self.assertTrue(result["result"]["scenarioOverrides"])
        self.assertAlmostEqual(result["result"]["distribution"][-1]["median"], 2.2 * np.exp(0.37))
        self.assertEqual(result["result"]["fittedLogDrift"], np.log(2.2) / 48)
        previous = result["requestId"]
        payload["path_count"] = 124
        self.assertNotEqual(previous, predict_growth(GrowthRequest(**payload))["requestId"])
        payload["lookback_hours"] = 1
        with self.assertRaises(ValueError):
            predict_growth(GrowthRequest(**payload))
        payload.update(horizon=720, path_count=2000)
        with self.assertRaises(ValidationError):
            GrowthRequest(**payload)

    def test_custom_gp_parameters_change_estimates_and_ranking(self):
        payload = experiment_payload()
        first = predict_experiments(ExperimentRequest(**payload))
        payload.update(length_scale=1.2, noise_sd=0.2, exploration=0.1, objective="minimize")
        changed = predict_experiments(ExperimentRequest(**payload))
        self.assertNotEqual(first["result"]["ranked"], changed["result"]["ranked"])
        self.assertNotEqual(first["requestId"], changed["requestId"])
        self.assertIn("1.2", changed["result"]["method"])

    def test_lookback_can_exclude_invalid_older_observations(self):
        payload = growth_payload()
        payload["as_of_hour"] = 72
        payload["samples"][0]["count"] = None
        payload["lookback_hours"] = 48
        result = predict_growth(GrowthRequest(**payload))["result"]
        self.assertEqual(result["measurementCount"], 3)
        payload["lookback_hours"] = None
        with self.assertRaises(ValueError):
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

    def test_gp_noise_comes_from_replicates_and_grid_proposes_new_conditions(self):
        payload = experiment_payload()
        result = predict_experiments(ExperimentRequest(**payload))["result"]
        # Demo replicate variances are 0.09, 0.1233, 0.09, 0.09: pooled SD sqrt(0.0983) with 8 df.
        self.assertEqual(result["noise"]["source"], "replicates")
        self.assertAlmostEqual(result["noise"]["sd"], (0.39333 / 4) ** 0.5, places=3)
        self.assertEqual(result["noise"]["dof"], 8)
        self.assertEqual(len(result["candidates"]), 25)
        self.assertEqual(sum(row["tested"] for row in result["candidates"]), 4)
        self.assertTrue(any(not row["tested"] and row["ei"] > 0 for row in result["candidates"]))
        for row in result["candidates"]:
            self.assertTrue(0 <= row["factors"]["lactate_mg_l"] <= 850 and 0 <= row["factors"]["ammonia_mg_l"] <= 41)
            self.assertEqual(row["metabolites"], {})
        # Replicate noise is far wider than the old fixed 0.05 normalized SD.
        self.assertTrue(all(row["uncertainty"] > 0.1 for row in result["ranked"]))
        payload["noise_sd"] = 0.05
        fixed = predict_experiments(ExperimentRequest(**payload))["result"]
        self.assertEqual(fixed["noise"]["source"], "setting")
        single = [row for i, row in enumerate(experiment_payload()["rows"]) if i % 3 == 0]
        default = predict_experiments(ExperimentRequest(rows=single))["result"]
        self.assertEqual(default["noise"]["source"], "default")

    def test_gp_rejects_mixed_units_and_conflicting_replicates(self):
        for field, value in [("response_unit", "wrong_unit"), ("lactate_mg_l", 12)]:
            payload = experiment_payload()
            payload["rows"][0][field] = value
            with self.assertRaises(ValidationError):
                ExperimentRequest(**payload)

    def test_medium_factors_with_measured_metabolites(self):
        rows = []
        for i, (epo, scf, glucose) in enumerate([(1, 10, 10), (5, 10, 25), (1, 100, 25), (5, 100, 10), (3, 55, 17.5)]):
            for r in range(2):
                rows.append({"condition_id": f"C{i}", "epo_iu_ml": epo, "scf_ng_ml": scf, "glucose_mmol_l": glucose,
                             "response": 4 + epo * 0.3 + scf * 0.01 + r * 0.2, "response_unit": "fold_change",
                             "measured_lactate_mg_l": 600 + glucose * 30 + r * 10, "measured_ammonia_mg_l": 40 + glucose})
        result = predict_experiments(ExperimentRequest(rows=rows))["result"]
        self.assertEqual(result["factorNames"], ["epo_iu_ml", "glucose_mmol_l", "scf_ng_ml"])
        self.assertEqual(result["gridSize"], 125)
        self.assertEqual(len(result["candidates"]), 50)
        best = result["candidates"][0]
        self.assertEqual(set(best["factors"]), set(result["factorNames"]))
        # Lactate tracks glucose in this fixture, so the GP should predict it inside the observed range.
        self.assertTrue(800 <= best["metabolites"]["lactate_mg_l"] <= 1400)
        rows[0]["measured_lactate_mg_l"] = None
        rows[1]["measured_lactate_mg_l"] = None
        partial = predict_experiments(ExperimentRequest(rows=rows))["result"]
        self.assertNotIn("lactate_mg_l", partial["candidates"][0]["metabolites"])
        rows[0]["scf_ng_ml"] = None
        with self.assertRaises(ValidationError):
            ExperimentRequest(rows=rows)
        del rows[0]["scf_ng_ml"]
        with self.assertRaises(ValidationError):
            ExperimentRequest(rows=rows)


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


if __name__ == "__main__":
    unittest.main()
