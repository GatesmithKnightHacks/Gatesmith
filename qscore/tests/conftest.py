"""Shared fixtures (specs/14-testing.md §1): every test runs under settings profile `ci`."""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

from qscore.config import get_settings


@pytest.fixture(autouse=True)
def _profile_ci(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for var in [v for v in os.environ if v.startswith("QSCORE_")]:
        monkeypatch.delenv(var)
    monkeypatch.setenv("QSCORE_PROFILE", "ci")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
