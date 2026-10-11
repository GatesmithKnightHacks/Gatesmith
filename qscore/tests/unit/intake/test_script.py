"""Line mode prefix: top-level statements up to `line`, original numbering (ChP-0037 §2.1 B)."""

import pytest

from qscore.errors import InvalidInput
from qscore.intake.script import prefix

SCRIPT = """import math

x = (
    1,
    2,
)
y = 3; z = 4


@staticmethod
def f():
    return 1


raise RuntimeError("after")
"""


def test_keeps_statements_starting_at_or_before_line() -> None:
    out = prefix(SCRIPT, 1, "s.py")
    assert out.splitlines() == ["import math"]


def test_multiline_statement_started_before_line_is_kept_whole() -> None:
    out = prefix(SCRIPT, 4, "s.py")
    namespace: dict[str, object] = {}
    exec(compile(out, "s.py", "exec"), namespace)
    assert namespace["x"] == (1, 2)
    assert "y" not in namespace


def test_statements_sharing_a_line_both_kept() -> None:
    namespace: dict[str, object] = {}
    exec(compile(prefix(SCRIPT, 7, "s.py"), "s.py", "exec"), namespace)
    assert (namespace["y"], namespace["z"]) == (3, 4)


def test_decorator_line_counts_as_first_line() -> None:
    namespace: dict[str, object] = {}
    exec(compile(prefix(SCRIPT, 10, "s.py"), "s.py", "exec"), namespace)
    assert "f" in namespace


def test_code_after_line_never_included() -> None:
    out = prefix(SCRIPT, 14, "s.py")
    assert "RuntimeError" not in out
    exec(compile(out, "s.py", "exec"), {})


def test_line_numbers_preserved_in_tracebacks() -> None:
    text = "a = 1\n\n\nb = 1 / 0\nc = 2\n"
    out = prefix(text, 4, "s.py")
    with pytest.raises(ZeroDivisionError) as err:
        exec(compile(out, "s.py", "exec"), {})
    assert err.traceback[-1].lineno + 1 == 4  # pytest's lineno is 0-based


def test_line_past_end_is_q103() -> None:
    with pytest.raises(InvalidInput) as err:
        prefix("a = 1\nb = 2\n", 3, "s.py")
    assert err.value.code == "Q103"
    (issue,) = err.value.report.issues
    assert issue.location.file == "s.py"
    assert issue.location.field == "source.line"
    assert "line 3" in issue.message and "2 lines" in issue.message


def test_last_line_is_allowed() -> None:
    assert prefix("a = 1\nb = 2\n", 2, "s.py").splitlines() == ["a = 1", "b = 2"]


def test_syntax_error_is_q301_located() -> None:
    with pytest.raises(InvalidInput) as err:
        prefix("a = 1\ndef f(:\n", 1, "bad.py")
    assert err.value.code == "Q301"
    (issue,) = err.value.report.issues
    assert (issue.location.file, issue.location.line) == ("bad.py", 2)
