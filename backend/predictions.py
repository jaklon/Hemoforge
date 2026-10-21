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


DEFAULT_NOISE_SD = 0.05  # normalized; used only when no condition has replicates
GRID_LEVELS = 5  # per factor; ponytail: fixed 5x5 grid inside the observed range, add adaptive search if factors grow


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
    raw = np.array([[r["lactate"], r["ammonia"]] for r in conditions], dtype=float)
    span = np.maximum(raw.max(axis=0), 1)
    factors = raw / span
    targets = np.array([r["mean"] for r in conditions])
    counts = np.array([r["n"] for r in conditions], dtype=float)
    variances = np.array([(r["sd"] or 0.0) ** 2 for r in conditions])

    # Candidate grid spans the observed factor range only; no extrapolation.
    axes = [np.unique(np.linspace(raw[:, j].min(), raw[:, j].max(), GRID_LEVELS)) for j in range(2)]
    grid_raw = np.array([[lactate, ammonia] for lactate in axes[0] for ammonia in axes[1]])
    grid = grid_raw / span

    def rbf(a, b):
        return np.exp(-0.5 * np.sum((a[:, None] - b[None, :]) ** 2, axis=2) / request.length_scale**2)

    def noise(indices, scale):
        """Variance of each condition mean in normalized units."""
        if request.noise_sd is not None:
            return np.full(len(indices), request.noise_sd**2), "setting", request.noise_sd * scale, 0
        dof = float(np.sum(counts[indices] - 1))
        if dof == 0:
            return np.full(len(indices), DEFAULT_NOISE_SD**2), "default", DEFAULT_NOISE_SD * scale, 0
        pooled = math.sqrt(float(np.sum((counts[indices] - 1) * variances[indices])) / dof)
        return (pooled / scale) ** 2 / counts[indices], "replicates", pooled, int(dof)

    def predict(indices, points):
        training = targets[indices]
        offset, scale = training.mean(), training.std() or 1.0
        diagonal, *_ = noise(indices, scale)
        covariance = rbf(factors[indices], factors[indices]) + np.diag(diagonal)
        k = rbf(factors[indices], points)
        alpha = np.linalg.solve(covariance, (training - offset) / scale)
        weights = np.linalg.solve(covariance, k)
        latent = np.maximum(0, 1 - np.sum(k * weights, axis=0))
        return offset + scale * (k.T @ alpha), scale * np.sqrt(latent)

    best = targets.max() if request.objective == "maximize" else targets.min()

    def expected_improvement(mean, sd):
        improvement = (mean - best if request.objective == "maximize" else best - mean) - request.exploration
        with np.errstate(divide="ignore", invalid="ignore"):
            z = np.where(sd > 0, improvement / np.where(sd > 0, sd, 1), 0)
        cdf = 0.5 * (1 + np.vectorize(math.erf)(z / math.sqrt(2)))
        pdf = np.exp(-0.5 * z**2) / math.sqrt(2 * math.pi)
        return np.maximum(0, np.where(sd > 0, improvement * cdf + sd * pdf, np.maximum(0, improvement)))

    indices = np.arange(len(conditions))
    validation = []
    for i, condition in enumerate(conditions):
        training = indices[indices != i]
        held_out, _ = predict(training, factors[[i]])
        validation.append({"condition": condition["id"], "actual": condition["mean"],
                           "predicted": float(held_out[0]), "baseline": float(targets[training].mean())})

    mean, sd = predict(indices, factors)
    ei = expected_improvement(mean, sd)
    ranked = [{**condition, "prediction": float(mean[i]), "uncertainty": float(sd[i]), "ei": float(ei[i])}
              for i, condition in enumerate(conditions)]

    grid_mean, grid_sd = predict(indices, grid)
    grid_ei = expected_improvement(grid_mean, grid_sd)
    candidates = [{
        "lactate": float(point[0]), "ammonia": float(point[1]),
        "prediction": float(grid_mean[i]), "uncertainty": float(grid_sd[i]), "ei": float(grid_ei[i]),
        "tested": bool(np.any(np.all(np.isclose(raw, point), axis=1))),
    } for i, point in enumerate(grid_raw)]

    _, source, noise_sd, dof = noise(indices, targets.std() or 1.0)
    result = {
        "ranked": sorted(ranked, key=lambda row: row["ei"], reverse=True),
        "candidates": sorted(candidates, key=lambda row: row["ei"], reverse=True),
        "validation": validation,
        "mae": float(np.mean([abs(row["actual"] - row["predicted"]) for row in validation])),
        "baselineMAE": float(np.mean([abs(row["actual"] - row["baseline"]) for row in validation])),
        "noise": {"source": source, "sd": float(noise_sd), "dof": dof},
        "method": (f"RBF Gaussian process; normalized length scale {request.length_scale}; "
                   + {"replicates": f"noise from pooled replicate SD {noise_sd:.4g} ({dof} df), divided by each condition's run count",
                      "setting": f"fixed normalized noise SD {request.noise_sd}",
                      "default": f"no replicates, assumed normalized noise SD {DEFAULT_NOISE_SD}"}[source]
                   + f"; exploration margin {request.exploration}; {len(candidates)}-point grid inside the observed factor range"),
        "objective": request.objective,
    }
    values = [row[key] for rows in (ranked, candidates) for row in rows for key in ("prediction", "uncertainty", "ei")]
    if not all(math.isfinite(value) for value in values):
        raise ValueError("Model exceeded the numeric range. Review extreme response values.")
    return envelope(request, result, "experiment-rbf-gp-v3")
