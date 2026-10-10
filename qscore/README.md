# qscore

The scoring engine of **Gatesmith** (KnightHacks IX): validate a manifest of quantum circuits (Qiskit),
explain what was understood, compile across seeds, measure, diagnose, emit scorecards and improvement
requests, and verify proposals before anything counts as better.

Specs: [`../specs/`](../specs/README.md) (start with `00-operating-rules.md` and `01-mvp.md`).

```bash
cd qscore
uv sync
uv run qscore --help
uv run pytest -m "not gpu and not neon and not hub and not llm and not slow" -q
```

## Score a circuit (MVP, CPU — same commands on a laptop and on the AMD cloud instance)

```bash
uv run qscore score path/to/circuit.qasm --yes            # one OpenQASM 2/3 file (FakeTorino)
uv run qscore score - --yes                               # paste OpenQASM, then Ctrl-D; report printed
uv run qscore score --manifest examples/sidechain_qaoa/qscore.yaml --yes
scripts/smoke.sh                                          # paste demo + both examples, exits non-zero on failure
```

Results go to `qscore-out/` (`scorecards/*.json`, `report.md`). Add `--target line-5` (or `grid-RxC`,
`heavy-hex-D`) for a synthetic device.

**AMD cloud instance (PyTorch ROCm image, root, no sudo):** the MVP needs only the CPU path.
`curl -LsSf https://astral.sh/uv/install.sh | sh` (if `uv` is missing), copy this folder over
(`rsync -a --exclude .venv --exclude qscore-out qscore/ root@<host>:/root/qscore/` — nothing is
committed yet), then `cd /root/qscore && uv sync --frozen && scripts/smoke.sh`. uv brings its own
Python 3.12, so the image's Python does not matter; the ROCm Aer build is final-product work
(`specs/13-gpu-runbook.md` §3).
