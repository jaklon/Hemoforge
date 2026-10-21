# HemoForge

An erythroid research workspace with Bioreactor Guard, ErythroPilot, CulturePlan,
RareMatch, and **HemoBot**, an evidence-bound Biomedical English assistant.

[EVO2.md](EVO2.md) documents the bundled **1,000 public KEL/SLC14A1 sequence pairs**,
provenance, offline verification, and preparation-only Evo 2 workflow. Model
inference, automatic downloads, and paid providers remain disabled for that workflow.

## Local development on Windows

```powershell
pnpm install --frozen-lockfile
.\start-python.ps1 -Install
npm run dev
```

- Website: <http://127.0.0.1:8443>
- HemoBot: <http://127.0.0.1:8443/#bot>
- Evo 2 dataset workspace: <http://127.0.0.1:8443/#evo2>
- Python API: <http://127.0.0.1:8000/docs>
- Streamlit lab: <http://127.0.0.1:8501>

Use **Data & runs → Try example data → Run imported data** to try the connected
workflow. HemoBot can analyze the active source records in template mode without
a model server. Examples are synthetic software fixtures.

For Evo 2, open its sidebar item, filter the public variants, choose **View DNA**,
select up to 20 variants, then choose **Prepare … variant(s) · no inference**.
Download the prepared manifest to inspect validated tasks and provenance. The
bundled Evo 2 dataset uses public reference variants; model scores remain null.

## Private model server and Docker

[HEMOBOT.md](HEMOBOT.md) explains the implementation, local configuration,
authenticated Ollama gateway, image with OpenBioLLM Q4_K_M and embedding weights,
Arch CPU-server startup, optional application Compose stack, reviewed literature
RAG, audit retention, scientific limits, and verification commands.

[PYTHON.md](PYTHON.md) documents the shared growth/experiment prediction API and
Streamlit workflows. [DESIGN.md](DESIGN.md) and [UX-CONTRACT.md](UX-CONTRACT.md)
record the interface and evidence rules.

HemoBot explicitly labels fallback execution, missing classifier/protocol data,
and pending laboratory verification. Evo 2 supports local dataset preparation;
model inference remains disabled.
