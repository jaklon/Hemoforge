# Evo 2 · public dataset and offline preparation

Local Evo 2 inference remains disabled. Data preparation does not call hosted
models, buy compute, download weights, or provision GPUs. An optional, separately
configured [NVIDIA trial integration](EVO2_NVIDIA.md) can score one bundled public
variant per explicit action. It starts disabled until a backend key and free-access
confirmation are installed. No new dependency was installed. Dataset retrieval
used the free Ensembl REST API, which reported release 116 during retrieval.

## Prepared public reference data

`public/datasets/evo2/` contains **1,000 reference/alternate DNA sequence pairs**:

| Gene | Examples | Reference bases including flanks | Ensembl gene |
|---|---:|---:|---|
| KEL | 500 | 21,512 | ENSG00000197993 |
| SLC14A1 | 500 | 65,753 | ENSG00000141469 |

The collector inspected 7,864 KEL and 24,809 SLC14A1 overlapping variation records.
It selects supported biallelic SNVs after checking GRCh38, forward genomic
orientation, and exact REF allele agreement with the downloaded reference.
Each alternate is constructed in silico from its reported allele, with 128
reference bases on each side: **257 bases per sequence**. The sequence orientation
is forward genomic even when the gene itself is on the reverse strand.
Consequence annotations are sampled in round-robin order using deterministic
hash ordering with seed 42; this intentionally enriches annotation diversity.

| Software-development split | Examples |
|---|---:|
| Train | 645 |
| Validation | 72 |
| Test | 283 |

Complete windows stay within gene-specific 4,096-base genomic blocks; a block
belongs to one split only. Boundary-crossing windows are excluded. Thus overlapping
sequence bases cannot appear in different splits. The ratios above are the actual
counts, not a promised 80/10/10 distribution. This is not a validated clinical
benchmark or a labeled training set.

Files:

- `sequence_pairs.jsonl`: coordinates, alleles, source consequence annotations,
  reference/alternate sequences, hashes, and split IDs.
- `variants.csv`: compact variant metadata and split assignments.
- `<gene>/reference.fasta`: forward GRCh38 reference window.
- `<gene>/variants.vcf`: 500 site-only records with no GT/donor sample column.
  FILTER `.` means not reported, not that QC passed.
- `<gene>/gene.json`: Ensembl annotation and exact reference window coordinates.
- `anchor_markers.json`: source mappings for rs8176058 and rs1058396. Ensembl
  reports multiple alternate alleles at these positions, so their full allele
  records are retained separately from the biallelic development examples.
  Existing RareMatch genotype calls are not changed or reinterpreted.
- `examples.json`: six ready-to-prepare paired-FASTA requests for the UI.
- `catalog.json`: source URLs, retrieval timestamps, response/file SHA-256 hashes,
  selection rules, counts, and exclusions.

Evidence is `public_reference_unverified`. Clinical labels, donor genotypes, and
Evo 2 scores are null. Source consequence annotations do not establish pathogenicity,
antigen phenotype, or post-harvest stability. These files represent variant sites
and sequence pairs; do not upload them as donor-marker CSVs or join them to the
culture study as a donor-to-harvest dataset.

## Verify and reproduce

Verify the shipped snapshot without any network or model execution:

```powershell
.\.venv\Scripts\python.exe -m backend.verify_evo2_data
```

It checks file hashes, counts, coordinates, reference agreement, allele/sequence
hashes, null label/result fields, and genomic split boundaries. Rebuilding into a
new directory uses cached public responses unless downloading is explicitly enabled:

```powershell
.\.venv\Scripts\python.exe -m backend.prepare_public_evo2_data --output data/evo2-rebuilt
# Explicit public data download only; no key, paid provider, or model is used:
.\.venv\Scripts\python.exe -m backend.prepare_public_evo2_data --download-public-data --output data/evo2-new-snapshot
```

