"""Explicit server trust configuration; no trust decisions come from bundles."""

from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import Field, ValidationError
from qscore.errors import ConfigError
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

from qscore_review.contracts import RepoConfig, StrictModel


class AllowedRepository(StrictModel):
    repository: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    repository_id: int = Field(gt=0)
    installation_id: int = Field(gt=0)
    workflow_id: int = Field(gt=0)
    workflow_path: str
    engine_revision: str = Field(pattern=r"^[0-9a-f]{40}$")


class Settings(StrictModel):
    app_id: int = Field(gt=0)
    private_key_path: Path
    webhook_secret: str = Field(min_length=16, repr=False)
    repositories: list[AllowedRepository] = Field(min_length=1)
    state_path: Path = Path("/var/lib/gatesmith/review.sqlite3")
    knowledge_path: Path = Path(__file__).resolve().parents[2] / "knowledge" / "qiskit.json"
    gemini_api_key: str | None = Field(default=None, repr=False)
    gemini_session_usd: float = Field(default=25, gt=0, le=25)
    gemini_max_output_tokens: int = Field(default=8192, ge=1024, le=16384)
    gemini_max_input_bytes: int = Field(default=120_000, ge=1000, le=200_000)
    archive_max_bytes: int = Field(default=20_000_000, gt=0, le=50_000_000)
    archive_max_uncompressed: int = Field(default=50_000_000, gt=0, le=100_000_000)
    docs_url: str = "https://github.com/GatesmithKnightHacks/Gatesmith/tree/github-app"

    @classmethod
    def from_environment(cls) -> Settings:
        required = (
            "GITHUB_APP_ID",
            "GITHUB_APP_PRIVATE_KEY_PATH",
            "GITHUB_WEBHOOK_SECRET",
            "QSCORE_BOT_REPOSITORIES",
        )
        missing = [key for key in required if not os.environ.get(key)]
        if missing:
            raise ConfigError("Missing bot settings: " + ", ".join(missing))
        try:
            return cls(
                app_id=int(os.environ["GITHUB_APP_ID"]),
                private_key_path=Path(os.environ["GITHUB_APP_PRIVATE_KEY_PATH"]),
                webhook_secret=os.environ["GITHUB_WEBHOOK_SECRET"],
                repositories=json.loads(os.environ["QSCORE_BOT_REPOSITORIES"]),
                state_path=Path(
                    os.environ.get("QSCORE_BOT_STATE_PATH", "/var/lib/gatesmith/review.sqlite3")
                ),
                gemini_api_key=os.environ.get("GEMINI_API_KEY"),
            )
        except (ValueError, ValidationError) as exc:
            raise ConfigError("Invalid bot environment configuration") from exc

    def allowed(self, repository_id: int, installation_id: int) -> AllowedRepository:
        for item in self.repositories:
            if item.repository_id == repository_id and item.installation_id == installation_id:
                return item
        raise ConfigError("Repository/installation is not allowed")


def parse_repo_config(raw: bytes | None) -> RepoConfig:
    """Absent config uses declared defaults; malformed config never does."""
    if raw is None:
        return RepoConfig()
    try:
        parsed = YAML(typ="safe").load(raw.decode("utf-8"))
        return RepoConfig.model_validate(parsed)
    except (UnicodeDecodeError, ValueError, ValidationError, YAMLError) as exc:
        raise ConfigError("Invalid .github/qscore-review.yml") from exc
