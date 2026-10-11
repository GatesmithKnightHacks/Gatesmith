"""Experimental ROCm path (ChP-0032, ChP-0046): identity, refusal, crossover, report."""

from __future__ import annotations

from typing import Any

import pytest

from qscore.bench import suite
from qscore.errors import RecordError, SimulationError
from qscore.hardware import profiler
from qscore.record.w7900 import render_w7900
from qscore.schemas.run import BenchResult, BenchRow, GpuProfile
from qscore.sim import backends, telemetry

# Shapes recorded from amd-smi 27.0.0 on the Radeon Cloud machine (2026-10-11).
STATIC = {
    "gpu_data": [
        {
            "gpu": 0,
            "asic": {"market_name": "AMD Radeon Pro W7900D", "target_graphics_version": "gfx1100"},
            "driver": {"name": "amdgpu", "version": "7.1.3.31500000"},
            "vram": {"type": "GDDR6", "size": {"value": 49136, "unit": "MB"}},
        }
    ]
}
VERSION = [{"tool": "AMDSMI Tool", "rocm_version": "10.0.0"}]
METRIC = {
    "gpu_data": [
        {
            "gpu": 0,
            "usage": {"gfx_activity": {"value": 97, "unit": "%"}},
            "power": {"socket_power": {"value": 212, "unit": "W"}},
            "mem_usage": {
                "used_vram": {"value": 4200, "unit": "MB"},
                "free_vram": {"value": 44936, "unit": "MB"},
            },
        }
    ]
}


def test_identity_parsed_from_amd_smi() -> None:
    gpu = profiler.parse_identity(STATIC, VERSION)
    assert gpu.name == "AMD Radeon Pro W7900D"
    assert gpu.arch == "gfx1100"
    assert gpu.vram_gib == pytest.approx(49136 / 1024)
    assert (gpu.rocm, gpu.driver) == ("10.0.0", "7.1.3.31500000")
    assert profiler.is_w7900(gpu)


@pytest.mark.parametrize(
    ("name", "arch", "expected"),
    [
        ("AMD Radeon PRO W7900", "gfx1100", True),
        ("AMD Radeon RX 7900 XTX", "gfx1100", False),  # same arch, different model
        ("AMD Radeon PRO W7900", "gfx1101", False),
    ],
)
def test_w7900_needs_name_and_arch(name: str, arch: str, expected: bool) -> None:
    gpu = GpuProfile(name=name, arch=arch, vram_gib=48, rocm=None, driver=None)
    assert profiler.is_w7900(gpu) is expected
    assert not profiler.is_w7900(None)


def test_identity_missing_field_fails_loudly() -> None:
    with pytest.raises(SimulationError, match="missing a field"):
        profiler.parse_identity({"gpu_data": [{"asic": {}}]}, VERSION)
    with pytest.raises(SimulationError, match="no GPU entries"):
        profiler.parse_identity({"gpu_data": []}, VERSION)


def test_no_amd_smi_means_no_gpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(profiler, "amd_smi_path", lambda: None)
    assert profiler.detect_gpu() is None
    with pytest.raises(SimulationError, match="not on PATH"):
        profiler.amd_smi_json("metric")


def test_metric_parse() -> None:
    row = telemetry.parse_metric(METRIC)
    assert row == {
        "gfx_activity_pct": 97.0,
        "used_vram_mb": 4200.0,
        "free_vram_mb": 44936.0,
        "power_w": 212.0,
    }


def test_gpu_request_never_runs_on_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(backends, "gpu_available", lambda: False)
    with pytest.raises(SimulationError, match="refusing to run on the CPU"):
        backends.make_simulator("gpu")


def _row(device: Any, n: int, median: float, fusion: int | None = None) -> BenchRow:
    return BenchRow(
        circuit="random_layered",
        qubits=n,
        method="statevector",
        precision="double",
        fusion_max_qubit=fusion,
        device=device,
        median_s=median,
        p10_s=median,
        p90_s=median,
    )


def test_crossover_is_smallest_size_where_gpu_is_faster() -> None:
    rows = [
        _row("cpu", 16, 0.01),
        _row("gpu", 16, 0.05),
        _row("cpu", 20, 0.2),
        _row("gpu", 20, 0.1),
        _row("cpu", 24, 3.0),
        _row("gpu", 24, 0.5),
        _row("gpu", 24, 0.01, fusion=2),  # fusion rows never count
    ]
    assert suite.crossover(rows) == 20
    assert suite.crossover(rows[:2]) is None


def test_cpu_bench_runs_and_checks_device() -> None:
    out = suite.run_bench(["cpu"], sizes=[6], reps=2, warmup=1, fusion_sweep=False)
    assert [(r.device, r.qubits) for r in out.rows] == [("cpu", 6)]
    assert out.crossover_qubits is None


def test_gpu_budget_marks_rows_unmeasured() -> None:
    out = suite.run_bench(["gpu"], sizes=[30], reps=1, fusion_sweep=False, vram_budget_bytes=1)
    assert out.rows == []
    assert out.unmeasured[0]["qubits"] == 30


