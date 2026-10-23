"""Read-only live-module adapters, derived exclusively from released FLEX2 observations."""

import hashlib
import json
import math
from typing import Literal

import numpy as np
from pydantic import Field

from backend.models import InputModel, GrowthRequest
from backend.predictions import predict_growth


class AnalyticsRequest(InputModel):
    source_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    horizon: Literal[12, 24, 48] = 24
    target_million: float = Field(default=1000, strict=True, ge=1, le=1_000_000)


def live_analytics(snapshot, request):
    hour = snapshot["culture_hours"]
    applied = [item for item in snapshot["interventions"] if item["status"] == "applied"]
    last_action = applied[-1] if applied else None
    cutoff = last_action["completed_at_hour"] if last_action else 0.0
    segment_id = last_action["id"] if last_action else "initial"
    released = [row for row in snapshot["measurements"]
                if row["quality"]["status"] == "passed" and row["available_at_hour"] <= hour
                and row["collected_at_hour"] <= row["available_at_hour"]]
    training = [row for row in released if row["collected_at_hour"] >= cutoff]
    samples = [{"hour": row["collected_at_hour"], "count": row["count"], "unit": row["unit"]}
               for row in training]
    input_hash = hashlib.sha256(json.dumps(samples, sort_keys=True).encode()).hexdigest()
    latest = training[-1] if training else None
    reason = ""
    status = "ready"
    if snapshot["active_intervention"]:
        status, reason = "intervention_in_progress", "Wait for the intervention to finish, then collect fresh FLEX2 samples."
    elif not training:
        status, reason = "needs_samples", "Collect released FLEX2 observations in the current intervention segment."
    elif any(not math.isfinite(row["count"]) or row["count"] <= 0 or row["unit"] != "million cells"
             for row in training):
        status, reason = "needs_review", "Review non-positive or invalid counts before forecasting."
    elif hour - latest["collected_at_hour"] > 24:
        status, reason = "stale", "The latest observation is older than 24 culture hours. Collect a fresh sample."
    elif len(training) < 3:
        status, reason = "needs_samples", "At least three released observations are required after the last applied intervention."
    elif any(b["hour"] <= a["hour"] for a, b in zip(samples, samples[1:])):
        status, reason = "needs_review", "Measurement times must strictly increase."
    elif samples[-1]["hour"] - samples[0]["hour"] < 6:
        status, reason = "needs_time_span", "Use observations spanning at least six culture hours for this teaching fit."
    forecast = None
    if status == "ready":
        try:
            forecast = predict_growth(GrowthRequest(samples=samples, as_of_hour=samples[-1]["hour"],
                horizon=request.horizon, path_count=128, seed=42, source_hash=input_hash))
        except (ValueError, OverflowError, np.linalg.LinAlgError):
            status, reason = "needs_review", "Numerical fit unavailable. Review the measured trend and sample spacing."

    target = {"target_million": request.target_million, "observed_count": latest["count"] if latest else None,
              "observed_hour": latest["collected_at_hour"] if latest else None,
              "status": "withheld", "hours_from_observation": None, "target_hour": None,
              "doubling_hours": None, "fold_required": None}
    if latest and latest["count"] > 0:
        target["fold_required"] = request.target_million / latest["count"]
        if forecast and forecast["result"]["logDrift"] > 0:
            doubling = math.log(2) / forecast["result"]["logDrift"]
            if math.isfinite(doubling):
                target["doubling_hours"] = doubling
        if latest["count"] >= request.target_million and status not in {"stale", "needs_review", "intervention_in_progress"}:
            target["status"] = "observed_target_reached"
        elif forecast:
            rate = forecast["result"]["logDrift"]
            if rate <= 0:
                target["status"] = "non_growing"
            else:
                eta = math.log(target["fold_required"]) / rate
                target_hour = latest["collected_at_hour"] + eta
                doubling = math.log(2) / rate
                if all(math.isfinite(value) for value in (eta, target_hour, doubling)):
                    target.update(status="projected" if target_hour <= snapshot["end_hour"] else "beyond_run",
                                  hours_from_observation=max(0, eta), target_hour=target_hour, doubling_hours=doubling)
    return {
        "session_id": snapshot["session_id"], "batch_id": snapshot["batch_id"],
        "source_hash": snapshot["measurements_sha256"], "fit_input_hash": input_hash,
        "segment_id": segment_id, "segment_start_hour": cutoff, "as_of_culture_hour": hour,
        "settings": {"horizon": request.horizon, "target_million": request.target_million},
        "status": status, "reason": reason, "training_samples": samples,
        "source_sample_ids": [row["sample_id"] for row in training],
        "forecast": forecast, "target_plan": target,
        "experiment_gp": {"status": "withheld", "reason":
            "A sequential single-reactor time series is not independent controlled experiment data. No DOE rows or ammonia values are fabricated."},
        "evidence": "software_test_only", "model_version": "live-modules-v1",
    }
