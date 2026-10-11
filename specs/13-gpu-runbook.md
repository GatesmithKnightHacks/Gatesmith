# 13 · GPU runbook: Radeon Cloud W7900 sessions

> **Status:** binding for procedure; commands are starting points to verify (R6.4) · **Tier:** 0 · **Read:** before any GPU session, and before writing `scripts/bootstrap_radeon.sh` or `scripts/build_aer_rocm.sh`.
> **Never create, stop or destroy the machine without the user's go-ahead (R10.4).** Credits are finite and data on the machine is lost when it is destroyed.

## 1. Facts and constraints

- 53 credits on Radeon Cloud; machine: Radeon PRO W7900 (48 GB). AMD's instructions: **"Create the machine with the PyTorch ROCm 10 image"** and **"You are logged in as root already – do not use sudo."**
- Root without sudo on a PyTorch ROCm image suggests the machine is itself a container: plan for **no Docker** and **no systemd**; check with `docker ps`/`ps -p 1 -o comm=` in seconds.
- On AMD's Developer Cloud, a powered-off GPU instance keeps billing until destroyed, and exhausted credits lose the data. Assume Radeon Cloud behaves the same until the AMD reps say otherwise → **destroy, don't stop**.
- Hours available = 53 ÷ credits per hour (26 h at 2/h). Plan: 14–18 GPU hours in three sessions; 53 credits cover the long plan at up to ~2.9 credits/h and the short one up to ~3.8; above that, shorten session 2.

## 2. Sessions

| Session | When | Length | Goal | Gate |
|---|---|---|---|---|
| **S1 · Setup** | Friday night (now) | 2–3 h | Machine checks, Aer ROCm wheel built and uploaded, one benchmark, bootstrap script written | GPU result == CPU result on a smoke test |
| **S2 · Data and benchmarks** | Saturday (hours ~14–22) | 8–10 h | GPU metrics in the engine, differential tests, profiler, benchmark suite, worker online, compatibility runs, dataset generation | G3 |
| **S3 · Rehearsal and demo** | Sunday morning (hours ~30–36) | 4–5 h | Warm-up, two full rehearsals, live demo | G5 |

Record every session in `progress.md` → *Credits ledger* (start, end, hours, rate, credits left).

## 3. Session 1, step by step

### 3.0 Before creating the machine (laptop)
- Repo pushed to GitHub at a commit that installs (`uv sync` works); `scripts/build_aer_rocm.sh` drafted.
- Secrets ready to paste (not in files in the repo): `HF_TOKEN` (write: `qscore-wheels`, `qscore-runs`; inference), `QSCORE_WORKER_TOKEN` (issued by the platform), the platform URL for the egress check.
- Decide how the lead session will drive the machine (§6).

### 3.1 Machine checks (save outputs to `lab/<date>-s1-machine-check/NOTES.md`)

```bash
cat /etc/os-release; uname -a; nproc; free -g; df -h /
ps -p 1 -o comm=; which docker podman tmux git curl uv python3
rocminfo | grep -m3 -E "Name:.*gfx|Marketing"
amd-smi list; amd-smi static --asic --vram 2>/dev/null | head -40
python3 -c "import torch,sys; print(sys.version); print(torch.__version__, torch.version.hip, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
ls /opt/rocm*/include/thrust /opt/rocm*/lib/librocblas* 2>/dev/null | head
# egress
python3 - <<'PY'
import urllib.request; print(urllib.request.urlopen("<platform-url>/api/health", timeout=10).status)  # HTTPS via the proxy
PY
curl -sSI https://huggingface.co | head -1
unshare -n true && echo "unshare -n works" || echo "unshare -n NOT available"
```

Decision points (tell the user immediately):
- **Platform URL unreachable over HTTPS** → the worker cannot get jobs: raise it (no fallback; HTTPS egress works through the Radeon Cloud proxy, measured 2026-10-11).
- **Host RAM < 40 GiB** → GPU unitary checks at 15 qubits may not fit on the host side (`08-verification.md` §2, step 4).
- **Python version** of the image → the engine venv uses it (`--system-site-packages`).

### 3.2 Build Aer for gfx1100 (timebox: 90 minutes; if it fails, stop and raise FB-01 with the user)

Sources: the community build notes (gist "Qiskit Aer on ROCm") and Aer's own `CONTRIBUTING.md` for the version you build. Steps to verify on the machine:

```bash
apt-get update && apt-get install -y cmake ninja-build libspdlog-dev libopenblas-dev python3-dev   # no sudo: you are root
# rocthrust / rocblas / hipcc should come with the ROCm image; install rocthrust-dev/rocblas-dev if headers are missing
git clone --depth 1 --branch <aer-tag-compatible-with-our-qiskit> https://github.com/Qiskit/qiskit-aer && cd qiskit-aer
python3 -m venv /root/venvs/aerbuild && . /root/venvs/aerbuild/bin/activate
pip install -U pip "scikit-build>=0.17" pybind11 cmake ninja setuptools wheel
QISKIT_AER_PACKAGE_NAME=qiskit-aer-gpu-rocm \
python setup.py bdist_wheel -- -DAER_THRUST_BACKEND=ROCM -DAER_ROCM_ARCH=gfx1100 -DAER_MPI=OFF
ls dist/*.whl
```