def _bench(rows: list[BenchRow], cross: int | None) -> BenchResult:
    from datetime import UTC, datetime

    return BenchResult.model_validate(
        {
            "schema": "qscore.bench/v0.2",
            "suite": suite.SUITE_NAME,
            "devices": ["cpu", "gpu"],
            "reps": 3,
            "warmup": 1,
            "rows": [r.model_dump() for r in rows],
            "crossover": {"double": cross, "fusion_best_double": None},
            "provenance": {
                "qscore": "0",
                "git_commit": None,
                "git_dirty": True,
                "lock_sha256": None,
                "python": "3.14",
                "qiskit": "2.5.2",
                "qiskit_aer": "0.17.2",
                "aer_build": "rocm",
                "mqt_qcec": None,
                "profile": "dev",
                "fallbacks_enabled": [],
                "seeds": {"transpiler": [], "simulator_base": 1},
                "thresholds_sha256": None,
                "started_at": datetime.now(UTC),
                "finished_at": None,
            },
        }
    )


EVIDENCE = {
    "w7900": True,
    "differential": [{"qubits": 16, "abs_diff": 1e-15, "tolerance": 1e-9}],
    "telemetry": {"status": "unavailable", "reason": "amd-smi failed"},
    "unmeasured": [],
    "aer": {"version": "0.17.2", "build": "rocm", "gpu_available": True},
}


def test_report_is_experimental_shows_slower_gpu_and_missing_telemetry() -> None:
    gpu = profiler.parse_identity(STATIC, VERSION)
    text = render_w7900(gpu, _bench([_row("cpu", 16, 0.01), _row("gpu", 16, 0.05)], None), EVIDENCE)
    assert text.startswith("# EXPERIMENTAL")
    assert "0.20x" in text  # slower GPU shown as it is
    assert "none in this sweep" in text
    assert "Unavailable: amd-smi failed" in text
    assert "measured ROCm acceleration" not in text  # ChP-0032 title needs full qualification


def test_report_refuses_incomplete_evidence() -> None:
    with pytest.raises(RecordError, match="telemetry"):
        render_w7900(
            None, _bench([], None), {k: v for k, v in EVIDENCE.items() if k != "telemetry"}
        )


def test_fixture_is_not_truncated_by_aer() -> None:
    # Shallow circuit: a single-qubit observable would let Aer drop most qubits (light cone).
    qc = suite.random_layered(24, 2, 1)
    t = suite.time_circuit(qc, "cpu", "double", reps=1, warmup=0)
    assert -1.0 <= t.value <= 1.0


def test_truncated_simulation_fails_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    from qiskit import QuantumCircuit

    qc = QuantumCircuit(4, name="z0_only")
    qc.h(range(4))
    qc.save_expectation_value(suite.Pauli("Z"), [0], label="z0")
    with pytest.raises(SimulationError, match="simulated 1 qubits, not 4"):
        suite.time_circuit(qc, "cpu", "double", reps=1, warmup=0)


class _FakeResult:
    def __init__(self, device: str, num_qubits: int, value: float) -> None:
        self.success, self.status = True, "ok"
        self.results = [type("R", (), {"metadata": {"device": device, "num_qubits": num_qubits}})]
        self._value = value

    def data(self, _i: int) -> dict[str, float]:
        return {"zall": self._value}


class _FakeSim:
    def __init__(self, device: str, value: float) -> None:
        self.device, self.value = device, value

    def run(self, qc: Any) -> Any:
        result = _FakeResult(self.device, qc.num_qubits, self.value)
        return type("Job", (), {"result": lambda _self: result})()


def test_device_mismatch_fails_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(suite, "make_simulator", lambda *a, **k: _FakeSim("CPU", 0.5))
    with pytest.raises(SimulationError, match="requested gpu but Aer ran on 'cpu'"):
        suite.time_circuit(suite.random_layered(4, 2, 1), "gpu", "double", 1, 0)


def test_differential_mismatch_fails_the_bench(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake(device: str, **_k: Any) -> _FakeSim:
        return _FakeSim(device.upper(), 0.5 if device == "cpu" else 0.5 + 1e-6)

    monkeypatch.setattr(suite, "make_simulator", fake)
    with pytest.raises(SimulationError, match="differential failed at 4 qubits"):
        suite.run_bench(["cpu", "gpu"], sizes=[4], reps=1, warmup=0, fusion_sweep=False)


def test_sampler_failure_is_reported_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(*_a: Any, **_k: Any) -> Any:
        raise SimulationError("amd-smi metric could not run: timed out")

    monkeypatch.setattr(telemetry, "amd_smi_json", broken)
    with telemetry.GpuSampler(interval_s=0.01) as sampler:
        pass
    summary = sampler.summary()
    assert summary["status"] == "unavailable"
    assert "timed out" in summary["reason"]


def test_subprocess_timeout_becomes_simulation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    import subprocess

    def boom(*_a: Any, **_k: Any) -> Any:
        raise subprocess.TimeoutExpired("amd-smi", 30)

    monkeypatch.setattr(profiler.subprocess, "run", boom)
    with pytest.raises(SimulationError, match="could not run"):
        profiler.amd_smi_json("metric", tool="/bin/amd-smi")


def test_gpu_only_rows_are_marked_unverified() -> None:
    gpu = profiler.parse_identity(STATIC, VERSION)
    text = render_w7900(
        gpu, _bench([_row("gpu", 16, 0.05)], None), {**EVIDENCE, "differential": []}
    )
    assert "GPU rows UNVERIFIED" in text
