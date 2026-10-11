# 12 · UI, platform (Vultr), Space, assistant

> **Status:** binding · **Tier:** 1 (UI, platform, Space leaderboard), 2 (assistant, Space CPU demo, platform CPU worker, polish) · **Read:** before working on `ui/`, `api/`, `docker/`, `space/`.
> Nothing here computes scores. The UI calls `services.py` (laptop) or the platform API (queue). If you find yourself writing scoring logic in the UI, stop.

## 1. UI (Gradio Blocks, `qscore/src/qscore/ui/`)

### 1.1 One UI, two backends (`ui/backend.py`)

```python
class Backend(Protocol):
    def list_projects(self) -> list[ProjectRef]: ...
    def validate(self, manifest_yaml: str, project: ProjectRef) -> ValidationView: ...
    def confirm(self, manifest_sha256: str) -> None: ...
    def submit(self, job: JobSpec) -> JobRef: ...
    def job(self, ref: JobRef) -> JobView: ...                 # state, events, scorecards so far
    def scorecards(self, ref: JobRef) -> list[Scorecard]: ...
    def attempts(self, ref: JobRef) -> list[AttemptRecord]: ...
    def gpu_status(self) -> GpuStatus: ...                      # online/offline + last seen
```

- `LocalBackend`: calls `services.py` in-process (laptop; runs builder functions in the local sandbox).
- `QueueBackend`: talks to the platform API (`api/app.py`), which owns the job store and the job API (11 §3) and reads records from the Hub.
- The UI never imports engine modules other than `schemas/` and `ui/backend.py`.

### 1.2 Screens (the confidence flow)

| Tab | Content | Notes |
|---|---|---|
| **Project** | Choose a bundled example or upload OpenQASM files (platform); a local repo path + discovery + candidate picker (laptop only) | Platform accepts **only OpenQASM uploads and bundled examples** — no arbitrary Python (R10). |
| **Manifest** | YAML editor with inline issues (code, location, message, hint), "did you mean", a diff before saving | Static checks on every save; full validation as a job |
| **Confirm** | Per item: the interpretation summary, the circuit drawing (`circuit_drawer` "mpl" → PNG) with the summary as alt text, planned compute (device, method, memory, time), what will not be checked; **Confirm** button | Nothing runs before confirm |
| **Scorecards** | Per item: four group sections (resources, hardware, opportunities, research), each metric with value, unit, status badge, tooltip (plain line from `docs/metrics.md`); findings with severity, evidence, region highlight; suppress-with-reason (writes to the manifest via a diff) | Statuses use text + icon, never colour alone |
| **Improve** | Run the loop (layers to use, rounds); attempts table (layer, model, verification status, decision, reason); before/after for accepted changes; re-scored diagnosis | Shows why candidates were rejected/inconclusive |
| **AMD** | GPU online/offline; live telemetry while a job runs; benchmark charts (time vs qubits, crossover, cache knee, precision × fusion grid) | Reads bench results from the Hub |
| **Leaderboard** | Link to the Space and an embedded table | Read-only |

### 1.3 UX and accessibility (UI/UX track; polish only after G4)

- Statuses never by colour alone (text + icon + colour); severity words: info / warning / high.
- Every circuit drawing has alt text (the interpretation summary).
- Keyboard access for all actions; visible focus.
- Clear states: loading (with the current stage from events), empty, offline ("GPU machine is off — GPU jobs will wait"), error (full message + what to do; never a generic "something went wrong").
- Numbers show units and, for statistical metrics, the 95 % interval.
- Qiskit bit order note wherever bitstrings appear.

**UI framework options (★):** ★ Gradio Blocks (also used for the Space; fast to build) · Streamlit · FastAPI + HTMX/Jinja (most control, more work) · NiceGUI.

## 2. Platform API (`api/app.py`, FastAPI) `[T1]`

