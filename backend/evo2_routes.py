import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from backend.db import Error
from backend.evo2_models import PreparationRequest, PreparedBundle, ReadinessRequest
from backend.evo2_service import load_preparation, marker_readiness, prepare, status
from backend.evo2_dataset import DatasetPreparationRequest, get_public_dataset
from backend.evo2_nvidia import NvidiaScoreRequest, TrialError, get_nvidia_settings, latest_result, load_result, score_public_variant, trial_status

router = APIRouter(prefix="/api/v1/evo2", tags=["Evo 2 · public data and optional NVIDIA trial"])


@router.get("/status")
def evo2_status():
    return status()


def public_dataset():
    try:
        return get_public_dataset()
    except (ValueError, OSError, KeyError, TypeError) as error:
        raise HTTPException(503, "The bundled public dataset is unavailable or failed integrity verification. No download was attempted.") from error


@router.get("/dataset")
def evo2_dataset():
    return public_dataset().summary()


@router.get("/dataset/variants")
def evo2_dataset_variants(gene: Literal["KEL", "SLC14A1"] | None = None,
                          split: Literal["train", "validation", "test"] | None = None,
                          q: str = Query(default="", max_length=120),
                          offset: int = Query(default=0, ge=0, le=100000),
                          limit: int = Query(default=20, ge=1, le=100)):
    return public_dataset().variants(gene, split, q, offset, limit)


@router.get("/dataset/variants/{variant_id}")
def evo2_dataset_variant(variant_id: str):
    try:
        return public_dataset().variant(variant_id)
    except KeyError as error:
        raise HTTPException(404, "Public variant not found.") from error


@router.post("/dataset/prepare", response_model=PreparedBundle)
def evo2_dataset_prepare(request: DatasetPreparationRequest):
    try:
        return public_dataset().prepare(request)
    except KeyError as error:
        raise HTTPException(404, "A selected public variant was not found. Nothing was prepared.") from error
    except ValueError as error:
        raise HTTPException(422, "Public sequence preparation validation failed.") from error
    except (Error, OSError) as error:
        raise HTTPException(503, "The local preparation audit store is unavailable.") from error


@router.post("/readiness")
def evo2_readiness(request: ReadinessRequest):
    return marker_readiness(request.markers)


@router.post("/prepare", response_model=PreparedBundle)
def evo2_prepare(request: PreparationRequest):
    try:
        return prepare(request)
    except ValueError as error:
        # Parser errors contain fixed explanations, never uploaded sequence contents.
        raise HTTPException(422, str(error) if not hasattr(error, "errors") else "Sequence preparation validation failed.") from error
    except (Error, OSError) as error:
        raise HTTPException(503, "The local preparation audit store is unavailable.") from error


@router.get("/preparations/{preparation_id}/export")
def evo2_export(preparation_id: str):
    try:
        bundle = load_preparation(preparation_id)
    except (Error, OSError) as error:
        raise HTTPException(503, "The local preparation audit store is unavailable.") from error
    if bundle is None:
        raise HTTPException(404, "Preparation not found.")
    return Response(bundle.model_dump_json(indent=2), media_type="application/json", headers={
        "Content-Disposition": f'attachment; filename="{bundle.preparation_id}.json"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    })


@router.post("/score", status_code=409)
def evo2_score():
    # Deliberately no provider/client/model import or enabling parameter. This cannot incur inference spend.
    return {"detail": "Evo 2 inference is disabled by the preparation-only budget lock.",
            "score_status": "not_run", "delta_log_likelihood": None, "policy": status()["policy"]}


def nvidia_error(error):
    if isinstance(error, TrialError):
        raise HTTPException(error.http_status, error.detail) from None
    raise HTTPException(503, "The local NVIDIA trial configuration or audit store is unavailable.") from None


@router.get("/nvidia/status")
def evo2_nvidia_status():
    try:
        return trial_status(get_nvidia_settings())
    except (TrialError, ValueError, OSError, Error) as error:
        nvidia_error(error)


@router.post("/nvidia/score")
def evo2_nvidia_score(request: NvidiaScoreRequest, http_request: Request):
    # Require a deliberate same-origin JSON action. Cross-site forms cannot trigger external calls.
    origin = http_request.headers.get("origin")
    if (http_request.headers.get("x-hemoforge-action") != "nvidia-trial"
        or (origin is not None and origin not in {
            "http://127.0.0.1:8443", "http://localhost:8443", "http://127.0.0.1:8000", "http://localhost:8000"})):
        raise HTTPException(403, "Use the local Evo 2 workspace to request trial inference.")
    try:
        return score_public_variant(request, public_dataset(), get_nvidia_settings())
    except KeyError:
        raise HTTPException(404, "Public variant not found. No inference was requested.") from None
    except (TrialError, ValueError, OSError, Error) as error:
        nvidia_error(error)


@router.get("/nvidia/results/{result_id}/export")
def evo2_nvidia_export(result_id: str):
    try:
        result = load_result(result_id)
    except (OSError, Error, ValueError) as error:
        nvidia_error(error)
    if result is None:
        raise HTTPException(404, "NVIDIA trial result not found.")
    return Response(json.dumps(result, indent=2, allow_nan=False), media_type="application/json", headers={
        "Content-Disposition": f'attachment; filename="{result_id}.json"', "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.get("/nvidia/results/latest")
def evo2_nvidia_saved(variant_id: str = Query(max_length=120)):
    try:
        dataset = public_dataset()
        dataset.variant(variant_id)
        result = latest_result(variant_id, dataset.pairs_sha256, get_nvidia_settings().logits_layer)
    except KeyError:
        raise HTTPException(404, "Public variant not found.") from None
    except (TrialError, OSError, Error, ValueError) as error:
        nvidia_error(error)
    if result is None:
        raise HTTPException(404, "No saved NVIDIA result for this variant and scoring configuration. No upstream request was made.")
    return Response(json.dumps({**result, "cache_hit": True, "new_requests_reserved": 0}, allow_nan=False),
                    media_type="application/json", headers={"Cache-Control": "no-store"})
