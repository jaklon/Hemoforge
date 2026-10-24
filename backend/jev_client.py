"""HTTP client for the private JEV GPU inference service on GCP (OpenBioLLM, Bonsai, Evo 2).

The API key is read only on this server (JEV_API_KEY or JEV_API_KEY_FILE) and never reaches the browser or logs.
"""

import os
import uuid
from pathlib import Path

import httpx

JEV_URL = os.environ.get("JEV_URL", "http://100.73.220.76:8000").rstrip("/")
KEY_FILE = Path(os.environ.get("JEV_API_KEY_FILE", str(Path.home() / ".config/hemoforge/jev.key")))


class JEVError(RuntimeError):
    """`status` is the upstream HTTP status, or None when the service was unreachable or unconfigured."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class JEVKeyMissing(JEVError):
    pass


def _headers():
    key = os.environ.get("JEV_API_KEY", "").strip()
    if not key:
        if not KEY_FILE.is_file():
            raise JEVKeyMissing("JEV API key is not configured")
        key = KEY_FILE.read_text().strip()
    if not key:
        raise JEVKeyMissing("JEV API key is empty")
    return {"X-API-Key": key}


def _request(method, path, message, timeout=15, headers=None, **kwargs):
    try:
        with httpx.Client(timeout=timeout, trust_env=False) as client:
            response = client.request(method, JEV_URL + path, headers=headers, **kwargs)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        raise JEVError(message, exc.response.status_code) from None
    except (httpx.HTTPError, ValueError):
        raise JEVError(message) from None
    if not isinstance(data, dict):
        raise JEVError(message)
    return data


def health():
    return _request("GET", "/health", "JEV health check failed", timeout=10)


def submit(message):
    if not isinstance(message, str) or not 1 <= len(message) <= 20000:
        raise ValueError("Invalid JEV message length")
    job = _request("POST", "/v1/chat", "JEV job submission failed", headers=_headers(), json={"message": message})
    try:
        job["job_id"] = str(uuid.UUID(str(job.get("job_id"))))
    except ValueError:
        raise JEVError("JEV returned no job ID") from None
    return job


def get_job(job_id):
    try:
        job_id = str(uuid.UUID(str(job_id)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("Invalid JEV job ID") from exc
    return _request("GET", "/v1/jobs/" + job_id, "JEV job lookup failed", headers=_headers())
