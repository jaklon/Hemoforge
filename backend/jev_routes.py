"""Authenticated JEV GPU inference for HemoForge accounts. A separate mode; HemoBot's evidence analysis is unchanged."""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from backend.accounts import account_id
from backend.db import Error, connect
from backend import jev_client
from backend.jev_client import JEVError, JEVKeyMissing

router = APIRouter(prefix="/api/v1/jev", tags=["JEV GPU inference"])
DAILY_LIMIT = 10
ACTION = "jev-chat"


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=20000)


def upstream_error(error, lookup=False):
    """Map upstream failures to safe messages; never echo upstream bodies or the key."""
    if isinstance(error, JEVKeyMissing):
        return HTTPException(503, "GPU inference is not configured on this server. Set JEV_API_KEY or JEV_API_KEY_FILE.")
    if error.status in (401, 403):
        return HTTPException(502, "The GPU service rejected this server's credentials. Ask an administrator to check the JEV key.")
    if error.status == 404 and lookup:
        return HTTPException(410, "This GPU job is no longer on the inference service, which may have restarted. Submit again if needed.")
    if error.status == 429:
        return HTTPException(503, "The GPU service is busy. Try again in a few minutes.")
    return HTTPException(503, "GPU inference service unavailable.")


def tracking_unavailable():
    return HTTPException(503, "Job tracking unavailable.")


@router.get("/status")
def jev_status(owner: str = Depends(account_id)):
    try:
        data = jev_client.health()
    except JEVError:
        raise HTTPException(503, "GPU inference service unavailable.") from None
    return {"status": data.get("status"), "models": data.get("supported_models", data.get("models"))}


@router.post("/chat", status_code=202)
def jev_chat(body: ChatRequest, request: Request, owner: str = Depends(account_id)):
    # Cross-site pages cannot set custom headers without a CORS preflight this API never grants.
    if request.headers.get("x-hemoforge-action") != ACTION:
        raise HTTPException(403, "Use the HemoBot JEV workspace to submit GPU jobs.")
    # Reserve a quota slot in a short transaction, then call GCP outside it.
    placeholder = str(uuid4())
    try:
        with connect() as db:
            # Serializes this account's reservations so concurrent requests cannot both pass the count.
            db.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("jev:" + owner,))
            used = db.execute("SELECT count(*) FROM jev_jobs WHERE account_id = %s"
                              " AND created_at >= clock_timestamp() - interval '24 hours'", (owner,)).fetchone()[0]
            if used >= DAILY_LIMIT:
                raise HTTPException(429, f"Daily GPU request limit reached ({DAILY_LIMIT} per 24 hours).")
            db.execute("INSERT INTO jev_jobs (job_id, account_id) VALUES (%s, %s)", (placeholder, owner))
    except (Error, OSError):
        raise tracking_unavailable() from None
    try:
        job = jev_client.submit(body.message)
    except JEVError as error:
        try:
            with connect() as db:
                db.execute("DELETE FROM jev_jobs WHERE job_id = %s", (placeholder,))
        except (Error, OSError):
            pass  # The reservation then just counts toward today's limit.
        raise upstream_error(error) from None
    try:
        with connect() as db:
            db.execute("UPDATE jev_jobs SET job_id = %s WHERE job_id = %s", (job["job_id"], placeholder))
    except (Error, OSError):
        raise HTTPException(503, "The GPU job started but could not be tracked. It still counts toward today's limit.") from None
    return {"job_id": job["job_id"], "status": job.get("status", "queued")}


@router.get("/jobs/{job_id}")
def jev_job(job_id: UUID, owner: str = Depends(account_id)):
    try:
        with connect() as db:
            row = db.execute("SELECT 1 FROM jev_jobs WHERE job_id = %s AND account_id = %s", (str(job_id), owner)).fetchone()
    except (Error, OSError):
        raise tracking_unavailable() from None
    if not row:
        raise HTTPException(404, "Job not found.")
    try:
        job = jev_client.get_job(str(job_id))
    except JEVError as error:
        raise upstream_error(error, lookup=True) from None
    return {"job_id": str(job_id), **{key: job.get(key) for key in ("status", "selected_model", "routing_reason", "result", "error")}}
