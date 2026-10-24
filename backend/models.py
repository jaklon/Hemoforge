from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Measurement(InputModel):
    hour: float = Field(ge=0, le=100_000)
    count: float | None
    unit: Literal["million cells"] = "million cells"


class GrowthRequest(InputModel):
    samples: list[Measurement] = Field(min_length=3, max_length=10_000)
    as_of_hour: float = Field(ge=0, le=100_000)
    horizon: Annotated[int, Field(strict=True, ge=1, le=720)] = 72
    path_count: Annotated[int, Field(strict=True, ge=10, le=2000)] = 500
    lookback_hours: float | None = Field(default=None, gt=0, le=100_000)
    drift_override: float | None = Field(default=None, ge=-1, le=1)
    volatility_override: float | None = Field(default=None, ge=0, le=2)
    seed: Annotated[int, Field(strict=True, ge=0, le=2_147_483_647)] = 42
    source_hash: str = Field(default="", max_length=64, pattern=r"^([a-fA-F0-9]{64})?$")

    @model_validator(mode="after")
    def bounded_work(self):
        if self.path_count * (self.horizon + 1) > 250_000:
            raise ValueError("Use fewer paths or a shorter horizon: at most 250,000 path points per local run.")
        return self


FactorName = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,40}$")]
MEASURED_OUTPUTS = ("measured_lactate_mg_l", "measured_ammonia_mg_l")


class ExperimentRow(InputModel):
    condition_id: str = Field(min_length=1, max_length=120)
    # Settings chosen by the researcher, e.g. {"epo_iu_ml": 3}. Lactate and ammonia
    # belong here only in a spiking study; otherwise they are measured outputs.
    factors: dict[FactorName, Annotated[float, Field(ge=0)]] = Field(min_length=1, max_length=6)
    response: float
    response_unit: str = Field(min_length=1, max_length=80)
    measured_lactate_mg_l: float | None = Field(default=None, ge=0)
    measured_ammonia_mg_l: float | None = Field(default=None, ge=0)

    @model_validator(mode="before")
    @classmethod
    def flat_factors(cls, data):
        """Accept flat CSV-style rows: every unreserved column is a factor."""
        if isinstance(data, dict) and "factors" not in data:
            reserved = {"condition_id", "response", "response_unit", *MEASURED_OUTPUTS}
            data = {**{k: v for k, v in data.items() if k in reserved},
                    "factors": {k: v for k, v in data.items() if k not in reserved}}
        return data


class ExperimentRequest(InputModel):
    rows: list[ExperimentRow] = Field(min_length=3, max_length=10_000)
    objective: Literal["maximize", "minimize"] = "maximize"
    length_scale: float = Field(default=0.6, ge=0.001, le=100)
    noise_sd: float | None = Field(default=None, ge=0.0001, le=10)
    exploration: float = Field(default=0.01, ge=0, le=1_000_000)
    source_hash: str = Field(default="", max_length=64, pattern=r"^([a-fA-F0-9]{64})?$")

    @model_validator(mode="after")
    def consistent_conditions(self):
        settings = {}
        units = {row.response_unit for row in self.rows}
        if len(units) != 1:
            raise ValueError("Keep the same response unit for every experiment.")
        if len({tuple(sorted(row.factors)) for row in self.rows}) != 1:
            raise ValueError("Every experiment row must set the same factors.")
        for row in self.rows:
            value = row.factors
            if row.condition_id in settings and settings[row.condition_id] != value:
                raise ValueError("Replicates of a condition must use the same settings.")
            settings[row.condition_id] = value
        if not 3 <= len(settings) <= 60:
            raise ValueError("Use 3 to 60 distinct experimental conditions.")
        return self
