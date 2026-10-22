"""Opt-in NVIDIA trial adapter for bundled public DNA only. No paid fallback or downloads."""

import base64
import hashlib
import io
import json
import os
import re
import threading
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
import numpy as np
from pydantic import Field

from backend.agent_store import fingerprint
from backend.db import connect
from backend.evo2_dataset import DatasetPreparationRequest
from backend.models import InputModel

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://health.api.nvidia.com/v1/biology/arc/evo2-7b/forward"
MODEL = "arc/evo2-7b-forward"
METHOD = "next-base-full-vocabulary-sum-no-bos-v1"
MAX_BYTES = 4 * 1024 * 1024
SLOT = threading.BoundedSemaphore(1)


class NvidiaSettings(InputModel):
    enabled: bool = False
    free_api_confirmed: bool = False
    key_file: str = "deploy/secrets/nvidia_api_key.txt"
    daily_request_limit: int = Field(default=20, strict=True, ge=1, le=20)
    logits_layer: str = Field(default="unembed", pattern=r"^(output_layer|unembed)$")


class NvidiaScoreRequest(InputModel):
    variant_id: str = Field(min_length=1, max_length=120, pattern=r"^(?:KEL|SLC14A1):rs[0-9]+:[0-9]+:[ACGT]:[ACGT]$")

    def selection(self):
        return DatasetPreparationRequest(variant_ids=[self.variant_id])


class TrialError(Exception):
    def __init__(self, code, detail, http_status=503):
        self.code, self.detail, self.http_status = code, detail, http_status
        super().__init__(detail)


def get_nvidia_settings():
    path = Path(os.environ.get("EVO2_NVIDIA_CONFIG", str(ROOT / "data/evo2-nvidia.local.json")))
    try:
        values = json.loads(path.read_text(encoding="utf-8-sig")) if path.is_file() else {}
        for name in NvidiaSettings.model_fields:
            override = os.environ.get("EVO2_NVIDIA_" + name.upper())
            if override is not None:
                values[name] = int(override) if name == "daily_request_limit" else override
        return NvidiaSettings.model_validate(values)
    except (OSError, ValueError):
        raise TrialError("configuration_error", "NVIDIA trial configuration is invalid. Review the server-only configuration.") from None


def read_key(settings):
    # Never expose the path, value, prefix, exception text, or upstream response body.
    key = os.environ.get("EVO2_NVIDIA_API_KEY", "")
    if not key:
        path = Path(settings.key_file)
        if not path.is_absolute():
            path = ROOT / path
        try:
            with path.open(encoding="utf-8-sig") as file:
                key = file.read(4096).strip()
        except OSError:
            return ""
    return key if re.fullmatch(r"nvapi-[A-Za-z0-9_-]{16,2048}", key) else ""


def today():
    return datetime.now(timezone.utc).date().isoformat()


def trial_status(settings):
    day = today()
    with connect() as db:
        used = db.execute("SELECT COUNT(*) FROM evo2_nvidia_attempts WHERE day=%s", (day,)).fetchone()[0]
        pause = db.execute("SELECT reason FROM evo2_nvidia_pause WHERE day=%s", (day,)).fetchone()
    key_present = bool(read_key(settings))
    reason = ("disabled" if not settings.enabled else "free_trial_not_confirmed" if not settings.free_api_confirmed
              else "api_key_missing" if not key_present else pause[0] if pause else
              "daily_limit_reached" if used >= settings.daily_request_limit else "ready")
    return {"provider": "NVIDIA API Catalog trial", "model": MODEL, "status": reason,
            "configured": key_present, "enabled": settings.enabled, "free_api_confirmed": settings.free_api_confirmed,
            "ready": reason == "ready", "availability": "not_checked_with_provider", "requests_used_today": used,
            "daily_request_limit": settings.daily_request_limit, "requests_remaining": max(0, settings.daily_request_limit - used),
            "quota_day_utc": day, "max_variants_per_action": 1, "max_requests_per_action": 2,
            "logits_layer": settings.logits_layer, "paid_fallback_enabled": False, "automatic_retries_enabled": False,
            "public_dataset_only": True, "local_inference_enabled": False,
            "billing_note": "Only the fixed NVIDIA trial endpoint is allowed. Account eligibility/pricing must be verified by the operator; an API key cannot prove free access."}


