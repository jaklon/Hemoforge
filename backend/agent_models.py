"""Contracts for the evidence-bound HemoBot agent; uploaded summaries are never trusted."""

from typing import Literal

from pydantic import Field, model_validator

from backend.models import ExperimentRequest, ExperimentRow, InputModel

Module = Literal["guard", "pilot", "plan", "match"]
CHANNELS = {"ph", "temperature_c", "do_percent", "glucose_mmol_l", "glutamine_mmol_l",
            "lactate_mmol_l", "ammonia_mmol_l", "viability_percent"}


class Source(InputModel):
    name: str = Field(min_length=1, max_length=255)
    sha256: str = Field(default="", pattern=r"^([a-fA-F0-9]{64})?$")
    evidence: Literal["software_test_only", "user_supplied"]


class CultureRecord(InputModel):
    batch_id: str = Field(min_length=1, max_length=120)
    cell_line: str = Field(default="Not specified", max_length=120)
    hour: float = Field(ge=0, le=8760)
    count: float | None = Field(ge=0)
    unit: Literal["million cells"] = "million cells"
    channels: dict[str, float | None] = Field(default_factory=dict, max_length=8)

    @model_validator(mode="after")
    def validate_channels(self):
        if set(self.channels) - CHANNELS:
            raise ValueError("Unknown culture channel.")
        for key, value in self.channels.items():
            if value is not None and ((key == "ph" and not 0 <= value <= 14) or
                                      (key in {"do_percent", "viability_percent"} and not 0 <= value <= 100)):
                raise ValueError("Culture channel outside its valid range.")
        return self


class MarkerRecord(InputModel):
    sample_id: str = Field(min_length=1, max_length=120)
    kel: str = Field(default="./.", max_length=32)
    slc: str = Field(default="./.", max_length=32)
    calls: dict[str, str] = Field(default_factory=dict, max_length=1000)

    @model_validator(mode="after")
    def validate_calls(self):
        import re
        if any(not re.fullmatch(r"rs[1-9]\d*", key, re.I) or len(value) > 32
               for key, value in self.calls.items()):
            raise ValueError("Marker calls require rs identifiers and bounded genotype strings.")
        self.kel = self.calls.get("rs8176058", self.kel)
        self.slc = self.calls.get("rs1058396", self.slc)
        return self


class CultureInput(Source):
    rows: list[CultureRecord] = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def ordered_batches(self):
        last = {}
        for row in self.rows:
            if row.batch_id in last and row.hour <= last[row.batch_id]:
                raise ValueError("Culture times must strictly increase within each batch.")
            last[row.batch_id] = row.hour
        if len(last) > 30:
            raise ValueError("Use at most 30 culture batches.")
        return self


class ExperimentInput(Source):
    rows: list[ExperimentRow] = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def consistent(self):
        # Reuse the prediction contract, including its unit and replicate checks.
        if len({r.condition_id for r in self.rows}) >= 3:
            ExperimentRequest(rows=self.rows)
        else:
            settings = {}
            for row in self.rows:
                values = (row.lactate_mg_l, row.ammonia_mg_l, row.response_unit)
                if row.condition_id in settings and settings[row.condition_id] != values:
                    raise ValueError("Conflicting condition replicates.")
                settings[row.condition_id] = values
            if len({r.response_unit for r in self.rows}) != 1:
                raise ValueError("Use one experiment response unit.")
        return self


class MarkerInput(Source):
    rows: list[MarkerRecord] = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def unique_samples(self):
        if len({r.sample_id for r in self.rows}) != len(self.rows):
            raise ValueError("Marker sample IDs must be unique.")
        return self


class WorkspaceInput(InputModel):
    culture: CultureInput
    experiments: ExperimentInput
    markers: MarkerInput


