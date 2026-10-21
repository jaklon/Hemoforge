"""Offline preparation contracts. No API request can enable inference or supply scores."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from backend.agent_models import MarkerInput
from backend.models import InputModel

SHA256 = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Coordinate = Annotated[int, Field(strict=True, ge=1, le=1_000_000_000)]


class ReadinessRequest(InputModel):
    markers: MarkerInput


class SequenceSource(InputModel):
    sample_id: str = Field(min_length=1, max_length=120)
    study_id: str = Field(min_length=1, max_length=120)
    gene: Literal["KEL", "SLC14A1"]
    genome_build: Literal["GRCh38", "synthetic_fixture"] = "GRCh38"
    evidence: Literal["user_supplied", "public_reference_unverified", "software_test_only"] = "user_supplied"
    reference_label: str = Field(min_length=1, max_length=255)
    contig: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")
    reference_fasta: str = Field(min_length=1, max_length=262144)

    @model_validator(mode="after")
    def truthful_fixture(self):
        if (self.genome_build == "synthetic_fixture") != (self.evidence == "software_test_only"):
            raise ValueError("Synthetic fixtures must use synthetic_fixture and software_test_only together.")
        return self


class PairedFastaRequest(SequenceSource):
    mode: Literal["paired_fasta"]
    alternate_fasta: str = Field(min_length=1, max_length=32768)
    reference_start_1based: Coordinate | None = None


class VcfWindowRequest(SequenceSource):
    mode: Literal["vcf_window"]
    vcf_text: str = Field(min_length=1, max_length=262144)
    reference_start_1based: Coordinate
    flank_bp: int = Field(default=128, strict=True, ge=16, le=1024)


PreparationRequest = Annotated[PairedFastaRequest | VcfWindowRequest, Field(discriminator="mode")]


class CostPolicy(InputModel):
    mode: Literal["prepare_only"] = "prepare_only"
    inference_enabled: Literal[False] = False
    external_providers_enabled: Literal[False] = False
    automatic_downloads_enabled: Literal[False] = False
    automatic_gpu_provisioning_enabled: Literal[False] = False


class SequenceTask(InputModel):
    task_id: SHA256
    sample_id: str
    study_id: str
    gene: Literal["KEL", "SLC14A1"]
    genome_build: Literal["GRCh38", "synthetic_fixture"]
    evidence: Literal["user_supplied", "public_reference_unverified", "software_test_only"]
    contig: str
    position_1based: Coordinate | None
    variant_id: str | None
    genotype: str | None
    reference_sequence: str = Field(min_length=33, max_length=8191, pattern=r"^[ACGT]+$")
    alternate_sequence: str = Field(min_length=33, max_length=8191, pattern=r"^[ACGT]+$")
    reference_sha256: SHA256
    alternate_sha256: SHA256
    variant_index_0based: int = Field(ge=16)
    ref: Literal["A", "C", "G", "T"]
    alt: Literal["A", "C", "G", "T"]
    sequence_length: int = Field(ge=33, le=8191)
    score_status: Literal["not_run"] = "not_run"
    delta_log_likelihood: None = None


class PreparationManifest(InputModel):
    schema_version: Literal["hemoforge-evo2-preparation-v1"] = "hemoforge-evo2-preparation-v1"
    policy: CostPolicy = Field(default_factory=CostPolicy)
    model_name: Literal["evo2_7b_base"] = "evo2_7b_base"
    scoring_options: dict = Field(default_factory=lambda: {
        "reduce_method": "sum", "prepend_bos": True, "average_reverse_complement": False, "batch_size": 1,
    })
    input_fingerprint: SHA256
    reference_label: str
    reference_window_start_1based: Coordinate | None
    source_hashes: dict[str, str]
    tasks: list[SequenceTask] = Field(min_length=1, max_length=20)
    warnings: list[str]
    laboratory_status: Literal["pending_lab_verification"] = "pending_lab_verification"


class PreparedBundle(InputModel):
    preparation_id: str = Field(pattern=r"^evo2prep-[a-f0-9]{32}$")
    prepared_at: str
    execution_status: Literal["prepared_only"] = "prepared_only"
    manifest_fingerprint: SHA256
    manifest: PreparationManifest
