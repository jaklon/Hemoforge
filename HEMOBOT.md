# HemoForge · HemoBot implementation

HemoForge is the application. HemoBot is its Biomedical English research assistant.
The existing React, prediction API, and Streamlit workflows continue to work.
Open the assistant at `http://127.0.0.1:8443/#bot` during development.

## What is implemented

1. React sends validated source records and the active batch, replay cursor,
   experiment objective, marker signature, and laboratory-request checklist.
2. Python recomputes Guard checks, three-hour checkpoints, GP/EI and factorial
   contrasts when applicable, and deterministic marker results. Browser summaries
   and asserted laboratory passes are not accepted as evidence.
3. The query router chooses relevant modules. An optional local Chroma index adds
   reviewed literature excerpts using `nomic-embed-text` through Ollama.
4. OpenBioLLM selects relevant evidence claim IDs and manual review actions using
   a JSON schema. Pydantic validates its output. The server renders the selected
   statements from exact deterministic values, retaining mandatory limitations.
5. SQLite retains input snapshots, visible deterministic context, the query, and
   the response. JSON, HTML, and Markdown exports include an audit manifest,
   fingerprints, model digest when available, engine, options, and seed 42.

The first implementation intentionally uses **constrained evidence selection**,
not unrestricted LLM prose. Matching numerical tokens alone cannot establish that
an arbitrary generated causal claim is true. The model cannot author additional
numbers, diagnose contamination, pass QC, execute code, choose URLs, issue SQL,
invoke equipment, or suppress required evidence limits. User queries and document
excerpts are treated as data. Output is English; enter research questions in English.

| Feature | Current implementation |
|---|---|
| Guard | Positive-count validity and two consecutive declines; latest measured channels with their actual times/units |
| ErythroPilot | Completed three-hour checkpoints; explicit no-new-measurement intervals |
| CulturePlan | Shared Python RBF GP, expected improvement for observed settings, held-out condition MAE; descriptive 2×2 contrasts only for complete designs |
| RareMatch | Normalized two-marker screening, unknown calls retained, actual input profile counts, pending laboratory verification |
| Missing protocol rules | Explicitly not configured; no invented glucose/metabolite/staleness thresholds |
| GSE53983 stage classifier | Not available; no training data or validated model artifact is bundled |
| Evo 2 | Roadmap preview only, with no sequence scoring or genomic stability claim |
| Literature | Empty until reviewed source documents are indexed; no bundled citations impersonate publications |

Culture, experiment, and marker files have independent provenance. The built-in
examples do not become BATH-01456, GSE53983, or a 2,504-profile dataset by naming
them in a prompt. Original file hashes are reported by the browser; Python also
hashes the exact normalized records it receives. Neither hash verifies biology.

## Arch model server: 8 vCPU, 64 GB RAM, 100 GB free, no GPU

The model gateway is intended to run on the private Tailscale network. Keep the actual server address in ignored local configuration.
There is no SSH username/access in this repository, so run these steps on that
server. Docker builds are Linux/amd64. Initial builds need internet access.

Install Docker/Compose with the server administrator's normal Arch maintenance
workflow (`sudo pacman -Syu docker docker-compose` on a maintained Arch host),
then start Docker (`sudo systemctl enable --now docker`). Run the following
with an account that is permitted to use Docker. Its Docker access grants host
administration privileges.

From the repository root:

```bash
export HEMOBOT_BIND_IP="YOUR_SERVER_TAILSCALE_IP"
bash deploy/start-model-server.sh
docker compose -f deploy/compose.models.yml ps
```

The script builds an Ollama image containing both:

```text
hf.co/aaditya/OpenBioLLM-Llama3-8B-GGUF:Q4_K_M
nomic-embed-text
```

Model weights live in `/opt/ollama/models` **inside the built image**. Startup
does not pull them again. Do not mount an empty volume over that directory.
Image tags can change upstream: record the built image ID and model digests for
the demo; retain/export the image if identical offline deployment is required.
`OLLAMA_IMAGE` can override the default upstream version after reviewing it.

