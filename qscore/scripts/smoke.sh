#!/usr/bin/env bash
# MVP smoke test (CPU): a pasted Bell circuit, then both examples. Run from the qscore/ folder.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-qscore-out/smoke}"
printf 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\nh q[0];\ncx q[0],q[1];\ncx q[1],q[2];\n' \
  | uv run qscore score - --yes --out "$out/pasted" > /dev/null
for ex in sidechain_qaoa sbox_oracle; do
  uv run qscore score --manifest "examples/$ex/qscore.yaml" --yes --out "$out/$ex"
done
echo "smoke OK → $out"
