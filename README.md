# HemoForge

An erythroid research workspace with Bioreactor Guard, ErythroPilot, CulturePlan,
RareMatch, and **HemoBot**, an evidence-bound Biomedical English assistant.

[EVO2.md](EVO2.md) documents the bundled **1,000 public KEL/SLC14A1 sequence pairs**,
provenance, offline verification, and local Evo 2 preparation. Optional
[NVIDIA trial inference](EVO2_NVIDIA.md) supports one public variant per explicit
action after secure backend key setup; local GPU inference and paid fallback remain disabled.

## Local development on Windows

```powershell
pnpm install --frozen-lockfile
.\start-python.ps1 -Install
npm run dev
```

- Website: <http://127.0.0.1:8443>
- HemoBot: <http://127.0.0.1:8443/#bot>
- Methods & equations: <http://127.0.0.1:8443/#methods>
- Evo 2 dataset workspace: <http://127.0.0.1:8443/#evo2>
- Python API: <http://127.0.0.1:8000/docs>

Use **Data & runs → Try example data → Run imported data** to try the connected
workflow. HemoBot can analyze the active source records in template mode without
a model server. Examples are synthetic software fixtures.

For Evo 2, open its sidebar item, filter the public variants, choose **View DNA**,
select up to 20 variants, then choose **Prepare … variant(s) · no inference**.
Download the prepared manifest to inspect validated tasks and provenance. The
bundled Evo 2 dataset uses public reference variants; offline manifests retain null scores.
To try hosted inference, follow EVO2_NVIDIA.md, install the key through
`.\configure-evo2-nvidia.ps1 -ConfirmFreeTrial`, refresh NVIDIA status, select one
variant and use **Send … to NVIDIA trial**. No key belongs in the browser.

## Virtual Lab: Stage A/B local prototype

Open `http://127.0.0.1:8443/#lab`, create a session, and open its Guard link in a separate
window on monitor 2. Collect → load FLEX2 → analyze. The completed synthetic reading feeds
the existing Bioreactor Guard automatically. Culture time follows rendered 3D animation.
See [local walkthrough](public/VIRTUAL_LAB.md) and [Stage A/B contract](docs/VIRTUAL_LAB_STAGE_AB.md).
Run the Python API with one worker; sessions are local, in memory, and lost on restart.
No physical device, Supabase, NVIDIA, or LLM is called by this prototype. All bundled assets are free.

## Updating the live site (hemoforge.my.id)

Push to `main`, then from Windows:

```bash
ssh atlas@192.168.1.32
sudo docker exec -it -u friend -w /home/friend/Hemoforge arch-friend bash deploy/update-server.sh
```

It pulls, installs dependencies, builds, restarts both servers and prints the
health check. How the server is wired:

- `arch-friend` shares the network of `arch-friend-tailscale`, which publishes only
  `10.50.0.3:3001` and `10.50.0.3:8000`. openresty sends `hemoforge.my.id` to **3001**.
- 3001: `vite preview` of `dist/`, bound to `0.0.0.0`; it forwards `/api` to 8000.
- 8000: the Python API, bound to `0.0.0.0`.
- Both reject unknown hosts, so `hemoforge.my.id` is passed through
  `HEMOBOT_ALLOWED_HOSTS` (API) and `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` (Vite).
- `DATABASE_URL` lives in `/home/friend/Hemoforge/.env` (not in git).
- 502 from openresty: nothing listening on 3001. 400 / "Blocked request": host check.
  Logs are in `logs/api.log` and `logs/vite.log`.

## Private model server and Docker

[HEMOBOT.md](HEMOBOT.md) explains the implementation, local configuration,
authenticated Ollama gateway, image with OpenBioLLM Q4_K_M and embedding weights,
Arch CPU-server startup, optional application Compose stack, reviewed literature
RAG, audit retention, scientific limits, and verification commands.

[PYTHON.md](PYTHON.md) documents the shared growth/experiment prediction API and
website workflows. [DESIGN.md](DESIGN.md) and [UX-CONTRACT.md](UX-CONTRACT.md)
record the interface and evidence rules.

HemoBot explicitly labels fallback execution, missing classifier/protocol data,
and pending laboratory verification. Evo 2 supports local dataset preparation;
local model inference remains disabled, with optional explicit NVIDIA trial scoring.