Ollama has one loaded model and one inference slot, an 8K context, CPU inference,
and a 24 GB container memory ceiling. The gateway caps generated output to 384
tokens and rejects concurrent inference with 429. CPU latency is unbenchmarked;
64 GB RAM does not guarantee interactive GPU-like speed. Allow initial build space
for Docker layers/cache as well as the model files; inspect `docker system df`
before downloading additional quantizations. No Evo 2 weights are installed.

Only the authenticated gateway is published:

```text
your local Python API --Tailscale + bearer token--> YOUR_SERVER_TAILSCALE_IP:11434
                                                    |
                                               gateway:8080
                                                    |
                                         internal Ollama:11434
```

The gateway allows only model inventory, structured non-streaming chat, and
bounded embeddings for the two configured models. Pull/create/delete and other
administration routes are not exposed. Containers have dropped capabilities and
bounded memory/PIDs/logs. The gateway runs as a non-root user with a read-only
filesystem. Its bearer token is required even from other tailnet machines.
Restrict the server's Tailscale access policy to the intended developer machines;
the gateway binds only the configured Tailscale address, with loopback as its safe default. Tailscale supplies
transport encryption; do not forward this HTTP port onto the public internet.
Set `HEMOBOT_BIND_IP=127.0.0.1` before the script when using an SSH tunnel instead.

The bootstrap generates `deploy/secrets/ollama_token.txt`. Transfer its contents
privately to the local backend configuration; do not paste it into chat, commit
it, or put it in a `VITE_` variable. On Linux, the host secret directory is 0700;
the file is read-only so file-backed Compose secrets are readable by the non-root
gateway. The parent directory protects the host copy. Rotation requires updating
the file, recreating the gateway container, and updating the local configuration.

No-auth readiness check (returns no prompts or secret):

```bash
curl --fail http://YOUR_SERVER_TAILSCALE_IP:11434/health
# Requesting /api/tags without Authorization must return 401.
```

## Connect the existing Windows application

Copy `config/hemobot.example.json` to `hemobot.local.json` in the repository root.
Set the server URL to the private gateway and replace the token placeholder privately. The model name is already configured.
The local config, secret directory, database, and corpus files are gitignored and
excluded from Docker build context. Settings are read on each API request.

All settings also accept the `HEMOBOT_` prefix, for example
`HEMOBOT_OLLAMA_URL`, `HEMOBOT_MODE=template`, or
`HEMOBOT_OLLAMA_TOKEN_FILE` for an externally mounted secret.

Restart the local Python API after upgrading its code, then use the existing
`start-python.ps1` and `npm run dev` workflow. That startup script leaves occupied
ports unchanged; stop the previous API process before starting its replacement.

In HemoBot choose **Deterministic template only** to test without a model server.
In automatic mode, unavailable models, invalid JSON/claim selections, queue
contention, or timeouts produce a visibly labeled template fallback. A failed
input computation or failed audit write returns an error, not a successful run.
The browser retains work when switching pages, cancels waiting when source/context
changes, and rejects superseded responses. Cancelling the browser wait does not
guarantee cancellation of an inference already running on the server.

## Optional complete application Docker stack

The root `Dockerfile` builds React and the Python runtime, including optional RAG
dependencies. It does not embed secrets, audit datasets, or literature files.
After privately placing the gateway token in `deploy/secrets/ollama_token.txt`, create ignored `deploy/.env.local` with `HEMOBOT_OLLAMA_URL=http://YOUR_SERVER_TAILSCALE_IP:11434`. The model bootstrap also reads this file for `HEMOBOT_BIND_IP` when present:

```bash
docker compose --env-file deploy/.env.local -f deploy/compose.app.yml up --build -d --wait
```

