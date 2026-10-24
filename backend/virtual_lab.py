"""Stage D: local culture, FLEX2 and Guard intervention demonstration sessions.

Guided sessions follow rendered frames. Dataset Live uses an explicit local
server clock and durable SQLite records. No instrument or external inference.
"""

import asyncio
import copy
import hashlib
import json
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import Field, ValidationError
from starlette.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from backend.models import InputModel
from backend.culture_simulation import (Culture, MODEL_VERSION, ASSAY_SECONDS, ASSAY_HOURS,
                                       ANALYZED_ML, NOISE, assay_reading, assay_stage,
                                       INTERVENTION_SECONDS, INTERVENTION_HOURS, MAX_VOLUME_ML)
from backend.lab_interventions import (PairRequest, InterventionRequest, matches_token,
    active_intervention, queue_intervention, cancel_intervention, DECISION_MAX_AGE_HOURS)
from backend.lab_analytics import AnalyticsRequest, live_analytics

router = APIRouter(prefix="/api/v1/lab", tags=["Virtual Lab - local synthetic prototype"])
ORIGINS = {f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (8000, 8443)}
MAX_SESSIONS = 16
MAX_RESULTS = 100
END_HOUR = 168.0
ANALYSIS_SECONDS = ASSAY_SECONDS
ANALYSIS_HOURS = ASSAY_HOURS
MODEL = MODEL_VERSION


def local_client(connection):
    # Restrict the prototype even when the application adds remote trusted hosts.
    return (connection.client is not None and connection.client.host in {"127.0.0.1", "::1", "testclient"}
            and urlsplit("http://" + connection.headers.get("host", "")).hostname in
            {"localhost", "127.0.0.1", "::1", "testserver"}
            and connection.headers.get("origin") in ORIGINS)


def local_read_client(connection):
    # Same-origin GET/downloads may omit Origin. Reject explicit cross-site reads.
    return (connection.client is not None and connection.client.host in {"127.0.0.1","::1","testclient"}
            and urlsplit("http://"+connection.headers.get("host","")).hostname in {"localhost","127.0.0.1","::1","testserver"}
            and connection.headers.get("origin") in {None,*ORIGINS}
            and connection.headers.get("sec-fetch-site") not in {"cross-site"})


class RunConfig(InputModel):
    execution_mode: Literal["guided", "dataset"] = "guided"
    max_batches: int = Field(default=0, strict=True, ge=0, le=10000)
    device_profile: Literal["biostat-str-gen2", "legacy-flex2"] = "biostat-str-gen2"
    scenario: Literal["balanced", "nutrient_limited", "metabolite_stress"] = "balanced"
    seed: int = Field(default=42, strict=True, ge=0, le=2_147_483_647)


class Command(InputModel):
    seq: int = Field(strict=True, ge=1, le=1_000_000)
    action: Literal["play", "pause", "advance", "collect", "load", "analyze", "speed", "execute", "setpoints", "sensor_fault", "disturbance"]
    disturbance: Literal["ph_drop", "low_do", "low_nutrients"] = "ph_drop"
    ph_setpoint: float = Field(default=7.3, ge=6.8, le=7.6)
    do_setpoint: float = Field(default=40, ge=20, le=60)
    temperature_setpoint: float = Field(default=37, ge=35, le=38)
    sensor: Literal["core", "trace", "viamass"] = "trace"
    seconds: float = Field(default=0, ge=0, le=0.5)
    speed: Literal[0.05, 0.25, 1, 6, 12] = 6
    volume_ml: float = Field(default=1, ge=0.1, le=5)
    mixed: bool = Field(default=True, strict=True)
    intervention_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")