Raw responses stay in ignored `.cache/evo2-public/`. Requests are capped at 20 MB
per response and three attempts per endpoint. Existing output directories are
never overwritten. A cached rebuild uses the exact cached bytes; live Ensembl
updates may produce another snapshot. See the publisher's
[data-use information](https://www.ensembl.org/info/about/legal/disclaimer.html)
before adding redistribution terms to downstream derivatives.

## Local preparation and budget lock

Open `http://127.0.0.1:8443/#evo2` or select **Evo 2** in the sidebar. The same
preparation panel remains available in RareMatch. The API verifies the bundled
snapshot's file hashes, reference agreement and split boundaries before serving
it, then holds that snapshot in memory until the Python API restarts. Missing or
corrupt files fail with HTTP 503; no replacement download occurs.

To try the complete public dataset locally:

1. Filter by gene and development split, or search an rsID, position or consequence.
2. Choose **View DNA** to inspect reference/alternate bases, the highlighted SNV,
   and sequence hashes.
3. Select variants across pages, or **Select this page** to replace the selection
   with up to twenty visible variants. The selected list stays visible across filters.
4. Choose **Prepare … variant(s) · no inference**. Only IDs are submitted; the API
   resolves reference/alternate sequences from its verified local snapshot.
5. Review the validated tasks and download the prepared manifest. Scores stay null.

Batch exports record dataset catalog, sequence-pair and selected-record hashes.
Each task retains its variant ID and coordinate; `study_id` records the public
development split. Every task is independent: a mixed batch does not share one
reference window, donor, genotype or haplotype. Hashes provide reproducibility,
not clinical validation. No marker file import is needed to browse the public data.

The manual FASTA/VCF form, six quick examples and marker-readiness check are also
available. **Validate & prepare without inference** produces an exportable manifest.
Two SNP calls alone never reconstruct DNA or donor haplotypes.

Supported inputs:

- Paired FASTA: one reference/alternate record each, equal length, exactly one SNV,
  at least 16 flanking bases on either side, and at most 8,191 bases.
- VCF plus forward reference FASTA window: explicit matching contig and one-based
  reference start, up to 20 independent biallelic SNVs. A sample-level VCF must
  contain the selected sample and a resolved GT carrying ALT. Site-only files
  carry no genotype claim. Use selected subsets of the 500-row gene catalogues,
  or the ready paired examples, to stay within the request limit.

Missing/ambiguous bases, indels, symbolic/multiple ALT alleles, duplicate positions,
wrong REF alleles, and unsupported/filtered variants are rejected. Strand, phase,
contig aliases, compound variants, and post-harvest comparisons are never inferred.
Gene/sample/study/reference labels remain unverified operator declarations.

| API | Behavior |
|---|---|
| `GET /api/v1/evo2/status` | Preparation-only policy and future requirements |
| `GET /api/v1/evo2/dataset` | Verified local snapshot summary and available splits |
| `GET /api/v1/evo2/dataset/variants` | Paginated metadata; `gene`, `split`, `q`, `offset`, `limit` filters |
| `GET /api/v1/evo2/dataset/variants/{variant_id}` | Local reference/alternate DNA and hashes |
| `POST /api/v1/evo2/dataset/prepare` | Prepare 1–20 unique dataset IDs using server-held sequences |
| `POST /api/v1/evo2/readiness` | Marker readiness without reconstructing sequences |
| `POST /api/v1/evo2/prepare` | Validate local inputs and save a manifest |
| `GET /api/v1/evo2/preparations/{id}/export` | Download its JSON manifest |
| `POST /api/v1/evo2/score` | Always 409: inference disabled |

The API accepts no provider URL, activation setting, or submitted score. Normalized
sequence tasks are saved in the existing private SQLite database with no automatic
expiry. They are not sent to HemoBot/Ollama or linked automatically to marker profiles.
Use the retention policy in HEMOBOT.md; keep non-public genomic inputs out of the
public dataset folder. Budget-lock fields refer to models/provisioning; explicit
downloads of free public reference data are a separate operator action.

Optional trial endpoints are `GET /api/v1/evo2/nvidia/status`,
`POST /api/v1/evo2/nvidia/score` (one public variant ID, explicit action header),
and `GET /api/v1/evo2/nvidia/results/{id}/export`. They do not change the immutable
offline manifest policy or enable the local GPU worker. See EVO2_NVIDIA.md for
secure key setup, per-day caps, provider errors, and the different scoring contract.

The container image copies the same bundled dataset into the API runtime as well
as the frontend static files. Building or running a container is not required for
local testing; the existing Python and Node environments are sufficient.

## Future GPU adapter · inactive

`backend/evo2_worker.py` defines a local scorer contract. Normal invocation only
validates an exported manifest; it requires neither Torch nor Evo 2:

```powershell
.\.venv\Scripts\python.exe -m backend.evo2_worker path/to/exported-preparation.json
```

It returns `disabled_budget_lock` with null scores. Future execution requires both
an explicit CLI flag and a separate environment switch, reviewed local `.pt` weights
with matching SHA-256, and an already available CUDA GPU. Offline model-library
flags are set before imports, and the loader uses an explicit local checkpoint
path with no download fallback. Future deployment should also disable networking
at the container/host level. No worker, GPU dependency, image, checkpoint, or rented
resource was installed or started during this work.

The planned checkpoint is `evo2_7b_base`, with one BOS token reserved in its 8K
context. Fixed scoring options sum log likelihood over each equal-length forward
sequence, batch size one, no reverse-complement averaging. Delta is alternate minus
reference. These scores depend on context/model and are not pathogenicity
probabilities. Result files would remain exploratory and record package/checkpoint
identity; they are not automatically trusted or imported into HemoBot. An
authenticated, evaluated result integration is future work requiring separate
hardware and spending decisions.

Implementation sources: [Evo 2 requirements](https://github.com/ArcInstitute/evo2#requirements),
[local checkpoint loader](https://github.com/ArcInstitute/evo2/blob/main/evo2/models.py),
[scoring options](https://github.com/ArcInstitute/evo2/blob/main/evo2/scoring.py),
[Ensembl variant overlap](https://rest.ensembl.org/documentation/info/overlap_region),
[genomic sequence API](https://rest.ensembl.org/documentation/info/sequence_region).
