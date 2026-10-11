"""Live smoke of the ★ `hf` model (T25 acceptance, 10 §5). Needs HF_TOKEN; run `-m llm`."""

from __future__ import annotations

from pathlib import Path

import pytest
from ruamel.yaml import YAML

from qscore import services

EXAMPLE = Path(__file__).parents[2] / "examples" / "sidechain_qaoa"
pytestmark = pytest.mark.llm


def test_star_model_round_trip(tmp_path: Path) -> None:
    yml = YAML(typ="safe", pure=True)
    manifest = yml.load((EXAMPLE / "qscore.yaml").read_text())
    for item in manifest["circuits"]:
        item["privacy"] = {"external_inference": True}
    for child in EXAMPLE.iterdir():
        if child.name != "qscore.yaml":
            (tmp_path / child.name).symlink_to(child)
    yml.dump(manifest, tmp_path / "qscore.yaml")
    result = services.improve_once(
        tmp_path / "qscore.yaml", "packing_qaoa_p2", tmp_path / "out", max_requests=1
    )
    (call,) = result.summary["calls"]  # type: ignore[misc]
    assert isinstance(call, dict)
    assert call["model"] == "openai/gpt-oss-120b" and call["provider"] == "cerebras"
    assert call["reply_parsed"] is True
    assert "outcome" in result.summary
