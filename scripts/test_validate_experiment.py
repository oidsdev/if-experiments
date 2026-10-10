#!/usr/bin/env python3
"""Tests for scripts/validate_experiment.py."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate_experiment as v  # noqa: E402

ROOT = v.ROOT
SCRIPT = ROOT / "scripts" / "validate_experiment.py"

BRIEF = """# Sample

## Hypothesis

A visitor stays long enough to try the interaction.

## What ships

One page they can use.

## Audience

People who open the experiments page.
"""

METRICS = """# Metrics

## Primary

- Name: completions

## Guardrails

- Name: errors

## Method

Count unique visitors during the week the page is up.
"""

BASE = {
    "id": "sample-run",
    "title": "Sample",
    "status": "idea",
    "started": "2026-01-01",
    "summary": "A visitor stays long enough to try the interaction.",
    "metrics": [],
}


def write_experiment(
    root: Path,
    results: dict,
    *,
    name: str | None = None,
    brief: str | None = BRIEF,
    metrics: str | None = METRICS,
) -> Path:
    folder = root / (name or results["id"])
    folder.mkdir(parents=True)
    if brief is not None:
        (folder / "brief.md").write_text(brief, encoding="utf-8")
    if metrics is not None:
        (folder / "metrics.md").write_text(metrics, encoding="utf-8")
    (folder / "results.json").write_text(json.dumps(results), encoding="utf-8")
    return folder


class ValidateExperimentTest(unittest.TestCase):
    def test_template_passes(self) -> None:
        self.assertEqual(v.validate_experiment(ROOT / "experiments" / "_template"), [])

    def test_cli_all(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), "--all"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("experiments/_template: ok", proc.stdout)

    def test_cli_requires_a_target(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 2)

    def test_missing_files_and_heading(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / "sample-run"
            folder.mkdir()
            (folder / "results.json").write_text(json.dumps(BASE), encoding="utf-8")
            (folder / "brief.md").write_text("# Sample\n", encoding="utf-8")
            errors = v.validate_experiment(folder)
        text = "\n".join(errors)
        self.assertIn("missing file metrics.md", text)
        self.assertIn("missing heading '## Hypothesis'", text)

    def test_invalid_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "sample-run"
            folder.mkdir()
            (folder / "brief.md").write_text(BRIEF, encoding="utf-8")
            (folder / "metrics.md").write_text(METRICS, encoding="utf-8")
            (folder / "results.json").write_text("{", encoding="utf-8")
            errors = v.validate_experiment(folder)
        self.assertTrue(any("invalid JSON" in error for error in errors))

    def test_schema_rejections(self) -> None:
        cases = {
            "status": {**BASE, "status": "live"},
            "slug": {**BASE, "id": "Bad_Slug"},
            "extra": {**BASE, "owner": "ada"},
            "date": {**BASE, "started": "2026-02-31"},
            "bool": {**BASE, "metrics": [{"name": "visits", "value": True}]},
            "empty-title": {**BASE, "title": ""},
        }
        expectations = {
            "status": "expected one of idea, briefed, running, measured, archived",
            "slug": "must match",
            "extra": "unexpected property owner",
            "date": "expected a real date",
            "bool": "expected number or string",
            "empty-title": "expected at least 1 character",
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, results in cases.items():
                folder = write_experiment(root / name, results, name=results["id"])
                text = "\n".join(v.validate_experiment(folder))
                self.assertIn(expectations[name], text, name)

    def test_id_must_match_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = write_experiment(Path(tmp), BASE, name="other-run")
            text = "\n".join(v.validate_experiment(folder))
        self.assertIn("does not match folder 'other-run'", text)

    def test_measured_requires_a_metric(self) -> None:
        results = {**BASE, "status": "measured"}
        with tempfile.TemporaryDirectory() as tmp:
            folder = write_experiment(Path(tmp), results)
            text = "\n".join(v.validate_experiment(folder))
        self.assertIn("metrics: expected at least 1 item", text)

    def test_archived_requires_end_and_outcome(self) -> None:
        results = {
            **BASE,
            "status": "archived",
            "metrics": [{"name": "completions", "value": 3, "unit": "visits"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            folder = write_experiment(Path(tmp), results)
            text = "\n".join(v.validate_experiment(folder))
        self.assertIn("missing required property ended", text)
        self.assertIn("missing required property outcome", text)

    def test_ended_before_started(self) -> None:
        results = {
            **BASE,
            "status": "archived",
            "ended": "2025-12-31",
            "outcome": "drop",
            "metrics": [{"name": "completions", "value": 0}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            folder = write_experiment(Path(tmp), results)
            text = "\n".join(v.validate_experiment(folder))
        self.assertIn("ended is before started", text)

    def test_archived_record_passes(self) -> None:
        results = {
            **BASE,
            "status": "archived",
            "ended": "2026-01-02",
            "outcome": "ship",
            "summary": "The hypothesis held for the three people who tried it.",
            "metrics": [{"name": "completions", "value": 3, "unit": "visits"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            folder = write_experiment(Path(tmp), results)
            self.assertEqual(v.validate_experiment(folder), [])

    def test_cli_reports_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "sample-run"
            folder.mkdir()
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), str(folder)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(proc.returncode, 1)
        self.assertIn("missing file brief.md", proc.stderr)

    def test_unsupported_schema_keyword(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            v.assert_supported({"type": "object", "$ref": "#"})
        self.assertIn("unsupported keywords: $ref", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
