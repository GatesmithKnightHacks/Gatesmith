"""Exception hierarchy for qscore (specs/03-code-structure.md §3.1, rules R3/R4).

Every failure is raised as one of these types, with enough context to act on (what, where, which
input, which version). The CLI maps them to exit codes (specs/05-pipeline.md §11).
"""

from __future__ import annotations

from typing import Any, Literal


class QscoreError(Exception):
    """Base class for every error qscore raises on purpose."""


class InvalidInput(QscoreError):
    """The user's input is invalid; carries the full issue report (exit code 2)."""

    def __init__(self, message: str, report: Any, code: str | None = None) -> None:
        # `report` is a validate.issues.IssueReport; typed as Any here because foundations
        # import nothing from higher layers. `code` is the issue code (05 §12) when the raiser
        # knows it, so callers never parse it back out of the message.
        super().__init__(message)
        self.report = report
        self.code = code


class ConfigError(QscoreError):
    """Missing settings or secrets, or an incompatible environment (exit code 4)."""


SandboxKind = Literal[
    "timeout",
    "import_error",
    "user_exception",
    "not_a_circuit",
    "args_for_circuit",
    "qpy_incompatible",
]


class SandboxError(QscoreError):
    """A builder run in the sandbox failed."""

    def __init__(self, message: str, kind: SandboxKind) -> None:
        super().__init__(message)
        self.kind: SandboxKind = kind


class CompileError(QscoreError):
    """Compiling a circuit for a target failed."""


class MetricError(QscoreError):
    """A metric could not be computed."""


class SimulationError(QscoreError):
    """A simulation could not run as planned."""


class GpuOutOfMemory(SimulationError):
    """The GPU ran out of memory; carries the planner's estimate for the failed batch."""

    def __init__(self, message: str, planned_bytes: int, limit_bytes: int | None = None) -> None:
        super().__init__(message)
        self.planned_bytes = planned_bytes
        self.limit_bytes = limit_bytes


class VerificationError(QscoreError):
    """The verification machinery itself failed (not a `failed` verification result)."""


class RecordError(QscoreError):
    """Writing or reading records failed, or a replayed write conflicts with stored content."""


class PlatformError(RecordError):
    """The platform job API was unreachable or rejected a call after bounded retries (11 §3)."""


class ClaimLost(PlatformError):
    """The worker no longer owns a job; stop computation and discard unwritten results."""


class HubError(RecordError):
    """A Hugging Face Hub operation failed after bounded retries."""


class FetchError(QscoreError):
    """`git clone` of a repository link failed; carries git's message (ChP-0035, exit code 3)."""


class LayerError(QscoreError):
    """An improvement layer had an infrastructure failure (not "no idea", which returns [])."""


class HfBudgetExhausted(LayerError):
    """The explicit Hugging Face call or estimated-cost budget was exhausted."""


class FallbackRefused(QscoreError):
    """A fallback was needed but is not enabled; the message names the FB id."""

    def __init__(self, fallback_id: str, reason: str) -> None:
        super().__init__(f"{fallback_id} needed: {reason}")
        self.fallback_id = fallback_id
        self.reason = reason