def cache_id(sequence, layer):
    return fingerprint({"endpoint": ENDPOINT, "model": MODEL, "method": METHOD, "layer": layer,
                        "sequence_sha256": hashlib.sha256(sequence.encode()).hexdigest()})


def decode_logits(raw, content_type, sequence, layer):
    """Bound ZIP/NPY sizes, disable pickle, and require exact sequence/vocabulary alignment."""
    try:
        if "application/json" in content_type:
            data = json.loads(raw)
            encoded = data["data"]
            if not isinstance(encoded, str) or len(encoded) > MAX_BYTES:
                raise ValueError()
            # Hosted NIM wraps Base64 with ASCII newlines. Remove only transport whitespace;
            # keep strict validation for every other character and retain the encoded-size cap.
            encoded = encoded.translate(str.maketrans("", "", " \t\r\n"))
            archive = base64.b64decode(encoded, validate=True)
        elif content_type.split(";")[0].strip() in {"application/zip", "application/x-npz", "application/octet-stream"}:
            archive = raw
        else:
            raise ValueError()
        if len(archive) > MAX_BYTES:
            raise ValueError()
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            entries = zipped.infolist()
            names = [entry.filename for entry in entries]
            if not entries or len(entries) > 8 or len(names) != len(set(names)) or sum(e.file_size for e in entries) > MAX_BYTES:
                raise ValueError()
            matches = [name for name in names if name in {layer + ".npy", layer + ".output.npy"}]
            if len(matches) != 1:
                raise ValueError()
            member = zipped.read(matches[0])
        stream = io.BytesIO(member)
        version = np.lib.format.read_magic(stream)
        if version == (1, 0):
            shape, fortran, dtype = np.lib.format.read_array_header_1_0(stream, max_header_size=4096)
        elif version == (2, 0):
            shape, fortran, dtype = np.lib.format.read_array_header_2_0(stream, max_header_size=4096)
        else:
            raise ValueError()
        n = len(sequence)
        if (shape not in {(n, 512), (n, 1, 512), (1, n, 512)} or fortran or dtype.kind != "f"
            or dtype.itemsize not in {2, 4, 8} or len(member) - stream.tell() != n * 512 * dtype.itemsize):
            raise ValueError()
        logits = np.load(io.BytesIO(member), allow_pickle=False, max_header_size=4096).reshape(n, 512).astype(np.float64)
        if not np.isfinite(logits).all():
            raise ValueError()
        # At position i, predict the actual base i+1 over the full 512-token vocabulary.
        values = logits[:-1]
        maximum = values.max(axis=1)
        log_partition = maximum + np.log(np.exp(values - maximum[:, None]).sum(axis=1))
        targets = np.frombuffer(sequence[1:].encode("ascii"), dtype=np.uint8).astype(np.int64)
        likelihood = float((values[np.arange(n - 1), targets] - log_partition).sum())
        if not np.isfinite(likelihood) or likelihood > 0:
            raise ValueError()
        return {"log_likelihood": likelihood, "scored_positions": n - 1,
                "sequence_sha256": hashlib.sha256(sequence.encode()).hexdigest(),
                "response_sha256": hashlib.sha256(raw).hexdigest(), "tensor_sha256": hashlib.sha256(archive).hexdigest(),
                "tensor_shape": list(shape), "logits_layer": layer, "method": METHOD,
                "recorded_at": datetime.now(timezone.utc).isoformat()}
    except (ValueError, KeyError, TypeError, OSError, EOFError, zipfile.BadZipFile, OverflowError, RuntimeError, NotImplementedError, zlib.error):
        raise TrialError("invalid_provider_output", "NVIDIA returned an unsupported or invalid logits tensor. No score was fabricated.", 502) from None


