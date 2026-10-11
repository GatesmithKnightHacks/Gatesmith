import asyncio

from test_bundle import allowed, metadata

from qscore_review.commands import execute_command, parse_command


class Fake:
    def __init__(self, permission="write"):
        self.permission = permission
        self.writes = []

    async def request(self, method, path, **kwargs):
        if method == "POST":
            self.writes.append(path)
            return None
        if path.endswith("/permission"):
            return {"permission": self.permission}
        if path.endswith("/pulls/5"):
            return metadata()[1]
        if "/runs?" in path:
            return {"workflow_runs": [metadata()[0]]}
        raise AssertionError(path)


def run(command, github=None):
    github = github or Fake()
    payload = {"issue": {"number": 5}, "comment": {"user": {"login": "contributor"}}}
    result = asyncio.run(
        execute_command(parse_command(command), payload, allowed(), github, "fake")
    )
    return result, github


def test_canonical_alias_and_strict_parser():
    assert parse_command("/gatesmith rescore").name == "rescore"
    assert parse_command("@qscore-review rescore").name == "rescore"
    assert parse_command("text\n/gatesmith rescore") is None
    assert parse_command("/gatesmith do-anything") is None


def test_write_access_required_and_only_allowed_workflow_rerun():
    result, github = run("/gatesmith rescore", Fake("read"))
    assert "write access" in result and not github.writes
    result, github = run("/gatesmith rescore")
    assert "Requested a rescore" in result
    assert github.writes == ["/repos/org/demo/actions/runs/4/rerun"]


def test_improve_explicitly_unavailable_and_ignore_only_suggests_valid_yaml():
    result, github = run("/gatesmith improve")
    assert "unavailable" in result and "No optimization" in result and not github.writes
    result, github = run('/gatesmith ignore D05 because "test"')
    assert "- rule: D05" in result and 'reason: "because \\"test\\""' in result
    assert not github.writes