| Endpoint | Role | Does |
|---|---|---|
| `GET /health` | public | `{ok, version, gpu_online, gpu_last_seen}` |
| `POST /projects/{name}/manifests` | token | Store YAML (schema + reference checks first; returns the issue report) |
| `POST /manifests/{sha}/confirm` | token | Record confirmation (`stored`) |
| `POST /jobs` | token | Insert a job (`qscore.job/v0.2`), computing `requires` from the plan |
| `GET /jobs/{id}` | public (unguessable id) | State, attempts count, result summary |
| `GET /jobs/{id}/events?after=SEQ` | public | Events since `seq` (polling; SSE optional) |
| `GET /jobs/{id}/scorecards` / `GET /scorecards/{item_sha}` | public | Scorecard JSON |
| `GET /jobs/{id}/attempts` | public | Attempt rows |
| `GET /leaderboard` | public | View rows |
| `POST /jobs/{id}/cancel` | token | `queued → cancelled` only |

- Auth for write endpoints: a static bearer token in the platform's env (`QSCORE_PLATFORM_TOKEN`) for the demo; the UI holds it server-side (the Gradio app runs in the same process/container), never in the browser.
- The platform calls `requeue_stale()` on status reads so stale jobs recover even when no worker is polling.
- Uploaded QASM is stored on the Hub (`circuits/<sha256>.qasm`), referenced by hash in the manifest the platform writes.

## 3. Vultr deployment `[T1]`

- One small Ubuntu server (the smallest plan that runs Docker comfortably; 2 GB RAM is enough for the platform without the CPU worker).
- `docker/compose.yaml` services: `platform` (FastAPI + Gradio, port 8080), `caddy` (TLS on 443 → platform; automatic HTTPS with a domain or `<ip>.sslip.io`), optional `worker` (CPU, `QSCORE_CAPABILITIES={"gpu":false,...}`) — Tier 2.
- Env: platform job-store settings (platform's choice), per-worker tokens it issues, `QSCORE_PLATFORM_TOKEN`, `HF_TOKEN` (read for the dataset while private), `GEMINI_API_KEY` (Tier 2). Stored in `/opt/qscore/.env` (chmod 600), never in the image.
- Deploy: `git pull && docker compose up -d --build`; a `make deploy` or script in `docker/`.
- **Options (★):** ★ Docker Compose + Caddy · plain systemd + uvicorn + Caddy · Vultr's managed Kubernetes (overkill).

## 4. GPU online indicator

`gpu_online = now() − max(workers.last_seen_at where capabilities.gpu) < 30 s`. Workers update `last_seen_at` with each poll and heartbeat. Shown on every page.

## 5. Space (`qscore/space/`) `[T1]`

- Gradio Space; `app.py` reads **only** `leaderboard.parquet` from the dataset repo (`hf_hub_download`, read-only token while private), renders the table (sortable), the definitions of the three rates, and links to the dataset and the repo.
- No database credentials, no write token, no GPU.
- (Tier 2) A CPU-only demo tab: score a small uploaded QASM with the CPU engine, capped (≤ 12 qubits, 2 seeds, no simulation metrics), clearly labelled as a demo.
- The Space card (`README.md` front matter) names the SDK, the app file and the license.

## 6. Assistant (Google ADK + Gemini) `[T2]` — only after G4

- Runs in the platform container. Model: a current Gemini model available on the free API tier (pick at build time; record the id).
- Tools (read-only, via the `qscore_readonly` role): `get_job(id)`, `get_scorecard(item_sha)`, `list_findings(job_id)`, `explain_metric(id)` (from `docs/metrics.md`), `explain_issue(code)` (from the catalog), `suggest_manifest_edit(item_id, change)` (returns a diff for the user to apply; never writes).
- An ADK `before_tool_callback` checks every tool call against the allow-list and refuses anything else.
- It never accepts changes, never submits jobs, never sees tokens.
- **Options (★):** ★ Google ADK (`google-adk`, chosen in the architecture) · the plain `google-genai` SDK with function calling (less code; also uses the Gemini API). Check the MLH challenge rules for any model or API requirement before building.
