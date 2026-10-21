import sqlite3
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.agent_config import get_settings
from backend.agent_llm import headers, model_info
from backend.agent_models import AnalyzeRequest, AnalyzeResponse
from backend.agent_service import analyze, export_audit
from backend.agent_store import AuditStore

router = APIRouter(prefix="/api/v1/hemobot", tags=["HemoBot"])


@router.get("/status")
def agent_status():
    settings = get_settings()
    state, digest = "disabled" if settings.mode == "template" else "offline", None
    if settings.mode == "auto":
        try:
            with httpx.Client(timeout=3, headers=headers(settings), trust_env=False) as client:
                digest = model_info(client, settings).get("digest")
            state = "online"
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            pass
    return {"name": "HemoBot", "model": settings.ollama_model, "model_digest": digest,
            "llm_status": state, "fallback_available": True, "rag_enabled": settings.rag_enabled,
            "audit_storage": "local_sqlite", "language": "en", "evo2_status": "roadmap_preview_only"}


@router.post("/analyze", response_model=AnalyzeResponse)
def agent_analyze(request: AnalyzeRequest):
    try:
        return analyze(request, get_settings())
    except (ValueError, OverflowError) as error:
        # Numeric/input failures do not masquerade as completed analyses.
        raise HTTPException(status_code=422, detail="Analysis could not be computed. Check the batch, sample times, and numeric input ranges.") from error
    except (sqlite3.Error, OSError) as error:
        raise HTTPException(status_code=503, detail="The local audit store is unavailable. Check its directory permissions and free disk space.") from error


@router.get("/analyses/{response_id}/export")
def agent_export(response_id: str, format: Literal["json", "html", "markdown"] = "json"):
    if len(response_id) != 40 or not response_id.startswith("hemobot-"):
        raise HTTPException(status_code=404, detail="Analysis not found.")
    try:
        bundle = AuditStore(get_settings().database_path).get(response_id)
    except (sqlite3.Error, OSError) as error:
        raise HTTPException(status_code=503, detail="Audit storage is unavailable.") from error
    if bundle is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    content, media_type = export_audit(bundle, format)
    extension = "md" if format == "markdown" else format
    return Response(content, media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="{response_id}.{extension}"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    })
