"""Unfinished queue execution must refuse before touching platform jobs (ChP-0054)."""

import pytest

from qscore import worker
from qscore.config import Settings
from qscore.errors import ConfigError


def test_queue_worker_requires_hub_and_claim_loss_wiring():
    with pytest.raises(ConfigError, match="Hub batch publication"):
        worker.run_worker(Settings(profile="ci"), once=True)


def test_worker_entrypoint_reports_configuration_failure(monkeypatch, caplog):
    monkeypatch.setattr(worker, "get_settings", lambda: Settings(profile="ci"))
    monkeypatch.setattr(worker, "setup_logging", lambda *args, **kwargs: None)
    assert worker.main() == 4
    assert "queue worker is not ready" in caplog.text
