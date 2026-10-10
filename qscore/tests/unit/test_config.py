"""Settings and fallback switches (specs/17-fallbacks.md §1, specs/00-operating-rules.md R3.2)."""

from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from qscore.config import FALLBACK_REGISTRY, Settings, get_settings, log_startup
from qscore.errors import ConfigError, FallbackRefused


def test_registry_ids_match_spec() -> None:
    # FB-06 was retired before use (specs/17 §2).
    assert sorted(FALLBACK_REGISTRY) == ["FB-01", "FB-02", "FB-03", "FB-04", "FB-05", "FB-07"]


@pytest.mark.parametrize("profile", ["dev", "ci", "demo"])
def test_no_fallback_enabled_by_default(profile: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QSCORE_PROFILE", profile)
    # demo enables only *approved* entries; none are approved yet.
    assert Settings().enabled_fallbacks == frozenset()


@pytest.mark.parametrize("profile", ["dev", "ci"])
def test_dev_and_ci_refuse_explicit_fallbacks(
    profile: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("QSCORE_PROFILE", profile)
    monkeypatch.setenv("QSCORE_FALLBACKS", "FB-04")
    with pytest.raises(ValidationError, match="enables no fallbacks"):
        Settings()


def test_demo_accepts_explicit_planned_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QSCORE_PROFILE", "demo")
    monkeypatch.setenv("QSCORE_FALLBACKS", "FB-04, FB-05")
    assert Settings().enabled_fallbacks == {"FB-04", "FB-05"}


def test_unknown_fallback_id_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QSCORE_PROFILE", "demo")
    monkeypatch.setenv("QSCORE_FALLBACKS", "FB-99")
    with pytest.raises(ValidationError, match="unknown fallback ids"):
        Settings()


def test_needs_decision_fallback_cannot_be_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QSCORE_PROFILE", "demo")
    monkeypatch.setenv("QSCORE_FALLBACKS", "FB-03")
    with pytest.raises(ValidationError, match="cannot be enabled"):
        Settings()


def test_require_fallback_raises_when_disabled() -> None:
    with pytest.raises(FallbackRefused, match="FB-05 needed: Neon unreachable"):
        Settings().require_fallback("FB-05", "Neon unreachable")


def test_require_fallback_passes_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QSCORE_PROFILE", "demo")
    monkeypatch.setenv("QSCORE_FALLBACKS", "FB-05")
    Settings().require_fallback("FB-05", "Neon unreachable")


def test_require_unknown_fallback_is_config_error() -> None:
    with pytest.raises(ConfigError):
        Settings().require_fallback("FB-42", "x")


def test_get_settings_maps_invalid_settings_to_config_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QSCORE_PROFILE", "staging")
    with pytest.raises(ConfigError, match="invalid QSCORE_"):
        get_settings()


def test_neon_transport_alternatives_need_fb03(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QSCORE_NEON_TRANSPORT", "relay")
    with pytest.raises(ValidationError):
        Settings()


def test_startup_line_logged_at_info(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="qscore.config"):
        log_startup(get_settings())
    assert "qscore profile=ci fallbacks_enabled=[]" in caplog.text
