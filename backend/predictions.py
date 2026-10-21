"""Exploratory models. No pretrained biological model or clinical claim."""

import hashlib
import json
import math
from datetime import datetime, timezone

import numpy as np

from backend.models import ExperimentRequest, GrowthRequest

ENGINE = "python-numpy"


def envelope(request, result, model_version):
    encoded = json.dumps(request.model_dump(), sort_keys=True, allow_nan=False).encode()
    return {
        "engine": ENGINE,
        "modelVersion": model_version,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceHash": request.source_hash,
        "requestId": hashlib.sha256(encoded).hexdigest(),
        "result": result,
    }


def predict_growth(request: GrowthRequest):
    observations = [sample for sample in request.samples if sample.hour <= request.as_of_hour]
    if request.lookback_hours is not None:
        observations = [sample for sample in observations if sample.hour >= request.as_of_hour - request.lookback_hours]
    if len(observations) < 3:
        raise ValueError("Use a cutoff and lookback window containing at least three valid measurements.")
    if request.as_of_hour > max(sample.hour for sample in request.samples):
        raise ValueError("Start time must be within the observed input window.")
    if any(sample.count is None or sample.count <= 0 for sample in observations):
        raise ValueError("Growth prediction requires positive, non-missing cell counts.")
    hours = np.array([sample.hour for sample in observations])
    counts = np.array([sample.count for sample in observations], dtype=float)
    durations = np.diff(hours)
    if np.any(durations <= 0):
        raise ValueError("Measurement times must strictly increase within a batch.")
    changes = np.diff(np.log(counts))
    drift = float(changes.sum() / durations.sum())
    volatility = float(np.sqrt(np.sum((changes - drift * durations) ** 2 / durations) / (len(durations) - 1)))
    fitted_drift, fitted_volatility = drift, volatility
    if request.drift_override is not None:
        drift = request.drift_override
    if request.volatility_override is not None:
        volatility = request.volatility_override
    rng = np.random.default_rng(request.seed)
    values = np.full(request.path_count, counts[-1])

    def advance(duration):
        nonlocal values
        with np.errstate(over="ignore", under="ignore", invalid="ignore"):
            values = values * np.exp(drift * duration + volatility * math.sqrt(duration) * rng.standard_normal(request.path_count))
        if not np.all(np.isfinite(values)) or np.any(values <= 0):
            raise ValueError("Prediction exceeded the numeric range. Review extreme counts or shorten the horizon.")

    gap = request.as_of_hour - hours[-1]
    if gap > 0:
        advance(gap)
    paths, distribution = [], []
    for step in range(request.horizon + 1):
        if step:
            advance(1)
        paths.append(values.copy())
        quantiles = np.quantile(values, [0.025, 0.1, 0.5, 0.9, 0.975]).tolist()
        distribution.append(dict(zip(
            ["hour", "lower95", "lower80", "median", "upper80", "upper95"],
            [request.as_of_hour + step, *quantiles],
        )))
    return envelope(request, {
        "fromHour": request.as_of_hour,
        "startCount": distribution[0]["median"],
        "observedHour": float(hours[-1]),
        "observedCount": float(counts[-1]),
        "measurementCount": len(observations),
        "simulationCount": request.path_count,
        "paths": np.array(paths).T.tolist(),
        "distribution": distribution,
        "logDrift": drift,
        "volatility": volatility,
        "fittedLogDrift": fitted_drift,
        "fittedVolatility": fitted_volatility,
        "scenarioOverrides": request.drift_override is not None or request.volatility_override is not None,
        "seed": request.seed,
    }, "growth-lognormal-v2")


def predict_experiments(request: ExperimentRequest):
    grouped = {}
    for row in request.rows:
        grouped.setdefault(row.condition_id, []).append(row)
    conditions = []
    for name, rows in grouped.items():
        outcomes = np.array([row.response for row in rows])
        conditions.append({
            "id": name, "lactate": rows[0].lactate_mg_l,
            "ammonia": rows[0].ammonia_mg_l, "mean": float(outcomes.mean()),
            "sd": float(outcomes.std(ddof=1)) if len(rows) > 1 else None,
            "n": len(rows), "unit": rows[0].response_unit,
        })
    factors = np.array([[r["lactate"], r["ammonia"]] for r in conditions])
    factors /= np.maximum(factors.max(axis=0), 1)
    targets = np.array([r["mean"] for r in conditions])
    kernel = np.exp(-0.5 * np.sum((factors[:, None] - factors[None, :]) ** 2, axis=2) / request.length_scale**2)

    def predict(indices, target):
        training = targets[indices]
        offset, scale = training.mean(), training.std() or 1.0
        covariance = kernel[np.ix_(indices, indices)] + np.eye(len(indices)) * request.noise_sd**2
        k = kernel[indices, target]
        alpha = np.linalg.solve(covariance, (training - offset) / scale)
        weights = np.linalg.solve(covariance, k)
        return float(offset + scale * k @ alpha), float(scale * np.sqrt(max(0, 1 - k @ weights)))

    validation, ranked = [], []
    indices = list(range(len(conditions)))
    best = targets.max() if request.objective == "maximize" else targets.min()
    for i, condition in enumerate(conditions):
        training = [j for j in indices if j != i]
        held_out, _ = predict(training, i)
        validation.append({"condition": condition["id"], "actual": condition["mean"],
                           "predicted": held_out, "baseline": float(targets[training].mean())})
        mean, sd = predict(indices, i)
        improvement = (mean - best if request.objective == "maximize" else best - mean) - request.exploration
        z = improvement / sd if sd > 0 else 0
        ei = (improvement * 0.5 * (1 + math.erf(z / math.sqrt(2))) +
              sd * math.exp(-0.5 * z**2) / math.sqrt(2 * math.pi)) if sd > 0 else max(0, improvement)
        ranked.append({**condition, "prediction": mean, "uncertainty": sd, "ei": max(0, float(ei))})
    result = {
        "ranked": sorted(ranked, key=lambda row: row["ei"], reverse=True),
        "validation": validation,
        "mae": float(np.mean([abs(row["actual"] - row["predicted"]) for row in validation])),
        "baselineMAE": float(np.mean([abs(row["actual"] - row["baseline"]) for row in validation])),
        "method": f"RBF Gaussian process; normalized length scale {request.length_scale}; noise SD {request.noise_sd}; exploration margin {request.exploration}; candidate remeasurement within observed conditions",
        "objective": request.objective,
    }
    if not all(math.isfinite(value) for row in ranked for value in [row["prediction"], row["uncertainty"], row["ei"]]):
        raise ValueError("Model exceeded the numeric range. Review extreme response values.")
    return envelope(request, result, "experiment-rbf-gp-v2")
