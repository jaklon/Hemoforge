"""Uncalibrated, well-mixed batch culture and virtual assay for teaching only.

All constants are scenario assumptions, not BEL-A or Nova instrument estimates.
State units: million cells/mL and mmol/L; time h; working volume mL.
"""

import hashlib
import math
import random
from dataclasses import dataclass, field

MODEL_VERSION = "virtual-culture-flex2-v3"
ASSAY_SECONDS = 8.0
ASSAY_HOURS = 4.5 / 60
ANALYZED_ML = 0.275
INTERVENTION_SECONDS = 4.0
INTERVENTION_HOURS = 3 / 60  # Teaching manipulation interval, not a real pump specification.
FRESH_MEDIUM = (24.0, 4.0, 0.0, 0.0)  # G, Q, L, A in mmol/L; no cells.
MAX_VOLUME_ML = 550.0
SCENARIOS = {
    "balanced": (24.0, 4.0, 0.6, 0.1),
    "nutrient_limited": (4.0, 0.6, 0.6, 0.1),
    "metabolite_stress": (24.0, 4.0, 14.0, 3.0),
}
# Independent simulated analytical SD, not accuracy specs or clinical intervals.
NOISE = {"density_cv": 0.025, "chemistry_cv": 0.02, "ph_sd": 0.01,
         "viability_sd_percentage_points": 0.5}


@dataclass
class Culture:
    scenario: str = "balanced"
    volume_ml: float = 500.0
    withdrawn_ml: float = 0.0
    added_ml: float = 0.0
    exchanged_ml: float = 0.0
    state: list[float] = field(init=False)

    def __post_init__(self):
        # Xv, Xd, glucose, glutamine, lactate, ammonium (operational pool).
        self.state = [1.0, 1 / 49, *SCENARIOS[self.scenario]]

    @staticmethod
    def rates(state):
        x, dead, glucose, glutamine, lactate, ammonium = [max(0, v) for v in state]
        fg, fq = glucose / (1 + glucose), glutamine / (0.3 + glutamine)
        nutrient = fg * fq
        inhibition = 1 / ((1 + lactate / 18) * (1 + ammonium / 4))
        growth = 0.04 * nutrient * inhibition * max(0, 1 - (x + dead) / 20)
        death = 0.0015 + 0.02 * (1 - nutrient) + 0.008 * ammonium / (4 + ammonium)
        # Growth-associated uptake + saturating maintenance; no uptake at zero substrate.
        uptake_g = x * (growth / 0.65 + 0.012 * fg)
        uptake_q = x * (growth / 3.5 + 0.002 * fq)
        decay_q = 0.003 * glutamine
        return [x * (growth - death), x * death - 0.003 * dead,
                -uptake_g, -uptake_q - decay_q, 1.6 * uptake_g,
                0.8 * uptake_q + decay_q]

    def advance(self, hours):
        if not math.isfinite(hours) or not 0 <= hours <= 6:
            raise ValueError("Culture integration interval must be between 0 and 6 hours.")
        # RK4 with <=0.02 h substeps, independent of rendering FPS to numerical tolerance.
        steps = max(1, math.ceil(hours / 0.02))
        dt = hours / steps
        for _ in range(steps):
            y = self.state
            a = self.rates(y)
            b = self.rates([v + dt * k / 2 for v, k in zip(y, a)])
            c = self.rates([v + dt * k / 2 for v, k in zip(y, b)])
            d = self.rates([v + dt * k for v, k in zip(y, c)])
            self.state = [max(0, v + dt * (aa + 2 * bb + 2 * cc + dd) / 6)
                          for v, aa, bb, cc, dd in zip(y, a, b, c, d)]

    def amounts(self):
        # Cells in millions; metabolites in mmol. Used to check sampling conservation.
        return [v * self.volume_ml / (1 if i < 2 else 1000)
                for i, v in enumerate(self.state)]

    def withdraw(self, volume_ml):
        remaining = round(self.volume_ml - volume_ml, 6)
        if not 0.1 <= volume_ml <= 5 or remaining < 400:
            raise ValueError("Sampling would exceed the teaching volume limit (400 mL).")
        self.volume_ml = remaining
        self.withdrawn_ml = round(self.withdrawn_ml + volume_ml, 6)
        # Well-mixed withdrawal removes cells AND solutes proportionally. Density is unchanged.

    def reading(self):
        x, dead, glucose, glutamine, lactate, ammonium = self.state
        return {
            "volume_ml": round(self.volume_ml, 6),
            "viable_cell_density_million_ml": x,
            "channels": {
                "ph": max(6, min(7.6, 7.3 - 0.032 * (lactate - 0.6) - 0.012 * ammonium)),
                "glucose_mmol_l": glucose, "glutamine_mmol_l": glutamine,
                "lactate_mmol_l": lactate, "ammonium_mmol_l": ammonium,
                "viability_percent": 100 * x / max(1e-12, x + dead),
            },
        }

    def intervene(self, kind, amount):
        """Finite-volume mixing; exchange assumes ideal cell retention explicitly."""
        before = self.volume_ml
        if kind == "feed" and amount in (10, 25):
            after = round(before + amount, 6)
            if after > MAX_VOLUME_ML:
                raise ValueError("Feed exceeds the 550 mL working-volume limit.")
            self.state = [v * before / after if i < 2 else
                          (v * before + FRESH_MEDIUM[i - 2] * amount) / after
                          for i, v in enumerate(self.state)]
            self.volume_ml = after
            self.added_ml = round(self.added_ml + amount, 6)
            exchanged = 0.0
        elif kind == "medium_exchange" and amount in (25, 50):
            fraction = amount / 100
            # Cells stay in the vessel under an idealized retention assumption.
            self.state[2:] = [(1 - fraction) * v + fraction * fresh
                             for v, fresh in zip(self.state[2:], FRESH_MEDIUM)]
            exchanged = round(before * fraction, 6)
            self.exchanged_ml = round(self.exchanged_ml + exchanged, 6)
        else:
            raise ValueError("Unsupported teaching intervention preset.")
        return {"volume_before_ml": before, "volume_after_ml": self.volume_ml,
                "added_medium_ml": amount if kind == "feed" else 0,
                "exchanged_medium_ml": exchanged}


def assay_reading(frozen, seed, sample_id):
    """Reproducible measurement noise; frozen aliquot never follows later reactor state."""
    digest = hashlib.sha256(f"{MODEL_VERSION}:{seed}:{sample_id}".encode()).digest()
    rng = random.Random(int.from_bytes(digest, "big"))
    density = round(max(0, frozen["viable_cell_density_million_ml"] *
                        (1 + rng.gauss(0, NOISE["density_cv"]))), 6)
    measured = {}
    for key, value in frozen["channels"].items():
        sd = NOISE["ph_sd"] if key == "ph" else (
            NOISE["viability_sd_percentage_points"] if key == "viability_percent" else
            abs(value) * NOISE["chemistry_cv"])
        measured[key] = round(max(0, min(100 if key == "viability_percent" else 14 if key == "ph" else math.inf,
                                         rng.gauss(value, sd))), 3)
    return {"volume_ml": frozen["volume_ml"], "viable_cell_density_million_ml": density,
            "count": round(density * frozen["volume_ml"], 6), "unit": "million cells",
            "channels": measured, "uncertainty": dict(NOISE)}


def assay_stage(progress):
    # Presentation stages, not a claim about the vendor's internal instrument sequence.
    return "complete" if progress >= 1 else (
        "aspiration" if progress < 0.15 else "chemistry" if progress < 0.65 else
        "cell_count" if progress < 0.9 else "quality_review")
