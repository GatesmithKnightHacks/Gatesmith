from __future__ import annotations

import json
from pathlib import Path

import pytest

from qscore_review.versions import detect_versions


def versions(root: Path):
    return {entry.package: entry for entry in detect_versions(root)}


def test_lock_precedes_ranges_and_preserves_declaration_location(tmp_path: Path) -> None:
    (tmp_path / "uv.lock").write_text(
        'version = 1\nrequires-python = ">=3.11"\n[[package]]\nname = "qiskit"\nversion = "2.5.1"\n'
    )
    (tmp_path / "pyproject.toml").write_text(
        '[project]\ndependencies = ["qiskit>=2,<3", "numpy>=2"]\n'
    )
    result = versions(tmp_path)
    assert result["qiskit"].value == "2.5.1"
    assert result["qiskit"].source == "uv.lock"
    assert result["qiskit"].line == 4
    assert result["python"].value == ">=3.11"
    assert result["numpy"].value == ">=2"
    assert result["numpy"].line == 2
    assert result["qiskit-nature"].value is None
    assert result["qiskit-nature"].source is None
    assert result["mqt.*"].line is None


@pytest.mark.parametrize(
    ("filename", "content", "package", "value", "line"),
    [
        (
            "poetry.lock",
            '[[package]]\nname = "mqt.qcec"\nversion = "3.11.0"\n',
            "mqt-qcec",
            "3.11.0",
            2,
        ),
        ("requirements.txt", "# comment\nqiskit-aer==0.17.1\n", "qiskit-aer", "==0.17.1", 2),
        ("requirements-dev.txt", "numpy>=2,<3\n", "numpy", ">=2,<3", 1),
        (
            "setup.cfg",
            "[options]\npython_requires = >=3.11\ninstall_requires =\n  qiskit>=2.5,<3\n",
            "qiskit",
            ">=2.5,<3",
            4,
        ),
        (
            "environment.yml",
            "dependencies:\n  - python=3.12\n  - qiskit=2.5\n",
            "python",
            "=3.12",
            2,
        ),
        (
            "environment.yml",
            "dependencies:\n  - pip:\n    - qiskit-ibm-runtime>=0.50\n",
            "qiskit-ibm-runtime",
            ">=0.50",
            3,
        ),
    ],
)
def test_declaration_formats(
    tmp_path: Path, filename: str, content: str, package: str, value: str, line: int
) -> None:
    (tmp_path / filename).write_text(content)
    evidence = versions(tmp_path)[package]
    assert (evidence.value, evidence.source, evidence.line) == (value, filename, line)


def test_pipfile_lock_and_notebook_metadata(tmp_path: Path) -> None:
    (tmp_path / "Pipfile.lock").write_text(
        json.dumps(
            {
                "_meta": {"requires": {"python_version": "3.12"}},
                "default": {"qiskit": {"version": "==2.5.0"}},
            }
        )
    )
    (tmp_path / "circuit.ipynb").write_text(
        json.dumps(
            {
                "metadata": {"language_info": {"name": "python", "version": "3.10"}},
                "cells": [],
            }
        )
    )
    result = versions(tmp_path)
    assert result["python"].value == "3.12"
    assert result["python"].source == "Pipfile.lock"
    assert result["qiskit"].value == "==2.5.0"
    (tmp_path / "Pipfile.lock").unlink()
    assert versions(tmp_path)["python"].value == "3.10"


def test_setup_py_is_never_executed(tmp_path: Path) -> None:
    marker = tmp_path / "executed"
    (tmp_path / "setup.py").write_text(
        f"from pathlib import Path\nPath({str(marker)!r}).touch()\n"
        "from setuptools import setup\n"
        'setup(python_requires=">=3.11", install_requires=["qiskit>=2.5,<3"])\n'
    )
    result = versions(tmp_path)
    assert not marker.exists()
    assert result["qiskit"].value == ">=2.5,<3"
    assert result["qiskit"].line == 4
    assert result["python"].value == ">=3.11"


def test_only_literal_setup_metadata_is_used(tmp_path: Path) -> None:
    (tmp_path / "setup.py").write_text(
        'deps = ["numpy==2.0"]\nsetup(install_requires=deps, python_requires=get_version())\n'
    )
    assert versions(tmp_path)["numpy"].value == "==2.0"
    assert versions(tmp_path)["python"].value is None


def test_pinned_requirements_precede_pyproject_range(tmp_path: Path) -> None:
    (tmp_path / "requirements.txt").write_text("qiskit==2.5.1\n")
    (tmp_path / "pyproject.toml").write_text('[project]\ndependencies=["qiskit>=2"]\n')
    assert versions(tmp_path)["qiskit"].value == "==2.5.1"


def test_kernel_name_is_not_guessed_as_python_version(tmp_path: Path) -> None:
    (tmp_path / "circuit.ipynb").write_text(
        json.dumps(
            {
                "metadata": {"kernelspec": {"language": "python", "name": "python3"}},
                "cells": [],
            }
        )
    )
    assert versions(tmp_path)["python"].value is None


def test_declaration_symlink_cannot_escape_repository(tmp_path: Path) -> None:
    other = tmp_path / "other"
    other.mkdir()
    secret = tmp_path / "outside.txt"
    secret.write_text("qiskit==2.5")
    (other / "requirements.txt").symlink_to(secret)
    with pytest.raises(ValueError, match="escapes repository"):
        detect_versions(other)


def test_multiline_setup_declarations_have_actual_dependency_line(tmp_path: Path) -> None:
    (tmp_path / "setup.py").write_text(
        'setup(\n    install_requires=[\n        "qiskit>=2.5",\n        "numpy>=2",\n    ]\n)\n'
    )
    assert versions(tmp_path)["qiskit"].line == 3
    assert versions(tmp_path)["numpy"].line == 4


def test_single_quoted_toml_lock_has_actual_package_line(tmp_path: Path) -> None:
    (tmp_path / "poetry.lock").write_text(
        "[[package]]\nname='qiskit-aer'\nversion='0.17'\n"
        "[[package]]\nname='qiskit'\nversion='2.5'\n"
    )
    assert versions(tmp_path)["qiskit"].line == 5
    assert versions(tmp_path)["qiskit-aer"].line == 2