def forward(sequence, key, layer):
    # No configurable URL, proxy inheritance, redirects, retries, queues or paid endpoint.
    try:
        with httpx.Client(timeout=httpx.Timeout(60, connect=10), follow_redirects=False, trust_env=False) as client:
            with client.stream("POST", ENDPOINT, headers={"Authorization": "Bearer " + key, "Accept": "application/json", "Accept-Encoding": "identity"},
                               json={"sequence": sequence, "output_layers": [layer]}) as response:
                if response.status_code != 200:
                    code = {401: "provider_auth_failed", 402: "provider_payment_required", 403: "provider_access_denied",
                            404: "provider_unavailable", 410: "provider_unavailable", 429: "provider_rate_limited",
                            422: "provider_contract_mismatch"}.get(response.status_code, "provider_failed")
                    hint = " Review the server logits layer: hosted NIM uses unembed; some NIM 2.x deployments use output_layer." if response.status_code == 422 else ""
                    raise TrialError(code, "NVIDIA trial request failed (HTTP " + str(response.status_code) + "). No retry or paid fallback was used." + hint,
                                     429 if response.status_code == 429 else 503)
                raw = bytearray()
                for chunk in response.iter_bytes(chunk_size=65536):
                    raw.extend(chunk)
                    if len(raw) > MAX_BYTES:
                        raise TrialError("invalid_provider_output", "NVIDIA response exceeded the size limit. No score was fabricated.", 502)
                return decode_logits(bytes(raw), response.headers.get("content-type", ""), sequence, layer)
    except httpx.HTTPError:
        # httpx exception strings can contain URLs/headers. Never return them to callers.
        raise TrialError("provider_network_error", "NVIDIA trial request could not complete. No automatic retry was used.") from None


