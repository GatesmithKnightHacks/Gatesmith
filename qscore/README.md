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

## Discover circuits and draft a manifest

Discovery reads Python syntax, OpenQASM headers and notebook code without importing or running
your code. List candidates first, then select their numbers or function names:

```bash
uv run qscore discover path/to/repo
uv run qscore discover path/to/repo --draft                    # interactive selection and values
uv run qscore discover path/to/repo --draft --pick build_qaoa --values values.yaml --no-input
```

The diff appears before saving. A new project gets `qscore.yaml`; an existing manifest gets
`qscore.yaml.draft`, preserving comments, target settings, `project.root` and existing circuit
entries. An existing draft is never overwritten. Review the draft, fill any `<required>` values,
then score it explicitly:

```bash
uv run qscore score --manifest path/to/repo/qscore.yaml.draft --yes
```

Use a values file to supply builder arguments, one integer sweep per builder, and a circuit
parameter file. Builder paths and parameter-file paths are relative to `project.root`:

```yaml
schema: qscore.values/v0.1
builders:
  src/packing/qaoa.py::build_qaoa:
    args: {rotamers: 3, p: 2}
    sweep: {n_residues: "2..6"}
    parameters: {file: params/qaoa_p2.json}
```

Explicit values override signature defaults. A sweep sets its argument to its first value and
writes `size_sweep`; ranges are inclusive (`2..6`, `2..10..2`) or integer lists (`[2, 4, 6]`).
Values are checked against builtin annotations without coercion. With `--no-input`, missing
required arguments use literal call-site suggestions with source comments, or `<required>` if
none exists. Notebook candidates list a `jupyter nbconvert --to script` command before drafting
the converted Python file. Drafted invariants default to `exact_unitary`; review these for your
experiment before scoring.
