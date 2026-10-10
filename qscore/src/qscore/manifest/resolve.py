"""Resolve items: built-in defaults → manifest defaults → item (CP-0014, CP-0021 item 5)."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from qscore.errors import InvalidInput
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.manifest import CircuitItem, ProjectManifest
from qscore.targets.registry import NAMED_BACKENDS

# CP-0021 item 5: the built-in defaults are the specs/04 §2 example's `defaults` block.
BUILTIN_DEFAULTS: dict[str, Any] = {
    "target": {"backend": "FakeTorino", "calibration": "from_backend"},
    "objective": {
        "primary": "two_qubit_count",
        "direction": "minimize",
        "constraints": [
            {"metric": "two_qubit_depth", "max_vs_baseline": 1.0},
            {"metric": "reliability_heuristic", "min_vs_baseline": 1.0},
        ],
        "report": ["depth", "routing_overhead"],
    },
    "evidence": {"verification": "exact", "on_inconclusive": "reject"},
    "execution": {
        "device": "auto",
        "precision": {"screen": "single", "confirm": "double"},
        "transpiler_seeds": [11, 23, 37, 41, 53, 67, 79, 97],
        "seed_simulator": 1234,
        "shots": 4000,
    },
    "budget": {
        "wall_time_s": 900,
        "gpu_time_s": 600,
        "max_rounds": 4,
        "max_proposals": 4,
        "layer_timeout_s": 60,
    },
    "diagnose": {
        "profile": None,
        "groups": ["resources", "hardware", "opportunities", "research"],
        "ignore": [],
    },
    "privacy": {"external_inference": False, "send_region_only": True},
}
INHERITED = tuple(BUILTIN_DEFAULTS)
TARGET_KEYS = ("backend", "coupling_map", "basis_gates")


def _calibration_by_kind(target: dict[str, Any], *layers: dict[str, Any]) -> None:
    """CP-0025: when the manifest or item names the target but no layer sets `calibration`, it
    is not inherited from the built-in defaults: `from_backend` for named backends, else `none`."""
    if any("calibration" in layer for layer in layers):
        return
    if any(key in layer for layer in layers for key in TARGET_KEYS):
        target["calibration"] = (
            "from_backend" if target.get("backend") in NAMED_BACKENDS else "none"
        )


def merge(base: dict[str, Any], over: dict[str, Any], path: str = "") -> dict[str, Any]:
    """Mappings merge per key; lists/scalars replace; `objective` is atomic and
    `diagnose.ignore` concatenates (CP-0014)."""
    out = copy.deepcopy(base)
    for key, value in over.items():
        here = f"{path}.{key}" if path else key
        if here == "objective" or not (isinstance(value, dict) and isinstance(out.get(key), dict)):
            if here == "diagnose.ignore" and isinstance(out.get(key), list):
                out[key] = [*out[key], *value]
            else:
                out[key] = copy.deepcopy(value)
        else:
            out[key] = merge(out[key], value, here)
    return out


@dataclass(frozen=True)
class ResolvedItem:
    item: CircuitItem  # every inherited block filled
    root: Path
    item_sha256: str
    origins: dict[str, str]  # top-level block -> "default" | "manifest" | "item"


def _file_hash(path: Path, code: str = "Q200") -> str:
    """sha256 of a file the item references; a missing file is Q200 (Q201 for a builder file)."""
    if not path.is_file():
        what = "builder file" if code == "Q201" else "file"
        raise InvalidInput(f"[{code}] {what} not found: {path}", report=None)
    return sha256_hex(path.read_bytes())


def resolve_items(manifest: ProjectManifest, manifest_dir: Path) -> list[ResolvedItem]:
    return [
        ResolvedItem(item, root, item_hash(item, root), origins)
        for item, root, origins in merge_items(manifest, manifest_dir)
    ]


def merge_items(
    manifest: ProjectManifest, manifest_dir: Path
) -> list[tuple[CircuitItem, Path, dict[str, str]]]:
    """Every item with its inherited blocks filled, its root and block origins; reads no files
    (the reference pass runs on these before anything is hashed, 05 §3)."""
    root = (manifest_dir / manifest.project.root).resolve()
    manifest_defaults = manifest.defaults.model_dump(mode="json", exclude_none=True)
    defaults = merge(BUILTIN_DEFAULTS, manifest_defaults)
    out: list[tuple[CircuitItem, Path, dict[str, str]]] = []
    for item in manifest.circuits:
        raw = item.model_dump(mode="json", exclude_none=True)
        merged = merge(defaults, {k: v for k, v in raw.items() if k in INHERITED})
        _calibration_by_kind(
            merged["target"], manifest_defaults.get("target", {}), raw.get("target", {})
        )
        resolved = CircuitItem.model_validate({**raw, **merged})
        origins = {
            k: "item"
            if k in raw
            else "manifest"
            if getattr(manifest.defaults, k) is not None
            else "default"
            for k in INHERITED
        }
        out.append((resolved, root, origins))
    return out


def item_hash(item: CircuitItem, root: Path) -> str:
    """sha256(canonical resolved item + source hash + parameter/observable hashes) (04 §2.5)."""
    qasm = getattr(item.source, "qasm", None)
    src = qasm or getattr(item.source, "builder", "").split("::")[0]
    extra = []
    params = getattr(item.source, "parameters", None)
    if params is not None:
        extra.append(_file_hash(root / params.file))
    if item.invariants.task is not None and item.invariants.task.observable:
        extra.append(_file_hash(root / item.invariants.task.observable))
    body = canonical_json(item.model_dump(mode="json", exclude_none=True))
    return sha256_hex(body + _file_hash(root / src, "Q200" if qasm else "Q201") + "".join(extra))
