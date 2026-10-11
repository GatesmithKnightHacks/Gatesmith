"""Regions: merge, convexity, convex block collection, extract/splice inverse
(specs/07-diagnostics.md §3, §6; specs/15-build-plan.md T16)."""

from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from qiskit import QuantumCircuit
from qiskit.converters import circuit_to_dag
from qiskit.quantum_info import Operator

from qscore.diagnose.regions import Block, convex_blocks, is_convex, merge
from qscore.errors import InvalidInput
from qscore.improve.requests import extract_region, splice
from qscore.metrics.opportunities.structure import layers_of
from qscore.schemas.scorecard import Region


def region(qubits: list[int], layers: tuple[int, int], idxs: list[int] | None = None) -> Region:
    return Region(scope="logical", qubits=qubits, layers=layers, gate_indices=idxs or [])


def non_convex_window() -> QuantumCircuit:
    """cx(0,1) -> cx(1,2) -> cx(0,1): on qubits {0,1} the window {0, 2} is left through
    cx(1,2) (qubit 2 is outside) and re-entered."""
    qc = QuantumCircuit(3)
    qc.cx(0, 1)
    qc.cx(1, 2)
    qc.cx(0, 1)
    return qc


def test_non_convex_window_is_detected() -> None:
    qc = non_convex_window()
    assert not is_convex(qc, [0, 2])
    assert is_convex(qc, [0]) and is_convex(qc, [2]) and is_convex(qc, [0, 1, 2])


def test_non_convex_window_is_shrunk_into_convex_blocks() -> None:
    qc = non_convex_window()
    blocks = convex_blocks(qc, region([0, 1], (0, 2)), max_qubits=8)
    assert [b.gate_indices for b in blocks] == [(0,), (2,)]
    assert all(is_convex(qc, b.gate_indices) for b in blocks)
    assert blocks[0] == Block(qubits=(0, 1), gate_indices=(0,), layers=(0, 0))
    assert blocks[1].layers == (2, 2)


def test_non_convex_region_is_rejected_by_extract_and_splice() -> None:
    qc = non_convex_window()
    bad = region([0, 1], (0, 2), [0, 2])
    with pytest.raises(InvalidInput, match="not convex"):
        extract_region(qc, bad)
    with pytest.raises(InvalidInput, match="not convex"):
        splice(qc, bad, QuantumCircuit(2))


def test_convex_window_is_one_block_restricted_to_qubits_and_layers() -> None:
    qc = QuantumCircuit(4, 1)
    qc.h(0)  # layer 0
    qc.cx(0, 1)  # layer 1
    qc.rz(0.3, 1)  # layer 2
    qc.cx(1, 2)  # layer 3
    qc.cx(2, 3)  # layer 4: qubit 3 outside the region
    qc.measure(0, 0)  # never part of a block
    assert layers_of(qc)[:5] == [0, 1, 2, 3, 4]
    blocks = convex_blocks(qc, region([0, 1, 2], (1, 3)), max_qubits=8)
    assert blocks == [Block(qubits=(0, 1, 2), gate_indices=(1, 2, 3), layers=(1, 3))]


def test_max_qubits_limits_width_and_wide_gates_are_left_out() -> None:
    qc = QuantumCircuit(3)
    qc.cx(0, 1)
    qc.cx(1, 2)
    qc.ccx(0, 1, 2)
    qc.cx(0, 1)
    blocks = convex_blocks(qc, region([0, 1, 2], (0, 10)), max_qubits=2)
    assert all(len(b.qubits) <= 2 for b in blocks)
    assert 2 not in {i for b in blocks for i in b.gate_indices}  # ccx is 3 qubits wide
    assert sorted(i for b in blocks for i in b.gate_indices) == [0, 1, 3]
    assert all(is_convex(qc, b.gate_indices) for b in blocks)


def test_blocks_are_split_over_disjoint_qubits_largest_first() -> None:
    qc = QuantumCircuit(4)
    qc.cx(0, 1)
    qc.cx(2, 3)
    qc.cx(2, 3)
    blocks = convex_blocks(qc, region([0, 1, 2, 3], (0, 5)), max_qubits=8)
    assert [b.gate_indices for b in blocks] == [(1, 2), (0,)]


def test_convex_blocks_rejects_bad_input() -> None:
    qc = non_convex_window()
    with pytest.raises(InvalidInput):
        convex_blocks(qc, region([0, 1], (0, 2)), max_qubits=0)
    with pytest.raises(InvalidInput):
        convex_blocks(qc, region([0, 5], (0, 2)), max_qubits=4)
    with pytest.raises(InvalidInput):
        convex_blocks(qc, region([0, 1], (3, 2)), max_qubits=4)


def test_merge_is_union_of_qubits_and_hull_of_layers() -> None:
    merged = merge([region([3, 1], (4, 9), [7, 2]), region([2, 3], (1, 5), [2, 8])])
    assert merged == Region(
        scope="logical", qubits=[1, 2, 3], layers=(1, 9), gate_indices=[2, 7, 8]
    )


def test_merge_refuses_mixed_scopes_and_empty_input() -> None:
    compiled = Region(scope="compiled", qubits=[0], layers=(0, 0))
    with pytest.raises(InvalidInput, match="scopes"):
        merge([region([0], (0, 0)), compiled])
    with pytest.raises(InvalidInput):
        merge([])


def test_extract_maps_local_qubits_in_region_order() -> None:
    qc = QuantumCircuit(4)
    qc.h(3)
    qc.cx(3, 1)
    sub, qubit_map = extract_region(qc, region([3, 1], (0, 1), [0, 1]))
    assert qubit_map == {"0": 3, "1": 1}
    expected = QuantumCircuit(2)
    expected.h(0)
    expected.cx(0, 1)
    assert sub == expected