@dataclass
class Session:
    scenario: str = "balanced"
    seed: int = 42
    culture: Culture = field(init=False)
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
    assays: list = field(default_factory=list)
    interventions: list = field(default_factory=list)
    intervention_seconds: float = 0.0
    operator_token: str | None = None
    pairing_code: str | None = None
    pairing_expires: float = 0.0
    pairing_attempts: int = 0

    def __post_init__(self):
        self.culture = Culture(self.scenario)

    def stop(self, reason):
        self.running = False
        self.reason = reason
        self.revision += 1

    def snapshot(self):
        return {
            "type": "snapshot", "schema_version": 3, "session_id": self.id,
            "batch_id": "VL-" + self.id[:8].upper(), "model_version": MODEL,
            "created_at": self.created_at, "revision": self.revision, "ack_seq": self.seq,
            "culture_hours": round(self.hour, 6), "end_hour": END_HOUR,
            "speed": self.speed, "running": self.running, "phase": self.phase,
            "controller_connected": self.controller, "reason": self.reason,
            "analysis_progress": min(1, self.analysis_seconds / ANALYSIS_SECONDS),
            "assay_stage": assay_stage(self.analysis_seconds / ANALYSIS_SECONDS) if self.sample else "idle",
            "protocol": {"animation_seconds": ANALYSIS_SECONDS, "culture_minutes": ANALYSIS_HOURS * 60,
                         "analyzed_volume_ml": ANALYZED_ML},
            "scenario": self.scenario, "seed": self.seed, "uncertainty_model": NOISE,
            "working_volume_ml": round(self.culture.volume_ml, 6),
            "withdrawn_volume_ml": round(self.culture.withdrawn_ml, 6),
            "added_volume_ml": self.culture.added_ml, "exchanged_volume_ml": self.culture.exchanged_ml,
            "operator_paired": self.operator_token is not None,
            "interventions": self.interventions, "active_intervention": active_intervention(self),
            "intervention_protocol": {"animation_seconds": INTERVENTION_SECONDS,
                "culture_minutes": INTERVENTION_HOURS * 60, "max_volume_ml": MAX_VOLUME_ML,
                "decision_max_age_hours": DECISION_MAX_AGE_HOURS},
            "assays": self.assays,
            "sample": self.sample, "measurements": self.results,
            "measurements_sha256": hashlib.sha256(json.dumps(self.results, sort_keys=True).encode()).hexdigest(),
        }

    def apply(self, command):
        if command.action == "disturbance":
            raise ValueError("Teaching disturbances require the BIOSTAT profile.")
        # An exact retransmission cannot repeat a sample or advance the clock twice.
        if command.seq <= self.seq:
            return
        if command.seq != self.seq + 1:
            raise ValueError("Command gap. Reconnect before continuing.")
        action = command.action
        active = active_intervention(self)
        if action == "play":
            if active and active["status"] == "queued":
                raise ValueError("Wait for the 3D controller to accept the queued intervention.")
            if self.phase in {"collected", "loaded"}:
                raise ValueError("Finish the current sample workflow first.")
            if self.hour >= END_HOUR and self.phase not in {"analyzing", "intervening"}:
                raise ValueError("This run reached 168 h. Start a new session.")
            self.running = True
            self.reason = "Culture follows the visible 3D animation."
        elif action == "pause":
            self.stop("Paused by the simulation. No culture time advances.")
        elif action == "speed":
            self.speed = command.speed
        elif action == "advance":
            if self.running:
                if self.phase == "intervening":
                    seconds = min(command.seconds, INTERVENTION_SECONDS - self.intervention_seconds)
                    self.intervention_seconds += seconds
                    self.culture.advance(seconds * INTERVENTION_HOURS / INTERVENTION_SECONDS)
                    self.hour += seconds * INTERVENTION_HOURS / INTERVENTION_SECONDS
                    active["progress"] = min(1, self.intervention_seconds / INTERVENTION_SECONDS)
                    if self.intervention_seconds >= INTERVENTION_SECONDS - 1e-8:
                        outcome = self.culture.intervene(active["kind"], active["amount"])
                        active.update(status="applied", progress=1.0, outcome=outcome,
                                      completed_at_hour=round(self.hour, 6))
                        self.phase = "complete"
                        self.stop("Guard intervention applied to the reactor. Collect FLEX2 again to measure its effect.")
                elif self.phase == "analyzing":
                    seconds = min(command.seconds, ANALYSIS_SECONDS - self.analysis_seconds)
                    self.analysis_seconds += seconds
                    hours = seconds * ANALYSIS_HOURS / ANALYSIS_SECONDS
                    self.culture.advance(hours)
                    # Pending assays finish even when collected at the 168 h boundary.
                    self.hour += hours
                    if self.analysis_seconds >= ANALYSIS_SECONDS - 1e-8:
                        flags = []
                        if self.sample["withdrawal_ml"] < ANALYZED_ML:
                            flags.append("insufficient_sample_volume")
                        if not self.sample["mixed"]:
                            flags.append("sample_not_mixed")
                        quality = {"status": "rejected" if flags else "passed", "flags": flags}
                        report = {**self.sample, "quality": quality,
                                  "available_at_hour": round(self.hour, 6)}
                        self.assays.append(report)
                        if not flags:
                            self.results.append({**report, **assay_reading(self.frozen, self.seed, self.sample["sample_id"]),
                                "analyzed_volume_ml": ANALYZED_ML, "model_version": MODEL,
                                "evidence": "software_test_only"})
                        self.phase = "complete"
                        self.stop("Sample rejected by teaching QC; no Guard observation published. Collect a new sample."
                                  if flags else "FLEX2 result published to Guard. Resume culture for the next sample.")
                else:
                    hours = min(END_HOUR - self.hour, command.seconds * self.speed)
                    self.culture.advance(hours)
                    self.hour += hours
                    if self.hour >= END_HOUR:
                        self.stop("End of demonstration run. Sampling remains available.")
        elif action == "collect":
            if active or self.phase not in {"idle", "complete"}:
                raise ValueError("A sample is already in progress.")
            if len(self.assays) >= MAX_RESULTS:
                raise ValueError("This prototype supports at most 100 samples per run.")
            if self.assays and self.hour <= self.assays[-1]["collected_at_hour"]:
                raise ValueError("Advance culture before collecting another sample.")
            if self.hour > END_HOUR:
                raise ValueError("This run is complete. Start a new session.")
            self.culture.withdraw(command.volume_ml)
            self.sample = {"sample_id": f"FLEX2-{len(self.assays) + 1:03d}",
                           "collected_at_hour": round(self.hour, 6),
                           "withdrawal_ml": command.volume_ml, "mixed": command.mixed,
                           "reactor_volume_before_ml": round(self.culture.volume_ml + command.volume_ml, 6),
                           "reactor_volume_after_ml": round(self.culture.volume_ml, 6)}
            self.frozen = self.culture.reading()
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
            self.reason = "Eight animated seconds represent 4.5 culture minutes; the reactor continues evolving."
        elif action == "execute":
            if not active or active["id"] != command.intervention_id or active["status"] != "queued":
                raise ValueError("This intervention is no longer queued.")
            self.intervention_seconds = 0.0
            active.update(status="executing", started_at_hour=round(self.hour, 6))
            self.phase = "intervening"
            self.running = True
            self.reason = "3D reactor is executing the confirmed Guard decision."
        self.seq = command.seq
        self.revision += 1
        self.touched = self.last_tick = time.monotonic()


