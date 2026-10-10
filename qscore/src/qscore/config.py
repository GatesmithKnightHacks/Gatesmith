"""Settings, profiles and fallback switches (specs/03 §3.1, specs/17-fallbacks.md).

Profiles: `dev` and `ci` enable no fallback; `demo` enables exactly the registry entries whose
status is `approved` and whose demo column is `on`. `QSCORE_FALLBACKS=FB-04,FB-05` enables entries
explicitly. Anything else is a `ConfigError`: settings never silently drop or add a fallback.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from qscore.errors import ConfigError, FallbackRefused

log = logging.getLogger(__name__)

Profile = Literal["dev", "ci", "demo"]
FallbackStatus = Literal["planned", "approved", "rejected", "needs decision"]


@dataclass(frozen=True)
class FallbackEntry:
    """One row of specs/17-fallbacks.md §2 (owned by the user; change only via a proposal)."""

    id: str
    status: FallbackStatus
    demo_on: bool


FALLBACK_REGISTRY: dict[str, FallbackEntry] = {
    e.id: e
    for e in (
        FallbackEntry("FB-01", "planned", demo_on=False),
        FallbackEntry("FB-02", "planned", demo_on=False),
        FallbackEntry("FB-03", "needs decision", demo_on=False),
        FallbackEntry("FB-04", "planned", demo_on=True),  # demo "on (if approved)"
        FallbackEntry("FB-05", "planned", demo_on=True),  # demo "on (if approved)"
        FallbackEntry("FB-07", "planned", demo_on=False),
    )
}
_ENABLEABLE: frozenset[FallbackStatus] = frozenset({"planned", "approved"})


class Settings(BaseSettings):
    """Process-wide settings, read from `QSCORE_*` environment variables."""

    model_config = SettingsConfigDict(env_prefix="QSCORE_", extra="forbid", frozen=True)

    profile: Profile = "dev"
    fallbacks: Annotated[frozenset[str], NoDecode] = frozenset()
    cache_dir: Path = Path(".qscore")
    device_default: Literal["auto", "cpu", "gpu"] = "auto"
    sandbox_mode: Literal["process", "process-unlimited"] = "process"
    neon_dsn: SecretStr | None = None
    # "data-api" | "relay" arrive only with FB-03, which awaits the user's decision (specs/17 §2).
    neon_transport: Literal["postgres"] = "postgres"
    hub_dataset_repo: str | None = None
    hub_wheels_repo: str | None = None
    local_llm_base_url: str = "http://127.0.0.1:8000/v1"
    hf_router_base_url: str = "https://router.huggingface.co/v1"
    worker_id: str | None = None
    capabilities_override: dict[str, bool] | None = Field(default=None, alias="QSCORE_CAPABILITIES")

    @field_validator("fallbacks", mode="before")
    @classmethod
    def _split_fallbacks(cls, value: Any) -> Any:
        if isinstance(value, str):
            return frozenset(part.strip() for part in value.split(",") if part.strip())
        return value

    @model_validator(mode="after")
    def _check_fallbacks(self) -> Settings:
        unknown = sorted(self.fallbacks - FALLBACK_REGISTRY.keys())
        if unknown:
            raise ValueError(f"unknown fallback ids {unknown}; known: {sorted(FALLBACK_REGISTRY)}")
        if self.fallbacks and self.profile in ("dev", "ci"):
            raise ValueError(
                f"profile {self.profile!r} enables no fallbacks, but QSCORE_FALLBACKS="
                f"{','.join(sorted(self.fallbacks))} was set; unset it or use profile 'demo'"
            )
        blocked = sorted(
            fb for fb in self.fallbacks if FALLBACK_REGISTRY[fb].status not in _ENABLEABLE
        )
        if blocked:
            raise ValueError(
                f"fallbacks {blocked} cannot be enabled (status: "
                f"{[FALLBACK_REGISTRY[fb].status for fb in blocked]}); see specs/17-fallbacks.md"
            )
        return self

    @property
    def enabled_fallbacks(self) -> frozenset[str]:
        """Fallbacks active in this process: explicit ones, plus the demo profile's approved set."""
        if self.profile == "demo":
            demo = {
                e.id for e in FALLBACK_REGISTRY.values() if e.status == "approved" and e.demo_on
            }
            return frozenset(self.fallbacks | demo)
        return self.fallbacks

    def require_fallback(self, fallback_id: str, reason: str) -> None:
        """Raise `FallbackRefused` unless `fallback_id` is enabled (call before using one)."""
        if fallback_id not in FALLBACK_REGISTRY:
            raise ConfigError(f"unknown fallback id {fallback_id!r}")
        if fallback_id not in self.enabled_fallbacks:
            raise FallbackRefused(fallback_id, reason)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """The settings singleton; invalid settings raise `ConfigError` (exit code 4)."""
    try:
        settings = Settings()
    except ValidationError as exc:
        raise ConfigError(f"invalid QSCORE_* settings: {exc}") from exc
    return settings


def log_startup(settings: Settings) -> None:
    """Log the active profile and enabled fallbacks (call once logging is configured)."""
    log.info(
        "qscore profile=%s fallbacks_enabled=%s",
        settings.profile,
        sorted(settings.enabled_fallbacks),
    )
