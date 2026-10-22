"""Stage B: bounded, local-only, in-memory FLEX2 demonstration sessions.

Only accepted animation ticks advance culture time. No database, instrument,
external inference, or autonomous background culture timer is used here.
"""

import asyncio
import hashlib
import json
import math
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import Field, ValidationError

from backend.models import InputModel

router = APIRouter(prefix="/api/v1/lab", tags=["Virtual Lab Â· local synthetic prototype"])
ORIGINS = {f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (8000, 8443)}
MAX_SESSIONS = 16
MAX_RESULTS = 100
END_HOUR = 168.0
ANALYSIS_SECONDS = 5.0  # Presentation duration; not an instrument timing specification.
ANALYSIS_HOURS = 4.5 / 60  # Illustrative compressed assay interval, in culture hours.
MODEL = "virtual-flex2-synthetic-v1"


def local_client(connection):
    # Restrict the prototype even when the application adds remote trusted hosts.
    return (connection.client is not None and connection.client.host in {"127.0.0.1", "::1", "testclient"}
            and urlsplit("http://" + connection.headers.get("host", "")).hostname in
            {"localhost", "127.0.0.1", "::1", "testserver"}
            and connection.headers.get("origin") in ORIGINS)


def synthetic_reading(hour):
    """Uncalibrated teaching scenario, not a biological or device simulator."""
    viable_density = math.exp(0.025 * min(hour, 72) - 0.012 * max(0, hour - 72))
    volume_ml = 500.0
    return {
        "volume_ml": volume_ml,
        "viable_cell_density_million_ml": round(viable_density, 6),
        "count": round(viable_density * volume_ml, 6),
        "unit": "million cells",
        "channels": {
            "ph": round(7.3 - 0.0035 * hour, 3),
            "glucose_mmol_l": round(max(0.2, 24 - 0.10 * hour), 3),
            "glutamine_mmol_l": round(max(0.1, 4 - 0.018 * hour), 3),
            "lactate_mmol_l": round(0.6 + 0.12 * hour, 3),
            "viability_percent": round(max(55, 98 - 0.12 * max(0, hour - 72)), 2),
        },
    }


class Command(InputModel):
    seq: int = Field(strict=True, ge=1, le=1_000_000)
    action: Literal["play", "pause", "advance", "collect", "load", "analyze", "speed"]
    seconds: float = Field(default=0, ge=0, le=0.5)
    speed: Literal[1, 6, 12] = 6


@dataclass
class Session:
    id: str = field(default_factory=lambda: secrets.token_hex(16))
    token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    touched: float = field(default_factory=time.monotonic)
    last_tick: float = field(default_factory=time.monotonic)
    controller: bool = False
    viewers: int = 0
    hour: float = 0.0
    speed: int = 6
    seq: int = 0
    revision: int = 0
    running: bool = False
    phase: str = "idle"
    reason: str = "Ready. Start culture or take the first sample."
    sample: dict | None = None
    frozen: dict | None = None
    analysis_seconds: float = 0.0
    results: list = field(default_factory=list)

    def stop(self, reason):
        self.running = False
        self.reason = reason
        self.revision += 1

    def snapshot(self):
        return {
            "type": "snapshot", "schema_version": 1, "session_id": self.id,
            "batch_id": "VL-" + self.id[:8].upper(), "model_version": MODEL,
            "created_at": self.created_at, "revision": self.revision, "ack_seq": self.seq,
            "culture_hours": round(self.hour, 6), "end_hour": END_HOUR,
            "speed": self.speed, "running": self.running, "phase": self.phase,
            "controller_connected": self.controller, "reason": self.reason,
            "analysis_progress": min(1, self.analysis_seconds / ANALYSIS_SECONDS),
            "sample": self.sample, "measurements": self.results,
            "measurements_sha256": hashlib.sha256(json.dumps(self.results, sort_keys=True).encode()).hexdigest(),
        }

    def apply(self, command):
        # An exact retransmission cannot repeat a sample or advance the clock twice.
        if command.seq <= self.seq:
            return
        if command.seq != self.seq + 1:
            raise ValueError("Command gap. Reconnect before continuing.")
        action = command.action
        if action == "play":
            if self.phase in {"collected", "loaded"}:
                raise ValueError("Finish the current sample workflow first.")
            if self.hour >= END_HOUR:
                raise ValueError("This run reached 168 h. Start a new session.")
            self.running = True
            self.reason = "Culture follows the visible 3D animation."
        elif action == "pause":
            self.stop("Paused by the simulation. No culture time advances.")
        elif action == "speed":
            self.speed = command.speed
        elif action == "advance":
            if self.running:
                if self.phase == "analyzing":
                    seconds = min(command.seconds, ANALYSIS_SECONDS - self.analysis_seconds)
                    self.analysis_seconds += seconds
                    self.hour = min(END_HOUR, self.hour + seconds * ANALYSIS_HOURS / ANALYSIS_SECONDS)
                    if self.analysis_seconds >= ANALYSIS_SECONDS - 1e-8:
                        self.results.append({**self.sample, **self.frozen,
                            "available_at_hour": round(self.hour, 6), "model_version": MODEL,
                            "evidence": "software_test_only"})
                        self.phase = "complete"
                        self.stop("FLEX2 result published to Guard. Resume culture for the next sample.")
                else:
                    self.hour = min(END_HOUR, self.hour + command.seconds * self.speed)
                    if self.hour >= END_HOUR:
                        self.stop("End of demonstration run. Sampling remains available.")
        elif action == "collect":
            if self.phase not in {"idle", "complete"}:
                raise ValueError("A sample is already in progress.")
            if len(self.results) >= MAX_RESULTS:
                raise ValueError("This prototype supports at most 100 samples per run.")
            if self.results and self.hour <= self.results[-1]["collected_at_hour"]:
                raise ValueError("Advance culture before collecting another sample.")
            self.sample = {"sample_id": f"FLEX2-{len(self.results) + 1:03d}",
                           "collected_at_hour": round(self.hour, 6)}
            self.frozen = synthetic_reading(self.hour)
            self.analysis_seconds = 0
            self.phase = "collected"
            self.stop("Sample collected. Guided handling pauses culture until analysis starts.")
        elif action == "load":
            if self.phase != "collected":
                raise ValueError("Collect a sample before loading FLEX2.")
            self.phase = "loaded"
            self.reason = "Sample loaded. Start the virtual FLEX2 assay."
        elif action == "analyze":
            if self.phase != "loaded":
                raise ValueError("Load the collected sample before starting analysis.")
            self.phase = "analyzing"
            self.running = True
            self.reason = "Five animated seconds represent an illustrative 4.5-minute assay interval."
        self.seq = command.seq
        self.revision += 1
        self.touched = self.last_tick = time.monotonic()


