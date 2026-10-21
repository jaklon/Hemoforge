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
    horizon: Literal[24, 48, 72] = 72
    seed: Annotated[int, Field(strict=True, ge=0, le=2_147_483_647)] = 42
    source_hash: str = Field(default="", max_length=64, pattern=r"^([a-fA-F0-9]{64})?$")


class ExperimentRow(InputModel):
    condition_id: str = Field(min_length=1, max_length=120)
    lactate_mg_l: float = Field(ge=0)
    ammonia_mg_l: float = Field(ge=0)
    response: float
    response_unit: str = Field(min_length=1, max_length=80)


class ExperimentRequest(InputModel):
    rows: list[ExperimentRow] = Field(min_length=3, max_length=10_000)
    objective: Literal["maximize", "minimize"] = "maximize"
    source_hash: str = Field(default="", max_length=64, pattern=r"^([a-fA-F0-9]{64})?$")

    @model_validator(mode="after")
    def consistent_conditions(self):
        settings = {}
        units = {row.response_unit for row in self.rows}
        if len(units) != 1:
            raise ValueError("Keep the same response unit for every experiment.")
        for row in self.rows:
            value = (row.lactate_mg_l, row.ammonia_mg_l)
            if row.condition_id in settings and settings[row.condition_id] != value:
                raise ValueError("Replicates of a condition must use the same settings.")
            settings[row.condition_id] = value
        if not 3 <= len(settings) <= 60:
            raise ValueError("Use 3 to 60 distinct experimental conditions.")
        return self