- Options if the build tooling changed: `pip wheel . --no-build-isolation` with `CMAKE_ARGS="-DAER_THRUST_BACKEND=ROCM -DAER_ROCM_ARCH=gfx1100"`; check Aer's docs for the current mechanism. Record which one worked.
- Known issue from the notes: `ImportError: libomp.so` when importing a wheel built outside the right environment → check `ldd` on the extension and `LD_LIBRARY_PATH` (`/opt/rocm/llvm/lib`).
- The wheel name/module: it provides `qiskit_aer`; **never install it next to CPU `qiskit-aer`** in the same venv.

Smoke test (record results):

```python
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
import numpy as np
print(AerSimulator().available_devices())          # must include 'GPU'
qc = QuantumCircuit(20); qc.h(0); [qc.cx(i, i+1) for i in range(19)]; qc.save_statevector()
sv = {d: AerSimulator(method="statevector", device=d, precision="double").run(qc).result().get_statevector()
      for d in ("CPU", "GPU")}
print(np.max(np.abs(np.asarray(sv["CPU"]) - np.asarray(sv["GPU"]))))   # expect < 1e-12
```
Then one noisy run: `AerSimulator.from_backend(FakeTorino(), device="GPU")` on a 12-qubit circuit, compare counts with CPU at the same seed (Hellinger fidelity ≥ 0.99 at 10k shots; exact equality is not expected across devices).

Upload: `huggingface-cli upload <org>/qscore-wheels dist/<wheel> aer/<aer_version>/<python_tag>/<wheel>` (private repo), plus `SHA256SUMS`.

### 3.3 (removed by ChP-0048: no language model on the instance; the `hf` layer calls Inference Providers)

### 3.4 One benchmark and the bootstrap script

- Run the profiler's crossover sweep (or a minimal version: statevector 16–28 qubits, double, CPU vs GPU, 3 reps) → `lab/<date>-s1-bench/`.
- Write `scripts/bootstrap_radeon.sh` (§4) and run it once on this machine to prove it is idempotent.

### 3.5 Teardown
- Write a handoff (R9.3). Copy logs/results off the machine (`rsync`/`scp` to `lab/`, or upload to the Hub).
- **Ask the user to destroy the machine** (or do it with explicit go-ahead). Record hours in the credits ledger.

## 4. `scripts/bootstrap_radeon.sh` (spec)

`set -euo pipefail`; logs to `/root/bootstrap.log`; idempotent; **no fallbacks** — any failed step stops with a clear message.

1. Read secrets from environment variables entered at session start (`HF_TOKEN`, `QSCORE_WORKER_TOKEN`); refuse to continue if missing. Write nothing secret to disk except `/root/.config/qscore/env` (chmod 600).
2. Install `uv` if missing; create `/root/venvs/engine` with `--system-site-packages` (reuses the image's ROCm PyTorch); `uv pip install` qscore from GitHub at the pinned commit (or `rsync`ed working tree, see §6) with extra `[hf]`.
3. Download the Aer wheel from `<org>/qscore-wheels` (verify SHA256) and install it into the engine venv. If missing: run `scripts/build_aer_rocm.sh` (`AER_ROCM_ARCH=gfx1100`) and upload the result.
4. (removed by ChP-0048: no model download or server.)
5. `qscore profile --refresh` (prints the profile) ; the worker registers itself with the platform on start (`POST /api/worker/register`).
6. Start tmux session `qscore` with window `worker` (`qscore worker`), and print how to attach.
7. Print a summary: versions (Python, torch, ROCm, Aer, qscore commit), profile id, worker id, time taken.

## 5. On-machine layout

```text
/root/qscore                repo checkout (pinned commit) or rsync'd tree
/root/venvs/engine          engine venv (--system-site-packages)
/root/lab                   experiment scratch (copied back to the laptop's lab/)
/root/.cache/huggingface    wheel cache
/root/.qscore               cache/, hardware/, runs/, spool/ (FB-05 only)
/root/.config/qscore/env    secrets (chmod 600), destroyed with the machine
```

## 6. How the lead session drives the machine (options; ★ default)

| Option | How | Pros | Cons |
|---|---|---|---|
| ★ **SSH from the laptop session** | `~/.ssh/config` host `w7900`; run `ssh w7900 'cmd'`; long jobs in tmux (`ssh w7900 "tmux new -d -s job 'cmd > log 2>&1'"`); pull logs with `rsync`/`scp` | One brain, one handoff, specs stay local | Needs SSH access (check what Radeon Cloud offers) |
| Second Claude Code session on the machine | Install Node + Claude Code as root; `rsync` the whole workspace (specs, lab, repo) to `/root/ws`; start there; hand results back via git + handoff | Interactive GPU work; no SSH round-trips | Two sessions to coordinate; copy handoff/progress back |
| Web terminal / Jupyter only | The user pastes commands from `scripts/` | Works when SSH is not offered | Slow; the lead prepares exact command blocks |

Never send secrets through the conversation; the user enters them on the machine.

## 7. Open questions for the AMD reps (ask early)

Does a stopped instance bill? Can the machine be snapshotted? Can it accept inbound connections? Is Docker available? Is SSH available? What is the credit rate per hour for the W7900? Every answer only simplifies this plan.
