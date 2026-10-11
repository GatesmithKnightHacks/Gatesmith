import pytest
from qscore.errors import LayerError

from qscore_review.state import State


def test_delivery_recovery_review_and_command_dedup(tmp_path):
    state = State(tmp_path / "state.db")
    assert state.enqueue("delivery", "workflow_run", {"x": 1})
    assert not state.enqueue("delivery", "workflow_run", {"x": 1})
    assert state.claim()["payload"] == {"x": 1}
    state.close()
    state = State(tmp_path / "state.db")
    state.recover()
    assert state.claim()["delivery"] == "delivery"
    state.finish("delivery")
    assert state.claim() is None
    state.save_review("comparison", status="complete", summary_id=10)
    assert state.review("comparison")["summary_id"] == 10
    assert state.claim_command("comment")
    assert not state.claim_command("comment")


def test_persistent_budget_reservations_survive_failures(tmp_path):
    state = State(tmp_path / "state.db")
    assert state.reserve_model("head1", "comparison", 20, 25)
    assert not state.reserve_model("head1", "comparison", 20, 25)
    with pytest.raises(LayerError, match="budget"):
        state.reserve_model("head2", "comparison2", 6, 25)
    assert state.model("head1")["cost"] == 20
    state.record_model("head1", 2, {"thinking_tokens": 100}, "draft")
    assert state.reserve_model("head2", "comparison2", 6, 25)
