import sqlite3
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from backend.agent_config import get_settings
from backend.evo2_models import PreparationRequest, PreparedBundle, ReadinessRequest
from backend.evo2_service import load_preparation, marker_readiness, prepare, status
from backend.evo2_dataset import DatasetPreparationRequest, get_public_dataset

router = APIRouter(prefix="/api/v1/evo2", tags=["Evo 2 · offline preparation"])


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
        return public_dataset().prepare(request, get_settings().database_path)
    except KeyError as error:
        raise HTTPException(404, "A selected public variant was not found. Nothing was prepared.") from error
    except ValueError as error:
        raise HTTPException(422, "Public sequence preparation validation failed.") from error
    except (sqlite3.Error, OSError) as error:
        raise HTTPException(503, "The local preparation audit store is unavailable.") from error


@router.post("/readiness")
def evo2_readiness(request: ReadinessRequest):
    return marker_readiness(request.markers)


@router.post("/prepare", response_model=PreparedBundle)
def evo2_prepare(request: PreparationRequest):
    try:
        return prepare(request, get_settings().database_path)
    except ValueError as error:
        # Parser errors contain fixed explanations, never uploaded sequence contents.
        raise HTTPException(422, str(error) if not hasattr(error, "errors") else "Sequence preparation validation failed.") from error
    except (sqlite3.Error, OSError) as error:
        raise HTTPException(503, "The local preparation audit store is unavailable.") from error


@router.get("/preparations/{preparation_id}/export")
def evo2_export(preparation_id: str):
    try:
        bundle = load_preparation(preparation_id, get_settings().database_path)
    except (sqlite3.Error, OSError) as error:
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
