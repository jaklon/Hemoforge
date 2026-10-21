# Evo 2 through the NVIDIA trial API

This optional integration runs real hosted forward inference for **one bundled
public KEL/SLC14A1 variant per explicit action**. The application does not rent a
GPU, download weights, start a model container, subscribe to a paid plan, or fall
back to a paid provider. It starts disabled until an operator installs a key and
confirms that the account has free trial access to this particular endpoint.

The integration has now been validated with one public variant against NVIDIA's
hosted trial endpoint; see [live validation](EVO2_LIVE_VALIDATION.md). Automated
tests continue to use explicitly synthetic logits with a mock HTTP transport.
Access/availability can still vary by account and provider deployment.

## Obtain the API key

1. Sign in to the [NVIDIA API Catalog](https://build.nvidia.com/arc/evo2-7b-forward)
   with a free NVIDIA Developer Program account. Complete any account verification.
2. Open **evo2-7b-forward** and select **Get API Key**. Generate a key for the hosted
   developer/trial API, then copy it privately. A key for Docker registry access
   alone does not demonstrate access to the hosted endpoint.
3. Check that this model is available to your account under free trial access and
   review the account's rate limit. If the page only offers downloads, requires
   payment, or says the hosted endpoint is deprecated/unavailable, leave integration
   disabled. Do not choose a paid partner endpoint or rent hardware as a workaround.

NVIDIA describes API Catalog access as a no-cost prototyping/trial experience,
with model-dependent limits. Current access is rate-limited, not a promised number
of signup credits. See the [NVIDIA FAQ](https://forums.developer.nvidia.com/t/nvidia-nim-faq/300317)
and [trial/rate-limit clarification](https://forums.developer.nvidia.com/t/request-more-4-000-credits-option-on-build-nvidia-com/344567).
The application cannot inspect billing entitlements from a key or guarantee future
provider pricing. The free-access confirmation is the operator's check, not an API
billing verification. No endpoint substitution or payment escalation is supported.

## Install securely on Windows

On the machine running the Python API, open PowerShell in the repository and run:

```powershell
Set-Location D:\Jascon\Lomba\GenHack\webapp
.\configure-evo2-nvidia.ps1 -ConfirmFreeTrial
```

Paste the key only at the script's **hidden prompt**. It is never a command-line
argument, so it does not appear literally in shell history. The script sets an
owner-only Windows file ACL before writing `deploy/secrets/nvidia_api_key.txt`.
It writes non-secret configuration to ignored `data/evo2-nvidia.local.json`:

```json
{
  "enabled": true,
  "free_api_confirmed": true,
  "key_file": "deploy/secrets/nvidia_api_key.txt",
  "daily_request_limit": 20,
  "logits_layer": "unembed"
}
```

Both locations are excluded from Git and Docker build contexts. Do not put the key
in `public/`, `src/`, a `VITE_*` variable, browser storage, chat, screenshots, GitHub
comments, or a committed configuration. The key remains plaintext in a file with
restricted access, not an encrypted vault. Restrict backups and access to the
backend machine. If it is exposed, revoke it in NVIDIA and rerun the script with a
replacement key.

Configuration and key files are reread on each local action, so an already updated
API does not need a restart when installing/rotating a key. Restart the Python API
once after updating its source code. Refresh the browser after frontend changes.

## Arch/Linux backend

Use the same non-secret JSON configuration above under `data/`. For the credential,
run these commands interactively in Bash from the repository:

```bash
umask 077
mkdir -p deploy/secrets data
read -rsp 'NVIDIA API key: ' evo_nvidia_key
printf '\n'
printf '%s' "$evo_nvidia_key" > deploy/secrets/nvidia_api_key.txt
unset evo_nvidia_key
chmod 600 deploy/secrets/nvidia_api_key.txt
```

The API process must run as the account permitted to read that file. A secret
manager can instead supply `EVO2_NVIDIA_API_KEY` directly to the backend process;
never put its literal value into a shell command or frontend build variable.

Optional server-only environment overrides are `EVO2_NVIDIA_CONFIG` (config path),
`EVO2_NVIDIA_ENABLED`, `EVO2_NVIDIA_FREE_API_CONFIRMED`, `EVO2_NVIDIA_KEY_FILE`,
`EVO2_NVIDIA_DAILY_REQUEST_LIMIT`, and `EVO2_NVIDIA_LOGITS_LAYER`. The key file is
preferred to a secret environment variable. Allowed logits layers are only
`unembed` (the hosted default) and `output_layer`; no provider URL override exists.

For an already configured application Compose deployment, an optional override is
`deploy/compose.evo2-nvidia.yml`, combined with `deploy/compose.app.yml`. It mounts
the credential as a runtime secret into the application only. Do not add it to
Ollama/Streamlit or bake it into an image. No container build or launch is needed
to use the current local Python/Vite services.

## Try locally

1. Open [Evo 2](http://127.0.0.1:8443/#evo2). Filter/search the public catalogue and
   select **exactly one** variant. Local preparation still accepts up to twenty.
2. In **NVIDIA trial · real Evo 2 inference**, choose **Refresh NVIDIA status**.
   This reads local configuration/quota only and does not contact NVIDIA.
3. Choose **Send … to NVIDIA trial**. Only the reference and alternate DNA from
   the verified local catalogue are sent, without donor/sample identifiers.
4. Review reference/alternate log-likelihood and delta, then **Download NVIDIA
   inference result**. A cached result reuses the original tensor-derived scores.

Use **Load saved result · local only** to recover a completed result after leaving
the page, timing out, exhausting quota, or disabling/removing the key. This performs
only a local database read, matching the current dataset, model/method and layer.

No request is sent on page load, status refresh, variant preview, local preparation,
or export. Leaving the page or aborting browser fetch cannot cancel an upstream
request already sent. It may still finish and consume a reserved request; do not
repeatedly retry. The backend permits one scoring action at a time per process.

## Request and cost controls

- Only `https://health.api.nvidia.com/v1/biology/arc/evo2-7b/forward` is allowed.
  Redirects, environment proxies, automatic retries and paid fallback are disabled.
- A new pair reserves at most two requests atomically in private SQLite before
  contacting NVIDIA. The default and maximum are **20 requests per UTC day**,
  shared across processes and retained across API restarts. Failed or unused
  reservations count conservatively. This is a local cap, not NVIDIA's rate limit.
- Sequence results are cached by endpoint/model name, method, layer and input hash.
  Cache hits do not consume new requests. There is no expiry or automatic refresh.
- Payment-required, access-denied, unavailable/deprecated, rate-limit, or invalid
  tensor responses stop the action and pause new upstream requests for that UTC
  day. Existing fully cached pairs remain readable through the scoring API.
  No model/provider replacement is attempted. Other failures also never auto-retry.
- Only bundled public IDs are accepted. Uploaded FASTA/VCF, donor samples, custom
  URLs, client scores, key submission, or activation settings are rejected.
- The old `POST /api/v1/evo2/score` remains locked. No local GPU inference is enabled.

## Scoring contract and limits

The request sends `sequence` plus `output_layers: ["unembed"]`, matching the hosted
deployment observed in the live test and NVIDIA's
[NIM 1.x contract](https://docs.nvidia.com/nim/bionemo/evo2/1.0.2/endpoints.html).
Some NIM 2.x deployments use `output_layer` instead. If HTTP 422 indicates a layer
mismatch, an operator must review the deployment contract and explicitly adjust
the server-only setting. There is no automatic layer fallback/probe. Each attempt
still counts. If the hosted model is unavailable, stop; the project does not
silently substitute a different model.

The response must be a bounded base64 NPZ in JSON or raw NPZ. Hosted Base64 can
contain ASCII transport whitespace (space, tab, CR or LF); only those characters
are removed before strict decoding. Other invalid/non-ASCII characters still fail.
The encoded-size cap applies before normalization. ZIP sizes, NPY headers,
floating dtypes, finiteness, layer key, exact sequence length and vocabulary size
are checked before computing a score; pickle is disabled. No tensor archive is
extracted to disk and no error body is echoed to the UI/logs.

The hosted model is recorded as **`arc/evo2-7b-forward`**, not `evo2_7b_base`. Exact
provider checkpoint/version is unknown and exported as null. The calculation uses
full 512-token log-softmax and ASCII nucleotide indices. Logits at position `i`
predict the actual base `i+1`; the first base is excluded, with **no added BOS**.
For a 257-base sequence, 256 positions are summed. Delta is alternate minus
reference; no reverse-complement averaging is performed. This differs from the
offline worker's checkpoint/BOS configuration and must not be compared as identical.

The export retains input hashes, tensor/response hashes, observed tensor shape,
method, model name, public variant metadata and recorded timestamps. Raw tensors
are discarded after scoring; the provider checkpoint cannot be independently
verified from these hashes. Scores are exploratory, not pathogenicity probabilities,
antigen predictions, or evidence of laboratory/clinical validation. HemoBot does
not automatically trust or ingest these results. Public dataset files and offline
prepared manifests keep their original null-score contract.

Cached sequence scores, attempt counters and exported result records stay in the
existing private audit SQLite database without automatic expiry. Back it up and
apply the retention policy in HEMOBOT.md. No API key or raw upstream error body is
stored in those tables.

## Troubleshooting

| Status | Action |
|---|---|
| `disabled` / `free_trial_not_confirmed` | Verify account eligibility, then configure the backend explicitly |
| `api_key_missing` | Install a valid NVIDIA key on the API machine; never send it to the browser |
| HTTP 401 | Check/revoke/replace the key; no automatic authentication retry occurs |
| HTTP 402/403 | Stop and review trial eligibility; do not enable payment as a workaround |
| HTTP 404/410 | Hosted model may be unavailable/deprecated; leave scoring disabled |
| HTTP 422 from NVIDIA | Review deployment contract; the tested hosted endpoint uses `unembed`, while some NIM 2.x deployments use `output_layer` |
| HTTP 429 / daily cap | Wait for provider/local limits; no paid escalation or retry loop |
| Invalid tensor | Stop and review provider contract; the API returns no fabricated score |

Disable remote inference by setting `enabled` to `false` in the private config (and
removing any enabled environment override). Local data browsing/preparation still
works. Revoke the key in NVIDIA if it is no longer needed.

Implementation sources: [hosted forward API](https://docs.api.nvidia.com/nim/reference/arc-evo2-7b-infer),
[NIM tensor output format](https://docs.nvidia.com/nim/bionemo/evo2/latest/endpoints.html),
[Evo 2 scoring implementation](https://github.com/ArcInstitute/evo2/blob/main/evo2/scoring.py).
