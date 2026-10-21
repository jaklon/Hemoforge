import sqlite3

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.agent_config import get_settings
from backend.evo2_models import PreparationRequest, PreparedBundle, ReadinessRequest
from backend.evo2_service import load_preparation, marker_readiness, prepare, status

router = APIRouter(prefix="/api/v1/evo2", tags=["Evo 2 · offline preparation"])


@router.get("/status")
def evo2_status():
    return status()


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