def test_splice_places_dependencies_first_and_adds_candidate_phase() -> None:
    qc = QuantumCircuit(3)
    qc.cx(0, 1)  # 0: region
    qc.h(2)  # 1: independent of the region -> after the candidate
    qc.cx(2, 1)  # 2: depends on the region -> after
    qc.x(0)  # 3: region
    cut = region([0, 1], (0, 1), [0, 3])
    # cx(2,1) depends on cx(0,1) and is not an ancestor of x(0): {0, 3} is convex.
    assert is_convex(qc, [0, 3])
    candidate = QuantumCircuit(2, global_phase=0.5)
    candidate.cx(0, 1)
    candidate.x(0)
    candidate.z(1)
    candidate.z(1)
    out = splice(qc, cut, candidate)
    assert [i.operation.name for i in out.data] == ["cx", "x", "z", "z", "h", "cx"]
    assert out.global_phase == pytest.approx(0.5)
    assert Operator(out).equiv(Operator(qc))


def test_splice_rejects_mismatched_candidates() -> None:
    qc = QuantumCircuit(2)
    qc.cx(0, 1)
    cut = region([0, 1], (0, 0), [0])
    with pytest.raises(InvalidInput, match="qubits"):
        splice(qc, cut, QuantumCircuit(3))
    measured = QuantumCircuit(2, 1)
    measured.measure(0, 0)
    with pytest.raises(InvalidInput):
        splice(qc, cut, measured)


def test_extract_rejects_gates_outside_region_qubits_and_non_gates() -> None:
    qc = QuantumCircuit(2, 1)
    qc.cx(0, 1)
    qc.measure(0, 0)
    with pytest.raises(InvalidInput, match="outside"):
        extract_region(qc, region([0], (0, 0), [0]))
    with pytest.raises(InvalidInput, match="unitary"):
        extract_region(qc, region([0, 1], (0, 1), [1]))
    with pytest.raises(InvalidInput, match="non-empty"):
        extract_region(qc, region([0, 1], (0, 1), []))


# --- property: splice(c, r, extract(c, r)) == c --------------------------------------------

ONE_Q = ["h", "x", "sx", "rz", "t"]
TWO_Q = ["cx", "cz", "rzz", "swap"]


@st.composite
def circuits(draw: st.DrawFn) -> QuantumCircuit:
    n = draw(st.integers(min_value=2, max_value=6))
    qc = QuantumCircuit(n)
    for _ in range(draw(st.integers(min_value=1, max_value=24))):
        kind = draw(st.sampled_from(["1q", "2q", "3q"] if n >= 3 else ["1q", "2q"]))
        qs = draw(
            st.lists(
                st.integers(0, n - 1),
                min_size={"1q": 1, "2q": 2, "3q": 3}[kind],
                max_size={"1q": 1, "2q": 2, "3q": 3}[kind],
                unique=True,
            )
        )
        theta = draw(st.floats(min_value=-3.0, max_value=3.0, allow_nan=False))
        if kind == "3q":
            qc.ccx(*qs)
            continue
        name = draw(st.sampled_from(ONE_Q if kind == "1q" else TWO_Q))
        if name in ("rz", "rzz"):
            getattr(qc, name)(theta, *qs)
        else:
            getattr(qc, name)(*qs)
    return qc


def assert_identity_splice(qc: QuantumCircuit, cut: Region) -> None:
    sub, qubit_map = extract_region(qc, cut)
    assert [qubit_map[str(i)] for i in range(len(qubit_map))] == cut.qubits
    out = splice(qc, cut, sub)
    assert circuit_to_dag(out) == circuit_to_dag(qc)  # gate by gate, same dependencies
    assert len(out.data) == len(qc.data)
    assert Operator(out).equiv(Operator(qc))  # <= 8 qubits


@settings(max_examples=150, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(data=st.data(), qc=circuits())
def test_property_blocks_are_convex_and_splice_extract_is_identity(
    data: st.DataObject, qc: QuantumCircuit
) -> None:
    n = qc.num_qubits
    qubits = sorted(data.draw(st.sets(st.integers(0, n - 1), min_size=1)))
    depth = max(layers_of(qc)) + 1
    start = data.draw(st.integers(0, depth - 1))
    end = data.draw(st.integers(start, depth - 1))
    width = data.draw(st.integers(1, 8))
    for block in convex_blocks(qc, region(qubits, (start, end)), max_qubits=width):
        assert len(block.qubits) <= width
        assert set(block.qubits) <= set(qubits)
        assert is_convex(qc, block.gate_indices)
        assert all(start <= layers_of(qc)[i] <= end for i in block.gate_indices)
        assert_identity_splice(qc, block.region("logical"))


@settings(max_examples=150, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(data=st.data(), qc=circuits())
def test_property_any_convex_gate_set_round_trips_and_others_are_rejected(
    data: st.DataObject, qc: QuantumCircuit
) -> None:
    idxs = sorted(data.draw(st.sets(st.integers(0, len(qc.data) - 1), min_size=1)))
    qubits = sorted({qc.find_bit(q).index for i in idxs for q in qc.data[i].qubits})
    cut = region(qubits, (0, max(layers_of(qc))), idxs)
    if is_convex(qc, idxs):
        assert_identity_splice(qc, cut)
    else:
        with pytest.raises(InvalidInput, match="not convex"):
            extract_region(qc, cut)


def test_is_convex_rejects_out_of_range_indices() -> None:
    qc = QuantumCircuit(2)
    qc.cx(0, 1)
    with pytest.raises(InvalidInput, match="out of range"):
        is_convex(qc, [0, 5])
