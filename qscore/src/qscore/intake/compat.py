"""Uses of Qiskit APIs that are gone from current Qiskit (ChP-0037 §2.1 B).

Static only (`ast`): the code is never imported, run or rewritten. Each hit names what the file
uses, when it was removed and what to use instead; discovery attaches the hits to the file's
candidates and the services layer shows them (with file:line) as warnings and next to a
Q301/Q302 from the same file.

Every table entry is checked by the tests against the installed Qiskit (2.x): the old import
must fail there. The removal version is stated only where the installed Qiskit itself says it
(`qiskit/__init__.py`: `qiskit.tools` "is present in all 0.x series of Qiskit and not in Qiskit
1.0+"); the other entries say "removed by Qiskit 2.x".
"""

from __future__ import annotations

import ast
from dataclasses import dataclass

BY_2X = "by Qiskit 2.x"
IN_1_0 = "in Qiskit 1.0"


@dataclass(frozen=True)
class RemovedApi:
    """A removed module or name (`name` matches itself and everything under it)."""

    name: str
    removed: str  # "in Qiskit <ver>" when confirmed locally, else "by Qiskit 2.x"
    replacement: str

    def matches(self, dotted: str) -> bool:
        return dotted == self.name or dotted.startswith(self.name + ".")


@dataclass(frozen=True)
class CompatHit:
    """One use of a removed API: the line, the dotted name used, and what to use instead."""

    line: int
    used: str
    replacement: str


REMOVED: tuple[RemovedApi, ...] = (
    RemovedApi(
        "qiskit.execute",
        BY_2X,
        "qiskit.transpile + backend.run, or the primitives (qiskit.primitives)",
    ),
    RemovedApi("qiskit.Aer", BY_2X, "qiskit_aer.AerSimulator"),
    RemovedApi("qiskit.BasicAer", BY_2X, "qiskit.providers.basic_provider.BasicSimulator"),
    RemovedApi("qiskit.providers.aer", BY_2X, "the qiskit_aer package (qiskit_aer.AerSimulator)"),
    RemovedApi("qiskit.IBMQ", BY_2X, "qiskit_ibm_runtime.QiskitRuntimeService"),
    RemovedApi("qiskit.opflow", BY_2X, "qiskit.quantum_info.SparsePauliOp"),
    RemovedApi("qiskit.algorithms", BY_2X, "the qiskit_algorithms package"),
    RemovedApi("qiskit.utils.QuantumInstance", BY_2X, "the primitives (qiskit.primitives)"),
    RemovedApi(
        "qiskit.tools",
        IN_1_0,
        "job.status() / job.result() (job_monitor and the other qiskit.tools helpers have no "
        "replacement in Qiskit)",
    ),
)


def _entry(dotted: str) -> RemovedApi | None:
    for entry in REMOVED:
        if entry.matches(dotted):
            return entry
    return None


def _module_aliases(tree: ast.AST) -> dict[str, str]:
    """Local names bound to a Qiskit module by `import qiskit[.x] [as y]`."""
    aliases: dict[str, str] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Import):
            continue
        for alias in node.names:
            if alias.name.split(".")[0] != "qiskit":
                continue
            if alias.asname is not None:
                aliases[alias.asname] = alias.name
            else:
                aliases["qiskit"] = "qiskit"
    return aliases


def _dotted(node: ast.Attribute, aliases: dict[str, str]) -> str | None:
    parts: list[str] = []
    current: ast.expr = node
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
    if not isinstance(current, ast.Name) or current.id not in aliases:
        return None
    return ".".join([aliases[current.id], *reversed(parts)])


def removed_apis(tree: ast.AST) -> list[CompatHit]:
    """Every use of a removed Qiskit API in `tree`: imports (`from qiskit import execute`,
    `import qiskit.opflow`) and attribute uses through a module import (`qiskit.Aer...`,
    `qk.execute(...)`). Ordered by position; relative imports are the project's own."""
    aliases = _module_aliases(tree)
    found: list[tuple[int, int, str, RemovedApi]] = []

    def add(line: int, col: int, dotted: str) -> None:
        entry = _entry(dotted)
        if entry is not None:
            found.append((line, col, dotted, entry))

    inner: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Attribute):
            inner.add(id(node.value))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add(alias.lineno, alias.col_offset, alias.name)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module is not None:
            for alias in node.names:
                if alias.name != "*":
                    add(alias.lineno, alias.col_offset, f"{node.module}.{alias.name}")
        elif isinstance(node, ast.Attribute) and id(node) not in inner:
            dotted = _dotted(node, aliases)
            if dotted is not None:
                add(node.lineno, node.col_offset, dotted)
    found.sort(key=lambda f: (f[0], f[1]))
    return [CompatHit(line, dotted, entry.replacement) for line, _, dotted, entry in found]


def describe(hit: CompatHit, rel: str) -> str:
    """`<rel>:<line>: uses <used>, removed in Qiskit <ver>; use <replacement>`."""
    entry = _entry(hit.used)
    if entry is None:
        raise ValueError(f"{hit.used!r} is not a removed Qiskit API in the compat table")
    return f"{rel}:{hit.line}: uses {hit.used}, removed {entry.removed}; use {hit.replacement}"
