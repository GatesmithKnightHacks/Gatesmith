"""Queue-worker preparation (specs/11 §5; ChP-0054).

Workers use the platform HTTPS API rather than opening its SQLite database. Execution
is deliberately blocked before any claim until required Hub publication and immediate
claim-loss cancellation are connected. CLI and GitHub Action scoring remain independent.
"""

from __future__ import annotations

import logging
import sys

from qscore.config import Settings, get_settings, log_startup
from qscore.errors import ConfigError
from qscore.logging import setup_logging

log = logging.getLogger("qscore.worker")


def run_worker(settings: Settings, *, once: bool = False) -> None:
    """Refuse queue execution before registration or claims while required wiring is absent."""
    raise ConfigError(
        "queue worker is not ready: wire Hub batch publication, result materialization and "
        "immediate claim-loss cancellation before enabling job execution (specs/11 §5, ChP-0054). "
        "Use qscore score or the GitHub review Action for scoring in the meantime."
    )


def main() -> int:
    """Report the explicit startup block as configuration exit code 4 (05 §11)."""
    try:
        settings = get_settings()
        setup_logging(settings.profile, mode="worker")
        log_startup(settings)
        run_worker(settings)
    except ConfigError as exc:
        setup_logging("dev", mode="worker")
        log.error("configuration error: %s", exc)
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
