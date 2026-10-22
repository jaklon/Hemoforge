"""Bounded local Guard decisions. No instrument, remote model or database calls."""

import secrets
import time
from typing import Literal

from pydantic import Field, model_validator

from backend.models import InputModel
from backend.culture_simulation import INTERVENTION_HOURS, MAX_VOLUME_ML

MAX_INTERVENTIONS = 40
DECISION_MAX_AGE_HOURS = 24


class PairRequest(InputModel):
    code: str = Field(pattern=r"^[a-fA-F0-9]{12}$")


class InterventionRequest(InputModel):
    request_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    kind: Literal["feed", "medium_exchange"]
    amount: Literal[10, 25, 50]
    source_sample_id: str = Field(pattern=r"^FLEX2-[0-9]{3}$")
    note: str = Field(min_length=3, max_length=160)

    @model_validator(mode="after")
    def supported_preset(self):
        if (self.kind == "feed" and self.amount not in (10, 25)) or (
                self.kind == "medium_exchange" and self.amount not in (25, 50)):
            raise ValueError("Choose one of the supported intervention presets.")
        return self


def matches_token(supplied, expected):
    return (isinstance(supplied, str) and supplied.isascii() and bool(expected)
            and secrets.compare_digest(supplied, expected))


def active_intervention(session):
    if session.interventions and session.interventions[-1]["status"] in {"queued", "executing"}:
        return session.interventions[-1]
    return None


def queue_intervention(session, request, end_hour):
    payload = request.model_dump()
    # An HTTP retry is independent from the controller's animation command sequence.
    previous = next((item for item in session.interventions if item["id"] == request.request_id), None)
    if previous:
        if any(previous[key] != value for key, value in payload.items() if key != "request_id"):
            raise ValueError("Request ID was already used for a different decision.")
        return previous
    if len(session.interventions) >= MAX_INTERVENTIONS:
        raise ValueError("Intervention limit reached. Start a new session.")
    if len(session.assays) >= 100:
        raise ValueError("Assay limit reached. Start a new session so the next action can be measured.")
    if not session.controller:
        raise ValueError("Connect the 3D controller before sending a decision.")
    if active_intervention(session) or session.phase not in {"idle", "complete"}:
        raise ValueError("Finish the current sample or intervention first.")
    if session.hour + INTERVENTION_HOURS > end_hour:
        raise ValueError("Not enough culture time remains for this intervention.")
    latest = session.results[-1] if session.results else None
    if not latest or latest["sample_id"] != request.source_sample_id:
        raise ValueError("Review the latest released FLEX2 sample before sending a decision.")
    if session.hour - latest["collected_at_hour"] > DECISION_MAX_AGE_HOURS:
        raise ValueError("Observation is older than 24 culture hours. Collect a fresh sample.")
    if any(item["status"] == "applied" and item["source_sample_id"] == request.source_sample_id
           for item in session.interventions):
        raise ValueError("Collect a new FLEX2 result after the last applied action before deciding again.")
    if request.kind == "feed" and session.culture.volume_ml + request.amount > MAX_VOLUME_ML:
        raise ValueError("Feed would exceed the 550 mL working-volume limit.")
    if request.kind == "medium_exchange" and session.culture.volume_ml < 400.1:
        raise ValueError("Not enough volume remains to sample after exchange. Add medium or start a new session.")
    record = {"id": request.request_id, **{k: v for k, v in payload.items() if k != "request_id"},
              "source_collected_at_hour": latest["collected_at_hour"],
              "requested_at_hour": round(session.hour, 6), "started_at_hour": None,
              "completed_at_hour": None, "status": "queued", "progress": 0.0,
              "outcome": None, "cancel_reason": None}
    session.interventions.append(record)
    session.stop("Guard decision queued. Waiting for the visible 3D controller to execute it.")
    session.touched = time.monotonic()
    return record


def cancel_intervention(session, id, reason):
    record = next((item for item in session.interventions if item["id"] == id), None)
    if not record:
        raise ValueError("Intervention not found.")
    if record["status"] == "cancelled":
        return record
    if record["status"] == "applied":
        raise ValueError("Applied interventions cannot be cancelled or undone.")
    record.update(status="cancelled", cancel_reason=reason, completed_at_hour=round(session.hour, 6))
    if session.phase == "intervening":
        session.phase = "complete"
    session.stop("Intervention cancelled. No medium transfer was applied; elapsed culture time is retained.")
    session.touched = time.monotonic()
    return record
