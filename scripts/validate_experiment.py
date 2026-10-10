#!/usr/bin/env python3
"""Check that an experiment folder has the onboarding files.

Required files: brief.md, metrics.md, results.json.
results.json is checked against experiments/results.schema.json.

Usage:
  python3 scripts/validate_experiment.py experiments/<slug>
  python3 scripts/validate_experiment.py --all
"""

from __future__ import annotations

import argparse
import datetime as dt
import functools
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "experiments" / "results.schema.json"
EXPERIMENTS_DIR = ROOT / "experiments"

REQUIRED_FILES = ("brief.md", "metrics.md", "results.json")
HEADINGS = {
    "brief.md": ("## Hypothesis", "## What ships", "## Audience"),
    "metrics.md": ("## Primary", "## Guardrails", "## Method"),
}

SUPPORTED_KEYWORDS = {
    "$schema",
    "$id",
    "$comment",
    "title",
    "description",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "minItems",
    "enum",
    "const",
    "minLength",
    "pattern",
    "format",
    "allOf",
    "if",
    "then",
    "else",
}
SUPPORTED_TYPES = {"object", "array", "string", "number", "integer", "boolean", "null"}


def assert_supported(schema: object, path: str = "$") -> None:
    """Reject schema keywords this script does not implement."""
    if not isinstance(schema, dict):
        raise SystemExit(f"{path}: schema must be an object")
    unknown = sorted(set(schema) - SUPPORTED_KEYWORDS)
    if unknown:
        raise SystemExit(f"{path}: unsupported keywords: {', '.join(unknown)}")

    if "type" in schema:
        raw = schema["type"]
        types = [raw] if isinstance(raw, str) else raw
        if not isinstance(types, list) or any(
            not isinstance(item, str) or item not in SUPPORTED_TYPES for item in types
        ):
            raise SystemExit(f"{path}: unsupported type {raw!r}")

    if "additionalProperties" in schema and schema["additionalProperties"] not in (
        True,
        False,
    ):
        raise SystemExit(f"{path}: additionalProperties must be true or false")

    if "format" in schema and schema["format"] != "date":
        raise SystemExit(f"{path}: unsupported format {schema['format']!r}")

    if "pattern" in schema:
        try:
            re.compile(schema["pattern"])
        except re.error as exc:
            raise SystemExit(f"{path}: invalid pattern: {exc}") from exc

    if "properties" in schema:
        properties = schema["properties"]
        if not isinstance(properties, dict):
            raise SystemExit(f"{path}.properties: schema must be an object")
        for name, sub in properties.items():
            assert_supported(sub, f"{path}.properties.{name}")

    if "items" in schema:
        if isinstance(schema["items"], list):
            raise SystemExit(f"{path}.items: array form is not supported")
        assert_supported(schema["items"], f"{path}.items")

    for key in ("if", "then", "else"):
        if key in schema:
            assert_supported(schema[key], f"{path}.{key}")

    if "allOf" in schema:
        if not isinstance(schema["allOf"], list):
            raise SystemExit(f"{path}.allOf: schema must be an array")
        for index, sub in enumerate(schema["allOf"]):
            assert_supported(sub, f"{path}.allOf[{index}]")


@functools.cache
def load_results_schema() -> dict:
    try:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"missing schema {SCHEMA_PATH}") from None
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{SCHEMA_PATH.name}: invalid JSON ({exc.msg})") from exc
    assert_supported(schema)
    return schema


def type_ok(instance: object, name: str) -> bool:
    if name == "object":
        return isinstance(instance, dict)
    if name == "array":
        return isinstance(instance, list)
    if name == "string":
        return isinstance(instance, str)
    if name == "number":
        return isinstance(instance, (int, float)) and not isinstance(instance, bool)
    if name == "integer":
        return isinstance(instance, int) and not isinstance(instance, bool)
    if name == "boolean":
        return isinstance(instance, bool)
    if name == "null":
        return instance is None
    return False