This serves HemoForge on `http://127.0.0.1:8000/#bot`, the API documentation on
`http://127.0.0.1:8000/docs`, and Streamlit on `http://127.0.0.1:8501`. The frontend
and API share an origin. Streamlit shares the API network namespace and connects
through loopback. Ports stay bound to loopback; the research API is single-user
and is not an authenticated public/multi-tenant deployment. A named volume retains
SQLite audits. If running on the friend's server, access these loopback ports
through an SSH tunnel rather than publishing the research API on the tailnet.

## Optional offline literature RAG

Install on the **Python API machine**, not necessarily the Ollama machine:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-rag.txt
```

Place legally available, reviewed English UTF-8 TXT/Markdown documents in
`knowledge/corpus/`. Convert and review any PDF text separately. Copy
`knowledge/manifest.example.json`, then record each actual title, independent
study ID, DOI/reference, relative file path, and SHA-256 of its bytes. The example
manifest is intentionally not an ingestible publication.

```powershell
Get-FileHash knowledge/corpus/reviewed-paper.txt -Algorithm SHA256
.\.venv\Scripts\python.exe -m backend.agent_rag knowledge/manifest.local.json
```

Enable `rag_enabled` in `hemobot.local.json` after successful indexing. Chroma
never downloads a default embedding model: vectors come from the configured
Ollama gateway. File traversal, unsupported formats, oversized corpora, and hash
mismatches are rejected. Changing embedding model/digest requires reindexing.
Each successful index atomically replaces the active collection pointer, so old
chunks are not mixed into a new corpus. Old collections remain on disk until the
operator removes them while maintaining the index. Retrieval is limited to three
short excerpts under a cosine-distance cutoff; unavailable or empty retrieval
is visible and does not manufacture citations. Literature excerpts are displayed
as source material, not accepted as observations of the active culture.

## Audit storage and replay

`data/hemobot.sqlite3` stores normalized input snapshots and completed analyses,
including queries. It persists across browser refresh and API restart, with no
automatic expiry. This is a change from prediction-only in-memory processing.
Keep the directory private, protect backups, and set a retention policy before
using sensitive research records. To reset local audits, stop the API and remove
the database plus its `-wal`/`-shm` companions from the configured data directory.

The full uploaded culture input can contain later samples in the private SQLite
workspace snapshot. The context exposed to the LLM and audit exports contains
only culture samples/channels at or before the selected replay time. Fingerprints
may change when original source content changes, even if the visible observations
do not. Independent experiment and marker files have no inferred common timeline.

The exported context hashes to `context_fingerprint`; the exported
`analysis.audit_manifest` hashes to `analysis_fingerprint`, using sorted ASCII JSON
with compact separators and SHA-256. UTC timestamps and unique response IDs are
outside the reproducible content hash. A recorded seed does not promise
bit-identical future Ollama execution across model builds/hardware; the rendered
claims and deterministic context remain reconstructible from the audit.

## API and checks

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/hemobot/status` | Model connection state without exposing host credentials |
| `POST /api/v1/hemobot/analyze` | Validate source records, compute context, select/render evidence, persist audit |
| `GET /api/v1/hemobot/analyses/{id}/export?format=json\|html\|markdown` | Download the stored audit, honoring the replay boundary |

```powershell
.\.venv\Scripts\python.exe -m unittest backend.test_predictions backend.test_agent backend.test_agent_rag deploy.test_gateway -v
$testFiles = @(rg --files src -g '*.test.ts')
node --experimental-strip-types --test $testFiles
node node_modules/typescript/bin/tsc --noEmit
npm run build
docker compose -f deploy/compose.models.yml config --quiet
docker compose -f deploy/compose.app.yml config --quiet
```

References used for integration: [Ollama chat/schema API](https://docs.ollama.com/api/chat),
[embedding API](https://docs.ollama.com/api/embed),
[server configuration](https://docs.ollama.com/faq),
[publisher's GGUF model](https://huggingface.co/aaditya/OpenBioLLM-Llama3-8B-GGUF),
[Chroma explicit embeddings](https://docs.trychroma.com/docs/collections/add-data).