class MarkerTarget(InputModel):
    gene: str = Field(max_length=120)
    rsId: str = Field(pattern=r"^(?i:rs)[1-9]\d*$")
    alleles: list[Literal["A", "C", "G", "T"]] = Field(min_length=1, max_length=4)
    genotype: str = Field(max_length=32)

    @model_validator(mode="after")
    def usable_target(self):
        from backend.marker_calls import normalize_call
        if self.genotype != "*" and (len(normalize_call(self.genotype).split("/")) != 2 or
                any(letter not in self.alleles for letter in normalize_call(self.genotype).split("/"))):
            raise ValueError("Use a diploid target from the allowed alleles, or *.")
        known = {"rs8176058": "KEL", "rs1058396": "SLC14A1"}
        if self.rsId in known and self.gene != known[self.rsId]:
            raise ValueError("Built-in gene and rs identifiers must stay linked.")
        return self


class MarkerSettings(InputModel):
    targets: list[MarkerTarget] = Field(min_length=1, max_length=100)
    mode: Literal["all", "any"] = "all"
    missing: Literal["unknown", "exclude", "ignore"] = "unknown"

    @model_validator(mode="after")
    def unique_targets(self):
        if len({target.rsId for target in self.targets}) != len(self.targets):
            raise ValueError("Each marker can appear only once in a panel.")
        return self


class MonitoringSettings(InputModel):
    declineCount: int = Field(default=2, ge=0, le=100)
    dropPercent: float = Field(default=0, ge=0, le=100)
    staleHours: float | None = Field(default=None, gt=0)


class PlanSettings(InputModel):
    objective: Literal["maximize", "minimize"] = "maximize"
    lengthScale: float = Field(default=0.6, ge=0.001, le=100)
    noise: float = Field(default=0.05, ge=0.0001, le=10)
    exploration: float = Field(default=0.01, ge=0, le=1000000)


class ActiveContext(InputModel):
    batch_id: str = Field(min_length=1, max_length=120)
    replay_elapsed_hours: float = Field(ge=0, le=8760)
    kel: Literal["G/G", "G/A", "A/A"] = "G/A"
    slc: Literal["G/G", "G/A", "A/A"] = "G/G"
    objective: Literal["maximize", "minimize"] = "maximize"
    marker_settings: MarkerSettings | None = None
    monitoring: MonitoringSettings = Field(default_factory=MonitoringSettings)
    plan_settings: PlanSettings | None = None
    report_interval: float = Field(default=3, ge=0.25, le=168)
    verification_requests: list[bool] = Field(default_factory=lambda: [False] * 3, min_length=3, max_length=3)


class AnalyzeRequest(InputModel):
    query_en: str = Field(min_length=3, max_length=1200)
    language: Literal["en"] = "en"
    module: Literal["all", "guard", "pilot", "plan", "match"] = "all"
    active_context: ActiveContext
    inputs: WorkspaceInput
    mode: Literal["auto", "template"] = "auto"


class EvidenceClaim(InputModel):
    id: str
    module: Module
    text: str
    citation_id: str


class EvidencePlan(InputModel):
    """The LLM selects statements, never authors unchecked scientific assertions."""
    language: Literal["en"]
    claim_ids: list[str] = Field(min_length=1, max_length=16)
    action_ids: list[Literal["review_counts", "review_metabolites", "repeat_condition", "request_lab"]] = Field(max_length=4)


class Citation(InputModel):
    id: str
    module: str
    study_id: str
    reference: str
    source_sha256: str
    content_sha256: str
    evidence: str
    measured_at: float | None = None


class AnalysisCard(InputModel):
    module: Module
    title: str
    status: str
    statements: list[str]
    citation_ids: list[str]


class AnalyzeResponse(InputModel):
    response_id: str
    generated_at: str
    language: Literal["en"] = "en"
    llm_engine: str
    model_digest: str | None
    execution_status: Literal["succeeded", "fallback", "blocked"]
    evidence_quality: Literal["software_test_only", "user_supplied_unverified", "needs_review"]
    fallback_reason: str | None
    active_modules_used: list[Module]
    summary_headline: str
    biomedical_analysis_markdown: str
    cards: list[AnalysisCard]
    suggested_actions: list[str]
    citations: list[Citation]
    literature: list[dict]
    rag_status: str
    mandatory_scientific_disclaimers: list[str]
    rarematch_roadmap_evo2_extension: dict
    analysis_fingerprint: str
    context_fingerprint: str
    audit_manifest: dict
    seed: Literal[42] = 42