def _count(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def string_errors(instance: str, schema: dict, path: str) -> list[str]:
    if "minLength" in schema and len(instance) < schema["minLength"]:
        return [f"{path}: expected at least {_count(schema['minLength'], 'character')}"]
    if "pattern" in schema and re.search(schema["pattern"], instance) is None:
        if schema.get("format") == "date":
            return [f"{path}: expected YYYY-MM-DD"]
        return [f"{path}: must match /{schema['pattern']}/"]
    if schema.get("format") == "date":
        try:
            dt.date.fromisoformat(instance)
        except ValueError:
            return [f"{path}: expected a real date YYYY-MM-DD"]
    return []


def object_errors(instance: dict, schema: dict, path: str) -> list[str]:
    errors: list[str] = []
    properties = schema.get("properties", {})
    if schema.get("additionalProperties") is False:
        for key in instance:
            if key not in properties:
                errors.append(f"{path}: unexpected property {key}")
    for key, sub in properties.items():
        if key in instance:
            errors.extend(validate_instance(instance[key], sub, f"{path}.{key}"))
    for key in schema.get("required", []):
        if key not in instance:
            errors.append(f"{path}: missing required property {key}")
    return errors


def array_errors(instance: list, schema: dict, path: str) -> list[str]:
    errors: list[str] = []
    if "minItems" in schema and len(instance) < schema["minItems"]:
        errors.append(f"{path}: expected at least {_count(schema['minItems'], 'item')}")
    if "items" in schema:
        for index, item in enumerate(instance):
            errors.extend(validate_instance(item, schema["items"], f"{path}[{index}]"))
    return errors


def validate_instance(instance: object, schema: dict, path: str = "$") -> list[str]:
    """Return schema errors. A failing `if` is not itself an error."""
    if "type" in schema:
        raw = schema["type"]
        types = [raw] if isinstance(raw, str) else raw
        if not any(type_ok(instance, name) for name in types):
            return [f"{path}: expected {' or '.join(types)}"]

    errors: list[str] = []
    if "enum" in schema and instance not in schema["enum"]:
        choices = ", ".join(str(item) for item in schema["enum"])
        errors.append(f"{path}: expected one of {choices}")
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: expected {schema['const']!r}")
    if isinstance(instance, str):
        errors.extend(string_errors(instance, schema, path))
    if isinstance(instance, list):
        errors.extend(array_errors(instance, schema, path))
    if isinstance(instance, dict):
        errors.extend(object_errors(instance, schema, path))

    for sub in schema.get("allOf", []):
        errors.extend(validate_instance(instance, sub, path))

    if "if" in schema:
        matched = not validate_instance(instance, schema["if"], path)
        branch = "then" if matched else "else"
        if branch in schema:
            errors.extend(validate_instance(instance, schema[branch], path))
    return errors


def display_dir(directory: Path) -> str:
    resolved = directory.resolve()
    try:
        return str(resolved.relative_to(ROOT))
    except ValueError:
        return str(directory)


def human_location(path: str) -> str:
    if path == "$":
        return ""
    if path.startswith("$."):
        return path[2:]
    if path.startswith("$"):
        return path[1:]
    return path


def schema_message(directory: Path, raw: str) -> str:
    location, sep, detail = raw.partition(": ")
    if not sep:
        detail = raw
        location = "$"
    shown = human_location(location)
    prefix = f"{display_dir(directory)}: results.json"
    if shown:
        return f"{prefix}: {shown}: {detail}"
    return f"{prefix}: {detail}"


def _parse_date(value: object) -> dt.date | None:
    if not isinstance(value, str):
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        return None


def validate_experiment(directory: Path) -> list[str]:
    label = display_dir(directory)
    if not directory.is_dir():
        return [f"{label}: not a directory"]

    errors: list[str] = []
    texts: dict[str, str] = {}
    for name in REQUIRED_FILES:
        file_path = directory / name
        if not file_path.is_file():
            errors.append(f"{label}: missing file {name}")
            continue
        try:
            texts[name] = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"{label}: {name} is not valid UTF-8")

    for name, headings in HEADINGS.items():
        text = texts.get(name)
        if text is None:
            continue
        present = {line.strip() for line in text.splitlines()}
        for heading in headings:
            if heading not in present:
                errors.append(f"{label}: {name} missing heading {heading!r}")

    raw = texts.get("results.json")
    if raw is None:
        return errors

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        errors.append(f"{label}: results.json: invalid JSON ({exc.msg})")
        return errors

    for schema_error in validate_instance(data, load_results_schema()):
        errors.append(schema_message(directory, schema_error))

    if isinstance(data, dict):
        result_id = data.get("id")
        if isinstance(result_id, str) and result_id != directory.name:
            errors.append(
                f"{label}: results.json id {result_id!r} does not match folder {directory.name!r}"
            )
        started = _parse_date(data.get("started"))
        ended = _parse_date(data.get("ended"))
        if started and ended and ended < started:
            errors.append(f"{label}: results.json: ended is before started")
    return errors


def experiment_dirs(root: Path) -> list[Path]:
    if not root.is_dir():
        raise SystemExit(f"{root}: not a directory")
    return sorted(
        child for child in root.iterdir() if child.is_dir() and not child.name.startswith(".")
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check that an experiment folder has brief.md, metrics.md, and a results.json matching the schema."
    )
    parser.add_argument("paths", nargs="*", type=Path, help="Experiment directories")
    parser.add_argument(
        "--all",
        action="store_true",
        help=f"Validate every folder in {EXPERIMENTS_DIR.relative_to(ROOT)}",
    )
    args = parser.parse_args(argv)
    if args.all and args.paths:
        parser.error("pass experiment paths or --all, not both")
    if not args.all and not args.paths:
        parser.error("pass an experiment directory, or --all")

    targets = experiment_dirs(EXPERIMENTS_DIR) if args.all else args.paths
    if args.all and not targets:
        print(f"{EXPERIMENTS_DIR.relative_to(ROOT)}: no experiment folders", file=sys.stderr)
        return 1

    failed = False
    for directory in targets:
        errors = validate_experiment(directory)
        if errors:
            failed = True
            for error in errors:
                print(error, file=sys.stderr)
        else:
            print(f"{display_dir(directory)}: ok")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
