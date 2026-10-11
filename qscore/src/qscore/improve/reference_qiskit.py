"""`reference-qiskit` layer (specs/10 §4) — deterministic. ChP-0049 slice: `block_resynthesis`
only: linear blocks → `synth_cnot_count_full_pmh`, Clifford blocks → `synth_clifford_full` (10 §4),
each translated to the target basis; plus Qiskit's level-3 synthesis of the region (fixed seed),
so the loop has a baseline that needs no network. The other five strategies are T24.
"""

from __future__ import annotations

from qiskit import qasm3, transpile
from qiskit.circuit import QuantumCircuit
from qiskit.circuit.library import LinearFunction
from qiskit.quantum_info import Clifford
from qiskit.synthesis import synth_clifford_full, synth_cnot_count_full_pmh

from qscore.improve.hf_layer import parse_qasm
from qscore.schemas.improvement import (
    PROPOSAL_SCHEMA,
    Candidate,
    Claims,
    ImprovementRequest,
    LayerInfo,
    Proposal,
)

PASSES = "transpile(region, basis_gates=target.basis, optimization_level=3, seed_transpiler=0)"
TRANSLATE = "transpile(·, basis_gates=target.basis, optimization_level=1, seed_transpiler=0)"
LINEAR_GATES = frozenset({"cx", "swap"})
CLIFFORD_GATES = frozenset(
    {"id", "x", "y", "z", "h", "s", "sdg", "sx", "sxdg", "cx", "cz", "cy", "swap", "ecr", "dcx"}
)


def _two_q(c: QuantumCircuit) -> int:
    return sum(1 for i in c.data if i.operation.num_qubits == 2)


def structured_synthesis(region: QuantumCircuit) -> tuple[QuantumCircuit, str] | None:
    """10 §4 `block_resynthesis` for linear and Clifford blocks; None for any other block."""
    names = {i.operation.name for i in region.data}
    if not names or not names <= CLIFFORD_GATES:
        return None
    if names <= LINEAR_GATES:
        mat = LinearFunction(region).linear
        return synth_cnot_count_full_pmh(mat), "synth_cnot_count_full_pmh(LinearFunction(region))"
    return synth_clifford_full(Clifford(region)), "synth_clifford_full(Clifford(region))"


class ReferenceQiskitLayer:
    name = "reference-qiskit"
    version = "rq-2026.2"

    def capabilities(self) -> list[str]:
        return ["block_resynthesis"]

    def propose(self, request: ImprovementRequest) -> list[Proposal]:
        if request.circuit.scope != "region":
            return []
        region = parse_qasm(request.circuit.format, request.circuit.qasm)
        basis = list(request.target.basis)
        outs: list[tuple[QuantumCircuit, str]] = []
        structured = structured_synthesis(region)
        if structured is not None:
            synth, how = structured
            translated = transpile(
                synth, basis_gates=basis, optimization_level=1, seed_transpiler=0
            )
            outs.append((translated, f"{how}; {TRANSLATE}"))
        level3: QuantumCircuit = transpile(
            region, basis_gates=basis, optimization_level=3, seed_transpiler=0
        )
        # Level 3 may elide a permutation into `layout.final_layout` (ElidePermutations); the
        # bare circuit then is not the region, so such an output is not a candidate.
        if level3.layout is None or level3.layout.final_index_layout() == list(
            range(region.num_qubits)
        ):
            outs.append((level3, PASSES))
        seen: set[str] = set()
        proposals: list[Proposal] = []
        for out, rationale in outs:
            qasm = qasm3.dumps(out)
            if out.num_qubits != region.num_qubits or qasm in seen:
                continue
            seen.add(qasm)
            proposals.append(self._proposal(request, qasm, float(_two_q(out)), rationale))
        return proposals

    def _proposal(
        self, request: ImprovementRequest, qasm: str, estimate: float, rationale: str
    ) -> Proposal:
        return Proposal.model_validate(
            {
                "schema": PROPOSAL_SCHEMA,
                "request_id": request.request_id,
                "layer": LayerInfo(name=self.name, version=self.version),
                "candidate": Candidate(format="openqasm3", scope="region", qasm=qasm),
                "claims": Claims(
                    metric=request.objective.primary,
                    direction="decrease"
                    if request.objective.direction == "minimize"
                    else "increase",
                    estimate=estimate,
                    equivalent=True,
                ),
                "rationale": rationale,
            }
        )
