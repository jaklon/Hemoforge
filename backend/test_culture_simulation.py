"""Offline scientific invariants, not a claim of experimental model validation."""

import math
import unittest

from backend.culture_simulation import Culture, assay_reading
from backend.virtual_lab import ANALYSIS_SECONDS, Command, Session


class CultureTests(unittest.TestCase):
    def test_well_mixed_sampling_conserves_removed_cells_and_metabolites(self):
        culture = Culture()
        before = culture.amounts()
        concentration = culture.state.copy()
        culture.withdraw(3)
        self.assertEqual(culture.state, concentration)
        self.assertEqual(culture.volume_ml, 497)
        self.assertEqual(culture.withdrawn_ml, 3)
        for original, remaining in zip(before, culture.amounts()):
            self.assertAlmostEqual(remaining, original * 497 / 500, places=10)
        with self.assertRaises(ValueError):
            culture.withdraw(100)
        self.assertEqual(culture.volume_ml, 497)

    def test_volume_floor_handles_decimal_withdrawals_without_roundoff_rejection(self):
        culture = Culture(volume_ml=400.2)
        culture.withdraw(0.1)
        culture.withdraw(0.1)
        self.assertEqual(culture.volume_ml, 400)
        with self.assertRaises(ValueError):
            culture.withdraw(0.1)
        self.assertEqual(culture.volume_ml, 400)

    def test_glucose_lactate_yield_and_glutamine_ammonium_balance(self):
        culture = Culture()
        initial = culture.state.copy()
        culture.advance(6)
        x, dead, g, q, lactate, ammonium = culture.state
        self.assertGreater(x, initial[0])
        self.assertGreater(dead, initial[1])
        self.assertLess(g, initial[2])
        self.assertLess(q, initial[3])
        self.assertAlmostEqual(lactate - initial[4], 1.6 * (initial[2] - g), places=10)
        # Ammonium yield is .8 of metabolic Gln uptake and 1 of spontaneous decay.
        self.assertGreaterEqual(ammonium - initial[5], 0.8 * (initial[3] - q))
        self.assertLessEqual(ammonium - initial[5], initial[3] - q)

    def test_nutrient_and_metabolite_scenarios_change_growth_and_remain_physical(self):
        runs = [Culture(name) for name in ("balanced", "nutrient_limited", "metabolite_stress")]
        for culture in runs:
            for _ in range(28):
                culture.advance(6)
                self.assertTrue(all(math.isfinite(v) and v >= 0 for v in culture.state))
                self.assertTrue(0 <= culture.reading()["channels"]["viability_percent"] <= 100)
        self.assertGreater(runs[0].state[0], runs[1].state[0])
        self.assertGreater(runs[0].state[0], runs[2].state[0])
        no_food = Culture()
        no_food.state[2:4] = [0, 0]
        no_food.advance(6)
        self.assertLess(no_food.state[0], 1)
        self.assertEqual(no_food.state[2:4], [0, 0])

    def test_irregular_frame_partition_is_numerically_stable(self):
        full, split = Culture(), Culture()
        full.advance(6)
        for h in (0.713, 1.428, 0.003, 3.856):
            split.advance(h)
        for a, b in zip(full.state, split.state):
            self.assertAlmostEqual(a, b, places=9)

    def test_seeded_noise_is_reproducible_and_does_not_mutate_frozen_sample(self):
        frozen = Culture().reading()
        first = assay_reading(frozen, 42, "FLEX2-001")
        self.assertEqual(first, assay_reading(frozen, 42, "FLEX2-001"))
        self.assertNotEqual(first, assay_reading(frozen, 43, "FLEX2-001"))
        self.assertNotEqual(first, assay_reading(frozen, 42, "FLEX2-002"))
        self.assertEqual(frozen, Culture().reading())


class AssayTests(unittest.TestCase):
    def act(self, session, action, **values):
        session.apply(Command(seq=session.seq + 1, action=action, **values))

    def finish(self, session):
        self.act(session, "load")
        self.act(session, "analyze")
        for _ in range(int(ANALYSIS_SECONDS / 0.5)):
            self.act(session, "advance", seconds=0.5)

    def test_failed_qc_never_reaches_guard_and_volume_is_not_returned(self):
        session = Session()
        self.act(session, "collect", volume_ml=0.1, mixed=False)
        self.assertEqual(session.snapshot()["working_volume_ml"], 499.9)
        self.assertNotIn("channels", session.snapshot()["sample"])
        self.finish(session)
        self.assertEqual(session.results, [])
        self.assertEqual(session.assays[0]["quality"], {"status": "rejected", "flags": [
            "insufficient_sample_volume", "sample_not_mixed"]})
        self.assertNotIn("count", session.assays[0])
        self.assertEqual(session.culture.volume_ml, 499.9)
        self.act(session, "collect", volume_ml=1)
        self.finish(session)
        self.assertEqual(len(session.assays), 2)
        self.assertEqual(len(session.results), 1)
        self.assertEqual(session.results[0]["sample_id"], "FLEX2-002")
        self.assertEqual(session.results[0]["volume_ml"], 498.9)

    def test_collection_retransmission_does_not_withdraw_twice_and_report_cap_includes_failures(self):
        session = Session()
        command = Command(seq=1, action="collect", volume_ml=0.1)
        session.apply(command)
        session.apply(command)
        self.assertEqual(session.culture.volume_ml, 499.9)
        self.finish(session)
        for _ in range(99):
            self.act(session, "collect", volume_ml=0.1)
            self.finish(session)
        self.assertEqual(len(session.assays), 100)
        self.assertEqual(session.results, [])
        self.assertEqual(session.culture.volume_ml, 490)
        with self.assertRaises(ValueError):
            self.act(session, "collect", volume_ml=1)
        self.assertEqual(session.culture.volume_ml, 490)

    def test_reactor_evolves_during_assay_but_released_sample_stays_frozen(self):
        session = Session(seed=17)
        self.act(session, "collect", volume_ml=3)
        frozen = session.frozen
        expected = assay_reading(frozen, 17, "FLEX2-001")
        self.finish(session)
        self.assertNotEqual(frozen, session.culture.reading())
        self.assertEqual(session.results[0]["channels"], expected["channels"])
        self.assertEqual(session.results[0]["count"], expected["count"])
        self.act(session, "play")
        self.act(session, "advance", seconds=0.5)
        self.assertEqual(session.results[0]["channels"], expected["channels"])

    def test_boundary_assay_preserves_full_delay_and_can_resume_after_pause(self):
        session = Session(hour=168)
        self.act(session, "collect")
        self.act(session, "load")
        self.act(session, "analyze")
        self.act(session, "advance", seconds=0.5)
        self.act(session, "pause")
        self.act(session, "play")
        for _ in range(int(ANALYSIS_SECONDS / 0.5) - 1):
            self.act(session, "advance", seconds=0.5)
        self.assertAlmostEqual(session.results[0]["available_at_hour"], 168.075)
        with self.assertRaises(ValueError):
            self.act(session, "play")
        with self.assertRaises(ValueError):
            self.act(session, "collect")


if __name__ == "__main__":
    unittest.main()
