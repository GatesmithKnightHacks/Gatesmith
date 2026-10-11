"""Improvement-layer boundary (specs/10-improvement-loop.md §2)."""

from __future__ import annotations

from typing import Protocol

from qscore.schemas.improvement import ImprovementRequest, Proposal


class ImprovementLayer(Protocol):
    name: str
    version: str

    def capabilities(self) -> list[str]: ...

    def propose(self, request: ImprovementRequest) -> list[Proposal]: ...
