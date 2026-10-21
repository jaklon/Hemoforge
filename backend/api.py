from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.models import ExperimentRequest, GrowthRequest
from backend.predictions import ENGINE, predict_experiments, predict_growth

app = FastAPI(title="HemoGPT Python predictions", version="1.0.0")


@app.exception_handler(RequestValidationError)
async def validation_error(_request, error):
    # Do not echo uploaded records back in error payloads or logs.
    issues = [f"{'.'.join(str(p) for p in item['loc'][1:])}: {item['msg']}" for item in error.errors()[:5]]
    return JSONResponse(status_code=422, content={"detail": "; ".join(issues)})


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": ENGINE, "models": ["growth-lognormal-v1", "experiment-rbf-gp-v1"]}


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
