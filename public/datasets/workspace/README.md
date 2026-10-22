# Public workspace uploads

Real public data converted into the workspace CSV formats. Upload these in **Data & runs**;
the built-in demo stays the default. The three files come from unrelated studies and stay independent.

| File | Module | Source |
|---|---|---|
| `bath-bel-a-culture.csv` | Bioreactor Guard, ErythroPilot | Growth curve sheet: BEL-A static culture, replicates A–C, 8 time points to 170.5 h |
| `bath-bel-a-experiments.csv` | CulturePlan | Metabolite DOE sheet: lactate 0/850 × ammonia 0/41 mg/L, 3 runs each, live cells 10^5/mL |
| `1000g-phase3-markers.csv` | RareMatch marker screen | 1000 Genomes Phase 3 genotypes (2,504 samples) for KEL rs8176058 and SLC14A1 rs1058396, GRCh38 forward strand, via Ensembl |

## Conversion notes

- Bath times are stored as Excel days and are converted to hours; glucose, glutamine, lactate and ammonia are converted from mg/L to mmol/L.
- Bath counts are cells per mL. The published record gives no culture volume, so `cell_count_million` is millions of cells in 1 mL of culture. Growth ratios and declines are unaffected; rerun with `--volume-ml` once the volume is confirmed.
- Regenerate with `.venv/Scripts/python.exe -m backend.prepare_public_workspace_data --download-public-data`.

## Credit

- Phillips D, Ellis MJ, Frayne J, Moise S. Dataset for "Characterising a novel adult erythroid cell line for red blood cell manufacture". University of Bath Research Data Archive, 2025. https://doi.org/10.15125/BATH-01456. Licensed CC BY 4.0. Converted and reformatted by HemoForge.
- The 1000 Genomes Project Consortium. A global reference for human genetic variation. Nature 526, 68–74 (2015). https://www.internationalgenome.org/data/. Retrieved through the Ensembl REST API.
