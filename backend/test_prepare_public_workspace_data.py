import unittest

from backend.prepare_public_workspace_data import culture_rows, experiment_rows


class PublicWorkspaceConversionTests(unittest.TestCase):
    def test_growth_sheet_converts_days_units_and_skips_mean_block(self):
        growth = {
            3: ["A", "Cell count/ml (x10^6)", "Fold Change", "Culture time", "Glucose", "Glutamine", "Lactate", "Ammonia"],
            4: ["", "0.15", "1", "00:00:00", "1801.6", "1461.5", "0", "17.03"],
            5: ["", "0.465", "3.1", "1", "1801.6", "1461.5", "890.7", "17.03"],
            6: [""],
            7: ["Mean", "Cell count/ml (x10E6)", "", "", "", "", "", ""],
            8: ["", "9", "1", "1", "1", "1", "1", "1"],
        }
        rows = culture_rows(growth, volume_ml=2)
        self.assertEqual([row["batch_id"] for row in rows], ["BATH-01456-A", "BATH-01456-A"])
        self.assertEqual([row["elapsed_hours"] for row in rows], [0.0, 24.0])
        self.assertEqual(rows[1]["cell_count_million"], 0.93)
        self.assertEqual((rows[1]["glucose_mmol_l"], rows[1]["lactate_mmol_l"], rows[1]["ammonia_mmol_l"]), (10.0, 10.0, 1.0))

    def test_doe_sheet_stops_before_metabolite_measurement_table(self):
        doe = {
            3: ["", "order", "run order", "lactate mg/l", "ammonia mg/l", "live cells x10^5"],
            4: ["", "11", "1", "850", "0", "6.03"],
            5: ["", "12", "2", "850", "41", "5.5"],
            17: ["", "Condition (mg/L)", "", "", "0  h"],
            19: ["", "850", "0", "1", "881.6", "5.77"],
        }
        rows = experiment_rows(doe)
        self.assertEqual([row["condition_id"] for row in rows], ["L850-A0", "L850-A41"])
        self.assertEqual(rows[1]["response"], 5.5)


if __name__ == "__main__":
    unittest.main()