sessions: dict[str, Session] = {}


def find_session(id):
    session = sessions.get(id)
    if not session or (not getattr(session,"dataset_campaign",None) and time.monotonic() - session.touched > 3600):
        sessions.pop(id, None)
        raise HTTPException(404, "Local session expired or API restarted. Start a new run.")
    return session


@router.post("/sessions", status_code=201)
async def create(request: Request, config: RunConfig | None = None):
    if not local_client(request) or request.headers.get("x-hemoforge-action") != "virtual-lab":
        raise HTTPException(403, "Open Virtual Lab on localhost to create a session.")
    for id in list(sessions):
        if not getattr(sessions[id],"dataset_campaign",None) and time.monotonic() - sessions[id].touched > 3600:
            del sessions[id]
    if len(sessions) >= MAX_SESSIONS:
        raise HTTPException(429, "Local session limit reached. Restart the prototype API or wait for expiry.")
    config = config or RunConfig()
    from backend.biostat import BiostatSession
    session_type = BiostatSession if config.device_profile == "biostat-str-gen2" else Session
    session = session_type(scenario=config.scenario, seed=config.seed)
    if config.execution_mode == "dataset":
        if config.device_profile != "biostat-str-gen2":
            raise HTTPException(422,"Dataset Live requires BIOSTAT Gen 2.")
        from backend.dataset_runtime import runtime
        try:
            runtime.create(session,max_batches=config.max_batches)
        except (ValueError,OSError) as error:
            raise HTTPException(409,str(error)) from error
    sessions[session.id] = session
    return {"session_id": session.id, "controller_token": session.token}


