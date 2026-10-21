# HemoForge Python prediction service

The React website and Streamlit lab both call the same local Python API. The
website keeps its connected workflow; Streamlit is a separate workspace for
uploading files and inspecting predictions. Their browser sessions do not share
uploaded files automatically.

## Start on Windows

Requires Python 3.11+ and the existing Node dependencies. From this folder:

```powershell
.\start-python.ps1 -Install  # First run; creates .venv and installs packages
.\start-python.ps1           # Later runs; leaves occupied ports unchanged
```

The existing Vite server uses port 8443. If it is stopped, run `npm run dev`.

| Interface | Address |
|---|---|
| Website | http://localhost:8443/#data |
| Streamlit lab | http://127.0.0.1:8501 |
| API documentation | http://127.0.0.1:8000/docs |
| API health | http://127.0.0.1:8000/api/health |

The Python services bind to loopback. They have no authentication or database;
keep them local. Logs are in `logs/` and do not contain prediction input bodies.

## Use it

Website: Data & runs → Choose files or Try example data → Run imported data.
Guard and reports read those inputs. For growth prediction, advance replay to
at least the third positive measurement, open ErythroPilot, and run the growth
simulation. CulturePlan fits experiment data through the Python API. Python
connection errors keep staged inputs available for retry; no JavaScript fallback
is presented as a Python prediction.

Streamlit: choose Cell growth or Experiment response, upload CSV/TSV/JSON or keep
the synthetic example selected, choose settings, and press Run prediction.
Download the result as JSON. Changing the file or settings requires a new run.
Examples are in `public/examples/` and can be downloaded from either interface.

Culture columns: `batch_id, elapsed_hours, cell_count_million`. Counts use
absolute millions of cells. Select one batch; its times must strictly increase.
Prediction requires at least three positive, non-missing counts by the cutoff.
Optional culture channels are used by Guard, not by the growth model.

Experiment columns:
`condition_id, lactate_mg_l, ammonia_mg_l, response, response_unit`.
Use 3–60 distinct conditions and one response unit. Replicates of a condition
must use identical settings. File limits: 2 MB and 10,000 rows.

## Models and code

- `backend/predictions.py`: positive growth simulation with 500 seeded NumPy
  paths, fitted log drift/variability, and 80%/95% simulation ranges. Only data at
  or before the requested cutoff enters the calculation. NumPy's generator differs
  from the earlier browser generator, so the same seed does not reproduce old JS
  paths. Repeatability is within the Python model/version.
- The same file fits an RBF Gaussian process, ranks repeat measurements within
  observed experimental settings, and reports leave-one-condition-out error
  against a mean baseline. This version does not search unobserved recipes.
- `backend/models.py`: validated request schemas and data limits.
- `backend/api.py`: HTTP routes and health check. Add future Python models here
  and call them through `src/python-api.ts`.
- `streamlit_app.py`: upload, prediction, visualization, export. It calls the API;
  it does not duplicate the model implementation.

Results include engine, model version, UTC execution time, provided source-file
hash, and a SHA-256 fingerprint of the actual request. A fingerprint identifies
content; it does not verify biological quality. Models are exploratory, with no
validated harvest/maturation or clinical prediction. RareMatch remains a
deterministic marker comparison in the website.

Prediction-only inputs are processed in memory on this computer. Browser and
Streamlit session data reset when their sessions end. Explicit HemoBot analyses
save source snapshots, context, and responses in local SQLite. In Ollama mode,
the query and bounded evidence statements are sent to the configured model server.
See [HEMOBOT.md](HEMOBOT.md) for configuration, retention, Docker, and server setup.
Export browser-only work before refreshing or restarting.

## Development and checks

Run services in separate foreground terminals for development; Ctrl+C stops each:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --reload --reload-dir backend
.\.venv\Scripts\python.exe -m streamlit run streamlit_app.py
```

Vite proxies `/api` to Python. After `npm run build`, the API also serves `dist/`
on port 8000, so a production bundle can use same-origin API calls. Start the API
after building. Deploying remotely would require authentication, HTTPS, explicit
retention/storage decisions, and a deployment-specific reverse proxy.

```powershell
.\.venv\Scripts\python.exe -m unittest backend.test_predictions -v
node --experimental-strip-types --test src/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Framework references: [Streamlit uploads](https://docs.streamlit.io/develop/api-reference/widgets/st.file_uploader),
[Streamlit testing](https://docs.streamlit.io/develop/api-reference/app-testing/st.testing.v1.apptest),
[FastAPI request validation](https://fastapi.tiangolo.com/tutorial/body/).
