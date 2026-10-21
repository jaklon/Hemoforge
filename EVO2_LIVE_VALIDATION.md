# Evo 2 hosted trial · one public variant validation

Validated on **21 October 2026 at 17:18 WIB** (10:18 UTC), using the user's
server-only NVIDIA trial credential. No credential, private configuration,
raw provider response, runtime database or result record is committed here.

## Observed result

| Field | Value |
|---|---|
| Public variant | KEL rs1010453097 |
| Assembly / position | GRCh38 chr7:142941114, forward genomic orientation |
| Alleles | T → C |
| Input source | Bundled public reference dataset, train development split |
| Sequence length | 257 bases each |
| Provider | NVIDIA API Catalog trial |
| Endpoint | `https://health.api.nvidia.com/v1/biology/arc/evo2-7b/forward` |
| Logits layer / member | `unembed` / `unembed.output.npy` |
| Observed tensor | `[1, 257, 512]`, float64, C order |
| Reference log-likelihood | −337.53641414295464 |
| Alternate log-likelihood | −338.2672166522042 |
| Delta, alternate minus reference | **−0.7308025092495427** |

The scoring method sums 256 next-base log-probabilities over the full 512-token
vocabulary, excluding the first input base, without an added BOS token or
reverse-complement averaging. The exact provider checkpoint/version remains
unknown. This is not the offline `evo2_7b_base`/BOS configuration.

The result appeared in the application's **NVIDIA trial · real Evo 2 inference**
panel after an explicit frontend action. It displayed the three numerical scores,
the public variant identity, exploratory-use limitations and an export link.
The export returned HTTP 200. Input hashes matched the bundled reference/alternate
sequences, and the exported delta matched alternate minus reference.

**Load saved result · local only** restored the same scores in the frontend with
a cached-result badge. The local cache lookup/export did not add NVIDIA requests.
The browser screenshot and complete result JSON remain in ignored `data/` files
on the operator's machine.

## Compatibility fixes discovered

1. The hosted deployment rejected the NIM 2.x layer name `output_layer` with HTTP
   422. NVIDIA's NIM 1.x documentation identifies `unembed` as its logits layer;
   the setting was explicitly corrected, with no automatic retry or model fallback.
   The backend, Windows setup helper and optional Compose override now default to
   the observed hosted contract. `output_layer` remains an explicit server option.
2. The hosted JSON response contained line-wrapped Base64. The strict parser
   initially rejected it. Only ASCII transport whitespace is now normalized;
   invalid characters, object arrays, mismatched shapes, non-finite logits and
   oversized archives remain rejected. A synthetic regression covers the observed
   member name, shape, float64 dtype and line wrapping, plus invalid Unicode.

The failed reference response had been discarded, so one additional reference-only
diagnostic request was explicitly counted and retained privately. After the parser
fix, this real response was validated offline and reused in the reference cache;
only the alternate sequence needed a new inference call to finish the pair.
The parser-error pause was cleared after this review, without clearing attempt
history or touching any payment/access-related pause.

## Requests and spending boundary

Only **one public variant** was tested. The observed sequence of upstream calls was:

- One HTTP 422 request with `output_layer`.
- One successful `unembed` response rejected by the original Base64 parser.
- One explicit reference-only diagnostic response, then reused locally.
- One successful alternate-sequence response.

That is **four actual upstream calls**, with **six conservative quota reservations**
because failed/unused pair reservations are retained. The final UI showed 6/20
reserved and 14 remaining. There was no automatic retry, paid fallback, subscription,
GPU rental, model download or Docker build. The fixed trial endpoint and operator's
free-access confirmation were retained throughout. No provider invoice/billing
dashboard was inspected, so this report does not independently certify account
charges; it records the trial-only execution path and absence of paid actions.

Sources: [NVIDIA NIM 1.x layer/output contract](https://docs.nvidia.com/nim/bionemo/evo2/1.0.2/endpoints.html),
[NVIDIA trial access and limits](https://forums.developer.nvidia.com/t/nvidia-nim-faq/300317).