def authorized_session(request, id, role):
    if not local_client(request) or request.headers.get("x-hemoforge-action") != "virtual-lab":
        raise HTTPException(403, "Use the local Virtual Lab application.")
    session = find_session(id)
    expected = session.token if role == "controller" else session.operator_token
    supplied=request.headers.get(f"x-lab-{role}", "")
    valid=controller_matches(session,supplied) if role=="controller" else matches_token(supplied,expected)
    if not valid:
        raise HTTPException(403, "Control authorization expired or is missing. Pair the Guard again.")
    return session


def controller_matches(session, supplied):
    expected=getattr(session,"_controller_digest",None)
    if expected:
        return isinstance(supplied,str) and supplied.isascii() and matches_token(hashlib.sha256(supplied.encode()).hexdigest(),expected)
    return matches_token(supplied,session.token)


@router.get("/datasets")
async def dataset_list(request: Request):
    if not local_read_client(request):
        raise HTTPException(403,"Use localhost to view synthetic campaigns.")
    from backend.dataset_runtime import runtime
    return {"campaigns":[campaign.public() for campaign in runtime.campaigns.values()]}


@router.get("/sessions/{id}/dataset/{table}.csv")
async def dataset_csv(request: Request,id: str,table: str):
    if not local_read_client(request):
        raise HTTPException(403,"Use localhost to export synthetic data.")
    from backend.dataset_store import KINDS
    campaign=getattr(find_session(id),"dataset_campaign",None)
    if not campaign or table not in KINDS:
        raise HTTPException(404,"Dataset table unavailable.")
    return StreamingResponse(campaign.store.csv_rows(id,table),media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition":f'attachment; filename="{id}-{table}.csv"',"Cache-Control":"no-store"})


@router.get("/sessions/{id}/dataset/manifest")
async def dataset_manifest(request: Request,id: str):
    if not local_read_client(request): raise HTTPException(403,"Use localhost.")
    campaign=getattr(find_session(id),"dataset_campaign",None)
    if not campaign: raise HTTPException(404,"Not a dataset campaign.")
    from backend.dataset_scenarios import CATALOG
    from backend.lab_alerts import RULES
    from backend.dataset_store import KINDS
    return {**campaign.public(),"catalog":CATALOG,"alarm_rules":RULES,"tables":KINDS,"units":{"culture_time":"hours","volume":"mL","glucose_glutamine_lactate_ammonium":"mmol/L","do":"percent air saturation","temperature":"C","cell_density":"million cells/mL","capacitance":"pF/cm","ph":"pH","cell_count":"million cells"},
        "training_notice":"Synthetic, unvalidated model output. Ground truth, scenario labels and events are labels/metadata, never model input features. Join features only where available_at_hour <= prediction_time. Split/group entire runs, not adjacent rows. Validate against independent experimental data.",
        "clock":"No fabricated progress while API/PC offline. Automatic resume from last SQLite checkpoint; all writes local."}


@router.post("/sessions/{id}/pairing")
async def enable_pairing(request: Request, id: str):
    session = authorized_session(request, id, "controller")
    session.pairing_code = secrets.token_hex(6)
    session.pairing_expires = time.monotonic() + 120
    session.pairing_attempts = 0
    return {"code": session.pairing_code, "expires_in_seconds": 120}


@router.post("/sessions/{id}/pair")
async def pair(request: Request, id: str, payload: PairRequest):
    if not local_client(request) or request.headers.get("x-hemoforge-action") != "virtual-lab":
        raise HTTPException(403, "Use the local Guard application.")
    session = find_session(id)
    session.pairing_attempts += 1
    if (session.pairing_attempts > 10 or time.monotonic() >= session.pairing_expires
            or not matches_token(payload.code.lower(), session.pairing_code)):
        raise HTTPException(403, "Pairing code invalid or expired. Generate a new code in the 3D window.")
    session.pairing_code = None
    session.operator_token = secrets.token_urlsafe(32)
    session.revision += 1
    session.touched = time.monotonic()
    return {"operator_token": session.operator_token}


@router.post("/sessions/{id}/revoke-operator")
async def revoke_operator(request: Request, id: str):
    session = authorized_session(request, id, "controller")
    session.operator_token = session.pairing_code = None
    active = active_intervention(session)
    if active:
        cancel_intervention(session, active["id"], "Operator access revoked from the 3D controller.")
    session.revision += 1
    return {"operator_paired": False}


@router.post("/sessions/{id}/interventions", status_code=201)
async def decide(request: Request, id: str, payload: InterventionRequest):
    session = authorized_session(request, id, "operator")
    if getattr(session,"dataset_campaign",None):
        raise HTTPException(409,"Dataset Live owns its audited automatic interventions.")
    try:
        return queue_intervention(session, payload, END_HOUR)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


@router.post("/sessions/{id}/interventions/{intervention_id}/cancel")
async def cancel_decision(request: Request, id: str, intervention_id: str):
    session = authorized_session(request, id, "operator")
    if getattr(session,"dataset_campaign",None):
        raise HTTPException(409,"Pause Dataset Live instead of altering a recorded experiment.")
    try:
        return cancel_intervention(session, intervention_id, "Cancelled by the Guard operator.")
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


@router.post("/sessions/{id}/analytics")
async def analytics(request: Request, id: str, payload: AnalyticsRequest):
    if not local_client(request) or request.headers.get("x-hemoforge-action") != "virtual-lab":
        raise HTTPException(403, "Use the local live dashboard.")
    session = find_session(id)
    snapshot = copy.deepcopy(session.snapshot())
    if payload.source_hash != snapshot["measurements_sha256"]:
        raise HTTPException(409, "Released measurements changed. Refresh the live analysis.")
    # Read-only computation on a public snapshot. No culture timers or hidden-state access.
    return await run_in_threadpool(live_analytics, snapshot, payload)


class AlarmAction(InputModel):
    alert_id: str = Field(pattern=r"^(ph|do|glucose|ph_high|do_high|temperature_low|temperature_high|lactate)-[1-9][0-9]{0,2}$")
    action: Literal["acknowledge", "restore_buffer", "restore_aeration"]


@router.post("/sessions/{id}/alarm-actions")
async def alarm_action(request: Request, id: str, payload: AlarmAction):
    session = authorized_session(request, id, "operator")
    if getattr(session,"dataset_campaign",None):
        raise HTTPException(409,"Dataset Live uses an audited automatic policy. Use a guided session for manual decisions.")
    if not hasattr(session, "alarm_action"):
        raise HTTPException(409, "Alarms require a BIOSTAT training session.")
    try:
        return session.alarm_action(payload)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


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
        if (not isinstance(hello, dict) or not isinstance(hello.get("role"), str)
                or hello["role"] not in {"controller", "viewer"}):
            await socket.close(code=1008)
            return
        controller = hello["role"] == "controller"
        supplied_token = hello.get("token", "")
        if session.viewers >= 6 or (controller and (session.controller or not controller_matches(session,supplied_token))):
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
            dataset = getattr(session,"dataset_campaign",None)
            if sessions.get(id) is not session or (not dataset and time.monotonic() - session.touched > 3600):
                sessions.pop(id, None)
                session.stop("Local session expired. Start a new run.")
                await socket.close(code=1008)
                break
            if not dataset and session.running and time.monotonic() - session.last_tick > 2:
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
                if dataset: dataset.flush()
            except (ValidationError, ValueError):
                await socket.send_json({"type": "error", "detail": "Action refused. Check the current step and reconnect if needed."})
                await socket.send_json(session.snapshot())
    except (WebSocketDisconnect, TimeoutError, ValueError, RuntimeError):
        pass
    finally:
        if joined:
            if controller:
                session.controller = False
                if not getattr(session,"dataset_campaign",None):
                    session.stop("3D controller disconnected. Culture is paused.")
            else:
                session.viewers -= 1