def score_public_variant(request, dataset, settings):
    selection = request.selection()
    row = dataset.variant(selection.variant_ids[0])  # Unknown IDs fail before quota/network.
    if not settings.enabled or not settings.free_api_confirmed:
        raise TrialError("trial_disabled", "Enable and confirm NVIDIA free trial access in the server-only configuration first.", 409)
    key = read_key(settings)
    if not key:
        raise TrialError("api_key_missing", "Install the NVIDIA API key on the backend. Never enter it in the browser or chat.", 409)
    if not SLOT.acquire(blocking=False):
        raise TrialError("busy", "Another NVIDIA trial request is running. No new request was sent.", 409)
    try:
        day = today()
        sequences = [row["reference_sequence"], row["alternate_sequence"]]
        ids = [cache_id(sequence, settings.logits_layer) for sequence in sequences]
        values, reservations = {}, {}
        with connect() as db:
            # Serializes quota reservations across workers until this transaction commits.
            db.execute("LOCK TABLE evo2_nvidia_attempts IN EXCLUSIVE MODE")
            for id in ids:
                cached = db.execute("SELECT value_json FROM evo2_nvidia_cache WHERE id=%s", (id,)).fetchone()
                if cached:
                    values[id] = json.loads(cached[0])
            missing = [id for id in ids if id not in values]
            pause = db.execute("SELECT reason FROM evo2_nvidia_pause WHERE day=%s", (day,)).fetchone()
            used = db.execute("SELECT COUNT(*) FROM evo2_nvidia_attempts WHERE day=%s", (day,)).fetchone()[0]
            if missing and pause:
                raise TrialError(pause[0], "NVIDIA trial requests are paused for today after a provider error. Cached results remain available.", 409)
            if used + len(missing) > settings.daily_request_limit:
                raise TrialError("daily_limit_reached", "The local daily NVIDIA request cap would be exceeded. No request was sent.", 429)
            for id, sequence in zip(ids, sequences):
                if id in missing:
                    attempt_id = uuid4().hex
                    reservations[id] = attempt_id
                    db.execute("INSERT INTO evo2_nvidia_attempts VALUES (%s, %s, %s, %s, %s)",
                               (attempt_id, day, hashlib.sha256(sequence.encode()).hexdigest(), "reserved",
                                datetime.now(timezone.utc).isoformat()))
        try:
            for id, sequence in zip(ids, sequences):
                if id in values:
                    continue
                value = forward(sequence, key, settings.logits_layer)
                values[id] = value
                with connect() as db:
                    db.execute("INSERT INTO evo2_nvidia_cache VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET value_json = excluded.value_json", (id, json.dumps(value, allow_nan=False)))
                    db.execute("UPDATE evo2_nvidia_attempts SET status='completed' WHERE id=%s", (reservations[id],))
        except TrialError as error:
            with connect() as db:
                for attempt_id in reservations.values():
                    db.execute("UPDATE evo2_nvidia_attempts SET status=%s WHERE id=%s AND status='reserved'", (error.code, attempt_id))
                if error.code in {"provider_payment_required", "provider_access_denied", "provider_unavailable", "provider_rate_limited", "invalid_provider_output"}:
                    db.execute("INSERT INTO evo2_nvidia_pause VALUES (%s, %s) ON CONFLICT (day) DO UPDATE SET reason = excluded.reason", (day, error.code))
            raise
        ref, alt = (values[id] for id in ids)
        result = {"schema_version": "hemoforge-evo2-nvidia-result-v1", "result_id": "evo2nv-" + uuid4().hex,
                  "provider": "NVIDIA API Catalog trial", "endpoint": ENDPOINT, "provider_model": MODEL,
                  "checkpoint_sha256": None, "provider_model_version": None,
                  "execution_status": "provider_scored", "cache_hit": not bool(reservations),
                  "new_requests_reserved": len(reservations), "generated_at": datetime.now(timezone.utc).isoformat(),
                  "variant": {k: row[k] for k in ("id", "gene", "variant_id", "contig", "position_1based", "ref", "alt", "split")},
                  "dataset_sequence_pairs_sha256": dataset.pairs_sha256, "dataset_catalog_sha256": dataset.catalog_sha256,
                  "scoring": {"method": METHOD, "reduce_method": "sum", "prepend_bos": False, "vocabulary_size": 512,
                              "scored_positions": len(sequences[0]) - 1, "average_reverse_complement": False},
                  "reference": ref, "alternate": alt,
                  "delta_log_likelihood": alt["log_likelihood"] - ref["log_likelihood"],
                  "evidence_quality": "unverified_exploratory", "laboratory_status": "pending_lab_verification",
                  "limitations": ["Provider model/version is not pinned; this is not the local evo2_7b_base checkpoint.",
                                  "First base is excluded; no BOS token is added. Do not compare directly with the offline worker's BOS scoring.",
                                  "A likelihood difference is not pathogenicity, antigen phenotype, or clinical validation.",
                                  "Public sequence examples are not donor genotypes. HemoBot does not automatically consume these results."]}
        with connect() as db:
            db.execute("INSERT INTO evo2_nvidia_results (id, value_json) VALUES (%s, %s)", (result["result_id"], json.dumps(result, allow_nan=False)))
        return result
    finally:
        SLOT.release()


def load_result(id):
    if re.fullmatch(r"evo2nv-[a-f0-9]{32}", id) is None:
        return None
    with connect() as db:
        row = db.execute("SELECT value_json FROM evo2_nvidia_results WHERE id=%s", (id,)).fetchone()
    return json.loads(row[0]) if row else None


def latest_result(variant_id, dataset_hash, layer):
    with connect() as db:
        row = db.execute("""SELECT value_json FROM evo2_nvidia_results
            WHERE value_json::jsonb #>> '{variant,id}' = %s
            AND value_json::jsonb ->> 'dataset_sequence_pairs_sha256' = %s
            AND value_json::jsonb ->> 'provider_model' = %s
            AND value_json::jsonb #>> '{scoring,method}' = %s
            AND value_json::jsonb #>> '{reference,logits_layer}' = %s
            ORDER BY created_at DESC LIMIT 1""", (variant_id, dataset_hash, MODEL, METHOD, layer)).fetchone()
    return json.loads(row[0]) if row else None
