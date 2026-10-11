"""Model readiness checks never generate a proposal or substitute a provider."""

from unittest.mock import patch

from typer.testing import CliRunner

from qscore.cli import app
from qscore.errors import LayerError
from qscore.improve.hf_layer_guarded import HfLayer, load_model_entries


def test_models_check_checks_whole_panel_and_shares_job() -> None:
    checked = []

    def check(layer: HfLayer) -> None:
        checked.append(layer)

    with (
        patch.object(HfLayer, "check_catalog", check),
        patch.object(HfLayer, "propose", side_effect=AssertionError("readiness must not generate")),
    ):
        result = CliRunner().invoke(app, ["models", "check"])
    assert result.exit_code == 0, result.output
    assert [layer.entry.routed_id for layer in checked] == [
        entry.routed_id for entry in load_model_entries()
    ]
    assert len({id(layer.job) for layer in checked}) == 1
    assert checked[0].job.calls == 0


def test_unavailable_pin_fails_but_reports_remaining_entries() -> None:
    checked = []

    def check(layer: HfLayer) -> None:
        checked.append(layer.entry.routed_id)
        if len(checked) == 1:
            raise LayerError("pinned provider is unavailable")

    with patch.object(HfLayer, "check_catalog", check):
        result = CliRunner().invoke(app, ["models", "check"])
    assert result.exit_code == 3
    assert "pinned provider is unavailable" in result.output
    assert len(checked) == len(load_model_entries())
    assert "structured output supported" in result.output