sessions: dict[str, Session] = {}


def find_session(id):
    session = sessions.get(id)
    if not session or time.monotonic() - session.touched > 3600:
        sessions.pop(id, None)
        raise HTTPException(404, "Local session expired or API restarted. Start a new run.")
    return session


@router.post("/sessions", status_code=201)
async def create(request: Request):
    if not local_client(request) or request.headers.get("x-hemoforge-action") != "virtual-lab":
        raise HTTPException(403, "Open Virtual Lab on localhost to create a session.")
    for id in list(sessions):
        if time.monotonic() - sessions[id].touched > 3600:
            del sessions[id]
    if len(sessions) >= MAX_SESSIONS:
        raise HTTPException(429, "Local session limit reached. Restart the prototype API or wait for expiry.")
    session = Session()
    sessions[session.id] = session
    return {"session_id": session.id, "controller_token": session.token}


@router.websocket("/sessions/{id}/stream")
async def stream(socket: WebSocket, id: str):
    if not local_client(socket):
        await socket.close(code=1008)
        return
    try:
        session = find_session(id)
    except HTTPException:
        await socket.close(code=1008)
        return
    await socket.accept()
    controller = False
    joined = False
    try:
        raw = await asyncio.wait_for(socket.receive_text(), 5)
        if len(raw) > 2048:
            await socket.close(code=1009)
            return
        hello = json.loads(raw)
        if not isinstance(hello, dict) or hello.get("role") not in {"controller", "viewer"}:
            await socket.close(code=1008)
            return
        controller = hello["role"] == "controller"
        supplied_token = hello.get("token", "")
        if session.viewers >= 6 or (controller and (session.controller or not isinstance(supplied_token, str)
                or not supplied_token.isascii() or not secrets.compare_digest(supplied_token, session.token))):
            await socket.close(code=1008)
            return
        joined = True
        if controller:
            session.controller = True
            session.last_tick = time.monotonic()
        else:
            session.viewers += 1
        session.revision += 1
        last_revision = -1
        while True:
            if sessions.get(id) is not session or time.monotonic() - session.touched > 3600:
                sessions.pop(id, None)
                session.stop("Local session expired. Start a new run.")
                await socket.close(code=1008)
                break
            if session.running and time.monotonic() - session.last_tick > 2:
                session.stop("Animation heartbeat lost. Resume from the 3D window.")
            if session.revision != last_revision:
                await asyncio.wait_for(socket.send_json(session.snapshot()), 2)
                last_revision = session.revision
            try:
                raw = await asyncio.wait_for(socket.receive_text(), 0.2)
            except TimeoutError:
                continue
            if len(raw) > 2048:
                await socket.close(code=1009)
                break
            if not controller:
                await socket.close(code=1008)
                break
            try:
                session.apply(Command.model_validate_json(raw))
            except (ValidationError, ValueError):
                await socket.send_json({"type": "error", "detail": "Action refused. Check the current step and reconnect if needed."})
                await socket.send_json(session.snapshot())
    except (WebSocketDisconnect, TimeoutError, ValueError, RuntimeError):
        pass
    finally:
        if joined:
            if controller:
                session.controller = False
                session.stop("3D controller disconnected. Culture is paused.")
            else:
                session.viewers -= 1
