# HemoForge ↔ JEV — complete code handoff for local development

**Date:** 2026-10-24  
**Repository:** `https://github.com/jaklon/Hemoforge`  
**Purpose:** Give the local development AI everything needed to reproduce the JEV backend integration, review it, build the React interface, and deploy using **local push → GitHub → Arch server pull only**.

> **Important Git state:** These changes exist in a **local commit on the Arch deployment server**, `db41231` (`Add authenticated JEV GPU inference integration`). They have **NOT been pushed**. HTTPS push from the server failed with `403 Permission to jaklon/Hemoforge.git denied to AtlasCJr`. The local developer must transfer/recreate the changes and push from an authorized account. Do **not** assume GitHub already contains these files.

## 1. Architecture and boundaries

```text
Browser (React/Vite, HemoForge)
    │  same-origin, session cookie (hemoforge_session)
    ▼
HemoForge FastAPI (arch-friend, port 8000)
    ├─ Existing HemoBot `/api/v1/hemobot/*` — preserve evidence selection/audits
    └─ New JEV `/api/v1/jev/*` — requires signed-in account
         │  X-API-Key added exclusively on server
         ▼
       GCP JEV FastAPI (Tailscale 100.73.220.76:8000)
         ├─ OpenBioLLM — biomedical natural-language inference
         ├─ Bonsai 8B — drafting/report writing
         └─ Evo 2 7B — DNA sequence likelihood comparisons
```

JEV is a **separate AI inference mode**. Do not replace HemoBot's existing curated evidence / scientific audit functionality. The three models can produce mistakes; e.g. an actual OpenBioLLM test incorrectly described HbA as four identical globin chains. Evo 2 scores are **not** transfusion compatibility tests, mutation occurrence probabilities, or stand-alone pathogenicity diagnoses.

## 2. What has already been built and tested on Arch

- `backend/jev_client.py` — **new** JEV HTTP client; passes private API key to GCP. Previously verified direct health, submit and job retrieval.
- `backend/jev_routes.py` — **new** protected routes, account-specific job retrieval, prototype 10 requests/account/rolling 24h limit.
- `backend/api.py` — **two added lines** to import/include router.
- Supabase PostgreSQL table `jev_jobs` and index **already created** on the server-connected database.
- Server backend restarted, `GET /api/health` successful; unauthenticated `GET /api/v1/jev/status` returned HTTP **401** as expected. In-process OpenAPI includes all JEV paths.
- **Not yet tested:** successful authenticated browser submission through the new HemoForge endpoints, frontend JEV mode, production concurrency/rate-limit/CSRF security.
- The Git server commit is local `db41231`; the staged commit contained 3 files, 211 insertions. Untracked `backend/api.py.before-jev` is merely a local backup and must not be committed.

## 3. Files to implement locally

The following is a handoff snapshot based on the code executed in the deployment terminal. Inspect exact source when transferring the server commit rather than assuming this Markdown is a byte-perfect replacement.

### 3A. NEW `backend/jev_client.py`

The deployed client has these public functions and behavior:

```python
import os
from pathlib import Path
import uuid
import httpx

JEV_URL = os.environ.get("JEV_URL", "http://100.73.220.76:8000").rstrip("/")
KEY_FILE = Path(os.environ.get("JEV_API_KEY_FILE", str(Path.home() / ".config/hemoforge/jev.key")))

class JEVError(RuntimeError):
    pass

def _headers():
    key = os.environ.get("JEV_API_KEY", "").strip()
    if not key:
        if not KEY_FILE.is_file():
            raise JEVError("JEV API key is not configured")
        key = KEY_FILE.read_text().strip()
    if not key:
        raise JEVError("JEV API key is empty")
    return {"X-API-Key": key}

def health():
    try:
        with httpx.Client(timeout=10, trust_env=False) as client:
            response = client.get(JEV_URL + "/health")
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise JEVError("JEV health check failed") from exc

def submit(message):
    if not isinstance(message, str) or not 1 <= len(message) <= 20000:
        raise ValueError("Invalid JEV message length")
    try:
        with httpx.Client(timeout=15, trust_env=False) as client:
            response = client.post(JEV_URL + "/v1/chat", headers=_headers(), json={"message": message})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise JEVError("JEV job submission failed") from exc

def get_job(job_id):
    try:
        job_id = str(uuid.UUID(str(job_id)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("Invalid JEV job ID") from exc
    try:
        with httpx.Client(timeout=15, trust_env=False) as client:
            response = client.get(JEV_URL + "/v1/jobs/" + job_id, headers=_headers())
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise JEVError("JEV job lookup failed") from exc
```

**Credential rules:** `JEV_API_KEY` or `JEV_API_KEY_FILE` is read only on the FastAPI server. Current Arch user `friend` has key at `~/.config/hemoforge/jev.key` with mode `0600`. Ensure the service process runs under a user able to read it. Do not put secrets in `VITE_*`, browser code, logs, commit history, or Markdown.

### 3B. NEW `backend/jev_routes.py`

This is the code entered and syntax-checked on Arch:

```python
"""Authenticated JEV access for HemoForge accounts."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.accounts import account_id
from backend.db import connect, Error
from backend.jev_client import JEVError, health, submit, get_job

router = APIRouter(prefix="/api/v1/jev", tags=["JEV GPU inference"])
DAILY_LIMIT = 10

class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=20000)

@router.get("/status")
def jev_status(id=Depends(account_id)):
    try:
        return health()
    except JEVError:
        raise HTTPException(status_code=503, detail="JEV is unavailable")

@router.post("/chat", status_code=202)
def jev_chat(body: ChatRequest, id=Depends(account_id)):
    owner = str(id)
    try:
        with connect() as db:
            row = db.execute(
                """SELECT COUNT(*) FROM jev_jobs
                WHERE account_id = %s
                AND created_at >= NOW() - INTERVAL '24 hours'""",
                (owner,),
            ).fetchone()
            if row[0] >= DAILY_LIMIT:
                raise HTTPException(status_code=429, detail="Daily GPU request limit reached")

            job = submit(body.message)
            db.execute(
                "INSERT INTO jev_jobs (job_id, account_id) VALUES (%s, %s)",
                (job["job_id"], owner),
            )
        return job
    except JEVError:
        raise HTTPException(status_code=503, detail="GPU inference service unavailable")
    except (Error, OSError):
        raise HTTPException(status_code=503, detail="Job tracking unavailable")

@router.get("/jobs/{job_id}")
def jev_job(job_id: UUID, id=Depends(account_id)):
    owner = str(id)
    try:
        with connect() as db:
            row = db.execute(
                "SELECT 1 FROM jev_jobs WHERE job_id = %s AND account_id = %s",
                (str(job_id), owner),
            ).fetchone()
    except (Error, OSError):
        raise HTTPException(status_code=503, detail="Job tracking unavailable")
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        return get_job(str(job_id))
    except JEVError:
        raise HTTPException(status_code=503, detail="Could not retrieve JEV job")
```

### 3C. MODIFY `backend/api.py`

Import alongside existing routers:

```diff
 from backend.agent_routes import router as agent_router
+from backend.jev_routes import router as jev_router
```

Register before the static frontend mount:

```diff
 app.include_router(agent_router)
+app.include_router(jev_router)
 app.include_router(evo2_router)
```

Do not remove any of the other existing routers.

### 3D. DATABASE migration — Supabase PostgreSQL

Already executed once against the current server DB; add an **idempotent migration** to source control for fresh environments:

```sql
CREATE TABLE IF NOT EXISTS jev_jobs (
    job_id UUID PRIMARY KEY,
    account_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jev_jobs_account
    ON jev_jobs (account_id, created_at);
```

**Review:** Check the actual `accounts.id` column type; `account_id TEXT` mirrors the prototype but may warrant a matching foreign key type and `ON DELETE CASCADE` depending on account lifecycle. Ensure DB schema ownership/permissions are appropriate.

## 4. JEV upstream API contract

Private GCP endpoint is reachable over Tailscale `http://100.73.220.76:8000` from Arch.

| API | Auth | Request/response |
|---|---|---|
| `GET /health` | No key in prototype | `{"status":"online","models":...}` |
| `POST /v1/chat` | `X-API-Key` | `{"message":"Use OpenBioLLM to ..."}` → JSON with `job_id`, `status` (initially `queued`) |
| `GET /v1/jobs/{uuid}` | `X-API-Key` | JSON with `status`, `selected_model`, `routing_reason`, `result`, `error` |

Statuses: `queued`, `running`, `completed`, `failed`. Model labels: `openbiollm`, `bonsai`, `evo2`. In JEV, explicitly mentioning a model triggers explicit routing; otherwise a model router/fallback chooses. Handle unexpected/missing fields, and stop polling when the UI unmounts.

**Verified direct end-to-end test:** Job `9a733ef3-2e8f-4934-9614-b1bc0cf5884a` completed, `selected_model=openbiollm`, `routing_reason=Explicit OpenBioLLM request`, `error=None`. Output quality was not reliable; display model content as *AI-generated* and avoid unverified medical claims.

## 5. React integration requirements

Relevant files found on server:

- `src/HemoBot.tsx` — existing UI; preserve layout and current research analysis.
- `src/hemobot-api.ts` — existing API helper for `/api/v1/hemobot/status` and `/analyze`; don't overwrite its semantics.
- `src/App.tsx` — routing / parent component.
- `src/account.ts` — browser auth session handling.
- `src/hemobot-api.test.ts` — existing test conventions.

Implement a separate **JEV AI** tab/mode within HemoBot, with a dedicated client module such as `src/jev-api.ts`:

1. Same-origin `GET /api/v1/jev/status` for availability (credentials/session cookie as needed by existing app).
2. `POST /api/v1/jev/chat` with JSON `{message}`; show new job immediately (202).
3. Poll `GET /api/v1/jev/jobs/${encodeURIComponent(jobId)}` at a moderate interval; handle queued/running/completed/failed and network failures; cancel on unmount; avoid multiple simultaneous polling loops.
4. Display chosen model, routing reason (if present), plain text output, and error messages. **Never** render LLM output using unsanitized `dangerouslySetInnerHTML`.
5. Handle `401` by prompting sign-in, `429` by displaying daily-limit message, `503` with a retryable service-unavailable state. Respect timeouts and do not silently resubmit (would duplicate paid GPU jobs).
6. Explain clearly: research-only, not a validated clinical/transfusion tool; Evo 2 predicts DNA sequence likelihood, **not blood compatibility**.
7. Keep existing Research Analysis mode unchanged; avoid replacing audited citations, verification, or agent controls with a generated reply.
8. Add frontend tests and manual QA for all statuses and auth errors.

No frontend JEV code had been modified on the server as of this handoff.

## 6. Security and correctness issues to fix before public launch

**High priority**

- **CSRF protection:** Session uses `hemoforge_session` HttpOnly, SameSite=Lax cookie. A cookie-authenticated write endpoint needs appropriate Origin/Referer checks and/or CSRF tokens, plus secure deployment settings.
- **Atomic quotas:** `SELECT COUNT(*)` then remote `submit()` then `INSERT` is vulnerable to concurrent requests. Enforce per-account requests atomically in DB or a rate limiter, and consider a global GPU queue/concurrency budget.
- **Remote request inside DB transaction:** The current implementation holds a PostgreSQL transaction while performing remote HTTP, increasing lock/connection pressure. Design a reservation/status transition with transaction boundaries and failure recovery.
- **Auth and job ownership:** Existing `Depends(account_id)` is mandatory, and job lookup must enforce account ownership; test one user cannot read another's result. Decide whether old jobs should have retention periods.
- **Error mapping:** If the GCP API key is wrong, upstream is rate-limited, or remote jobs expire, the prototype maps most upstream errors to generic 503. Add safe structured errors without leaking secrets.
- **Model safety:** Both biomedical models and Evo 2 can hallucinate or be misused as clinical decision support; keep explicit research-only language and validate scientific claims. Never equate genotype similarity with transfusion matching; real compatibility depends on ABO/Rh and other antigens, antibody screening, crossmatching, and clinical context.

**Operational**

- JEV job queue/results are only in memory. GCP JEV restart loses pending/completed jobs even though HemoForge DB retains job IDs. Plan persistence and a job-expired state.
- Restrict GCP API to private Tailscale network; enforce key auth for inference paths; protect logs (sequences may be sensitive).
- Make JEV base URL configurable per environment, not hard-coded into browser assets.
- Validate allowed content length, rate limits, potential abuse, privacy and sensitive DNA sequence handling.
- Improve OpenBioLLM output formatting and biomedical factuality; do not treat successful inference as scientific validation.

## 7. Verification conducted

Executed on `arch-friend` successfully:

```bash
.venv/bin/python -m py_compile backend/api.py backend/jev_routes.py backend/jev_client.py
```

OpenAPI exposed:

```text
GET  /api/v1/jev/status
POST /api/v1/jev/chat
GET  /api/v1/jev/jobs/{job_id}
```

`TestClient(app).get('/api/v1/jev/status')` returned HTTP 401 `{"detail":"Sign in to continue."}`; after backend restart live `curl http://127.0.0.1:8000/api/health` returned `{"status":"ok",...}` and `curl -i http://127.0.0.1:8000/api/v1/jev/status` returned HTTP 401. These confirm routing/auth but **not authenticated JEV browser flow**.

## 8. Move the local server commit into the authorized developer checkout

Prefer transporting the **actual Git patch**, avoiding retyping the snapshot above.

On `arch-friend`:

```bash
cd ~/Hemoforge
git format-patch -1 db41231 --stdout > /tmp/hemoforge-jev.patch
```

On Windows PowerShell with Tailscale access (IP should be verified before use):

```powershell
scp friend@100.70.43.23:/tmp/hemoforge-jev.patch .
```

In the **authorized local** HemoForge repository (clean worktree):

```bash
git switch main
git pull --ff-only origin main
git am /path/to/hemoforge-jev.patch
# Copy this Markdown document to docs/HEMOFORGE_JEV_COMPLETE_CODE_HANDOFF.md
# Review/test before any push
git push origin main
```

If `git am` reports conflicts or the commit already exists, stop and inspect; don't force-push. The Arch server should subsequently `git pull --ff-only` after reconciling its one locally-created commit, rather than a blind pull that may diverge. The server must not overwrite production configs or secrets.

**Untracked server file:** `backend/api.py.before-jev` is a backup. Do not stage or commit it.

## 9. Expected deployment workflow after handoff

```text
Development PC: edit + tests → git commit → git push origin main
Arch server:     git fetch → verify/reconcile history → git pull --ff-only → build → restart
GCP:             separate maintained JEV service (API key stays private)
```

Use the existing service manager and environment when restarting `uvicorn`; do not start a second process on an occupied port. The Arch backend was observed running `backend.api:app` on port 8000.

## 10. Definition of done for the developer AI

- Backend JEV routes are present and tested in the **GitHub version** of HemoForge.
- DB migration is checked into the local project.
- React HemoBot retains Research Analysis and adds JEV AI mode.
- Signed-in user can submit a job and see completion/error without seeing private API keys.
- Unauthorized users receive 401; cross-account job reads 404; quota exceedance 429.
- Unit/integration tests pass, and API/client errors are handled.
- Security issues above are addressed or explicitly documented as blockers before public access.
- Build succeeds; deployment uses GitHub pull on Arch, with no routine server-side source edits.

## 11. Implementation status in this repository (2026-10-24)

Implemented from the snapshot above, with these changes from the prototype:

- `backend/jev_client.py` — same env vars; upstream HTTP status kept on `JEVError.status`; `JEVKeyMissing` when no key is configured.
- `backend/jev_routes.py`
  - **CSRF:** `POST /chat` requires header `X-HemoForge-Action: jev-chat` (custom header forces a CORS preflight this API never grants; cookie is also SameSite=Lax).
  - **Atomic quota, no remote call inside a transaction:** a short transaction takes `pg_advisory_xact_lock` per account, counts, and inserts a placeholder row; GCP is called afterwards; the row is then updated to the real `job_id` (or deleted if submission failed).
  - **Error mapping:** upstream 401/403 → 502 (server key rejected), 429 → 503 (busy), job 404 → 410 (expired / GCP restarted), missing key → 503 "not configured".
  - `/status` returns only `status` and `models` (from `supported_models`).
- `backend/schema.sql` — idempotent `jev_jobs` table (FK to `accounts(id) ON DELETE CASCADE` on fresh DBs, RLS on). Applied automatically by `backend/db.py` on first connect. The existing server table is compatible.
- `backend/test_jev.py` — 401 without session, 403 without action header, 429 after 10, cross-account read 404, failed submit releases its quota slot, 410 on expired job, missing key message.
- Frontend: `src/jev-api.ts` (+ `src/jev-api.test.ts`), `src/JevAssistant.tsx`, HemoBot gets a "Research analysis | JEV AI · GCP" toggle. Research analysis is unchanged.
- **Status pills:** the top-bar "LLM" pill and the HemoBot header pill now show the GCP (JEV) connection via `/api/v1/jev/status`.

**Server reconciliation:** the Arch server's unpushed local commit `db41231` touches the same files. After this lands on `main`, drop it on the server (`git fetch && git reset --hard origin/main`, after confirming no other local work) instead of merging, then restart the service. Keep `~/.config/hemoforge/jev.key` (mode 0600) readable by the service user.

**Still open before public access:** no global GPU concurrency budget (GCP queue is the only limit); JEV job state is in GCP memory (jobs show "expired" after a GCP restart); no retention policy for `jev_jobs`; OpenBioLLM factuality.
