"""Interpretation uses fixed sentence templates, never model reprs (05 §5)."""

from pathlib import Path

from qscore.config import Settings
from qscore.interpret.summary import render_text
from qscore.validate.pipeline import run_validation
from qscore.validate.schema_checks import load_manifest_with_positions

EXAMPLE = Path(__file__).parents[3] / "examples" / "sbox_oracle" / "qscore.yaml"


def test_sbox_summary_sentences() -> None:
    manifest, positions = load_manifest_with_positions(EXAMPLE)
    work = run_validation(manifest, EXAMPLE.parent, Settings(), "qscore.yaml", positions)
    text = render_text(work, manifest)
    lines = text.splitlines()
    assert "  Source: OpenQASM file circuits/sbox_layer_4x.qasm." in lines
    assert any(line.startswith("  Circuit: 20 qubits, ") for line in lines)
    assert "  Intent: The circuit's classical reversible function must be preserved." in lines
    assert "  Permitted changes: reversible_rewrite." in lines
    assert any(line.startswith("  Objective: minimize toffoli_count;") for line in lines)
    assert any(line.startswith("  Planned compute (CPU): level-3 compile on ") for line in lines)
    assert any(line.endswith(" (default)") for line in lines)
    assert lines[-1].startswith("Not checked: ")
    # No pydantic reprs or raw dicts leak into the text.
    assert "  privacy.external_inference: false (default)" in lines
    for leak in ("=None", "Constraint(", "{'", "backend='", "True", "False"):
        assert leak not in text


def test_empty_groups_means_all() -> None:
    from qscore.interpret.templates import compute_sentence

    assert "metric groups all;" in compute_sentence([1], [], None)
