"""Compiled circuit export as OpenQASM 3 (ChP-0034 §2.1 A; specs/05 §9)."""

from __future__ import annotations

import json
import os
from collections import Counter
from importlib.metadata import version
from pathlib import Path

import pytest
from qiskit import QuantumCircuit, qasm3
from qiskit.circuit import Gate

from qscore.compile import pipeline
from qscore.compile.pipeline import CompiledResult
from qscore.errors import RecordError
from qscore.record.export import COMPILED_DIR, CompiledExport, export_compiled
from qscore.schemas.common import sha256_hex
from qscore.schemas.manifest import TargetSpec
from qscore.schemas.versions import SCORE_VERSION
from qscore.targets.registry import get_target

ITEM_SHA = "ab" * 32


def ghz(n: int) -> QuantumCircuit:
    qc = QuantumCircuit(n)
    qc.h(0)
    for i in range(n - 1):
        qc.cx(i, i + 1)
    qc.measure_all()
    return qc


@pytest.fixture(scope="module")
def torino_ghz4() -> CompiledResult:
    bundle = get_target(TargetSpec(backend="FakeTorino"))
    return pipeline.compile_item(ghz(4), bundle, [11]).results[0]


def _bare(circuit: QuantumCircuit, seed: int = 5) -> CompiledResult:
    return CompiledResult(
        seed=seed, circuit=circuit, two_qubit_count=0, two_qubit_depth=0, depth=0, time_s=0.0
    )


def _header(text: str) -> dict[str, object]:
    """The `// key: <json>` lines before `OPENQASM 3.0;`."""
    header: dict[str, object] = {}
    for line in text.splitlines():
        if line.startswith("OPENQASM"):
            break
        assert line.startswith("// "), line
        key, _, value = line[3:].partition(": ")
        header[key] = json.loads(value)
    return header


def _body(text: str) -> str:
    return text[text.index("OPENQASM") :]


def test_header_fields_for_torino_ghz(torino_ghz4: CompiledResult, tmp_path: Path) -> None:
    exp = export_compiled("ghz4", ITEM_SHA, torino_ghz4, "FakeTorino", 133, 3, tmp_path)
    assert exp == CompiledExport(
        item_id="ghz4",
        path=f"{COMPILED_DIR}/ghz4.qasm",
        sha256=exp.sha256,
        seed=11,
    )
    file = tmp_path / "compiled" / "ghz4.qasm"
    assert exp.sha256 == sha256_hex(file.read_bytes())
    text = file.read_text(encoding="utf-8")
    header = _header(text)
    layout = torino_ghz4.circuit.layout
    assert layout is not None
    assert header == {
        "qscore": version("qscore"),
        "score_version": SCORE_VERSION,
        "item_id": "ghz4",
        "item_sha256": ITEM_SHA,
        "target": {"name": "FakeTorino", "num_qubits": 133},
        "transpiler_seed": 11,
        "optimization_level": 3,
        "initial_layout": layout.initial_index_layout(),
        "final_index_layout": layout.final_index_layout(),
    }
    assert len(header["final_index_layout"]) == 4  # type: ignore[arg-type]


def test_body_is_qasm3_dumps_and_round_trips(torino_ghz4: CompiledResult, tmp_path: Path) -> None:
    export_compiled("ghz4", ITEM_SHA, torino_ghz4, "FakeTorino", 133, 3, tmp_path)
    text = (tmp_path / "compiled" / "ghz4.qasm").read_text(encoding="utf-8")
    assert _body(text) == qasm3.dumps(torino_ghz4.circuit)
    # The whole file (header comments included) loads; op counts are those of the scored circuit.
    loaded = qasm3.loads(text)
    assert Counter(loaded.count_ops()) == Counter(torino_ghz4.circuit.count_ops())


def test_no_layout_states_null(tmp_path: Path) -> None:
    qc = QuantumCircuit(2)
    qc.h(0)
    qc.cx(0, 1)
    assert qc.layout is None
    export_compiled("bell", ITEM_SHA, _bare(qc), "line", 2, 3, tmp_path)
    header = _header((tmp_path / "compiled" / "bell.qasm").read_text(encoding="utf-8"))
    assert header["initial_layout"] is None and header["final_index_layout"] is None
    assert header["transpiler_seed"] == 5


def test_exporter_error_raises_record_error_naming_item(tmp_path: Path) -> None:
    # Verified on qiskit 2.5.2: a gate without a definition raises QASM3ExporterError.
    qc = QuantumCircuit(1)
    qc.append(Gate("opaque_thing", 1, []), [0])
    with pytest.raises(RecordError, match="odd_item") as err:
        export_compiled("odd_item", ITEM_SHA, _bare(qc), "line", 1, 3, tmp_path)
    assert type(err.value.__cause__).__name__ == "QASM3ExporterError"
    out = tmp_path / "compiled"
    assert not out.exists() or list(out.iterdir()) == []


def test_failed_write_leaves_no_partial_file(
    torino_ghz4: CompiledResult, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_replace(src: str, dst: str) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", broken_replace)
    with pytest.raises(OSError, match="disk full"):
        export_compiled("ghz4", ITEM_SHA, torino_ghz4, "FakeTorino", 133, 3, tmp_path)
    assert list((tmp_path / "compiled").iterdir()) == []


def test_rewrite_replaces_file(torino_ghz4: CompiledResult, tmp_path: Path) -> None:
    (tmp_path / "compiled").mkdir()
    (tmp_path / "compiled" / "ghz4.qasm").write_text("stale", encoding="utf-8")
    exp = export_compiled("ghz4", ITEM_SHA, torino_ghz4, "FakeTorino", 133, 3, tmp_path)
    assert sorted(p.name for p in (tmp_path / "compiled").iterdir()) == ["ghz4.qasm"]
    assert exp.sha256 == sha256_hex((tmp_path / "compiled" / "ghz4.qasm").read_bytes())
