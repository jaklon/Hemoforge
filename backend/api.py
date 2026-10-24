import os
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.accounts import router as accounts_router
from backend.agent_routes import router as agent_router
from backend.document_scan import router as document_scan_router
from backend.evo2_routes import router as evo2_router
from backend.http_limits import BodyLimitMiddleware
from backend.proposals import router as proposals_router
from backend.research_report import router as research_report_router
from backend.virtual_lab import router as virtual_lab_router

from backend.models import ExperimentRequest, GrowthRequest
from backend.predictions import ENGINE, predict_experiments, predict_growth

@asynccontextmanager
async def lifespan(_app):
    from backend.dataset_runtime import runtime
    runtime.start()
    try:
        yield
    finally:
        await runtime.close()


app = FastAPI(title="HemoForge research API · HemoBot", version="1.1.0", lifespan=lifespan)
app.add_middleware(BodyLimitMiddleware)
extra_hosts = [host.strip() for host in os.environ.get("HEMOBOT_ALLOWED_HOSTS", "").split(",") if host.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver", *extra_hosts])
app.include_router(accounts_router)
app.include_router(agent_router)
app.include_router(evo2_router)
app.include_router(proposals_router)
app.include_router(virtual_lab_router)
app.include_router(document_scan_router)
app.include_router(research_report_router)


@app.exception_handler(RequestValidationError)
async def validation_error(_request, error):
    # Do not echo uploaded records back in error payloads or logs.
    issues = [f"{'.'.join(str(p) for p in item['loc'][1:])}: {item['msg']}" for item in error.errors()[:5]]
    return JSONResponse(status_code=422, content={"detail": "; ".join(issues)})


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": ENGINE, "models": ["growth-lognormal-v2", "experiment-rbf-gp-v2"]}


def execute(function, request):
    try:
        return function(request)
    except (ValueError, np.linalg.LinAlgError, OverflowError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/predict/growth")
def growth(request: GrowthRequest):
    return execute(predict_growth, request)


@app.post("/api/predict/experiments")
def experiments(request: ExperimentRequest):
    return execute(predict_experiments, request)


# A built React app can also run on the same origin as the API.
dist = Path(__file__).resolve().parents[1] / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="website")
