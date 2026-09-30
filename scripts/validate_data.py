#!/usr/bin/env python3
"""Fail the workflow before publishing malformed or suspicious intelligence data."""

from __future__ import annotations

import json
import sys
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "public" / "data" / "intelligence.json"
REQUIRED_ITEM_FIELDS = {
    "id",
    "title",
    "summary",
    "url",
    "source",
    "company",
    "region",
    "topic",
    "signal_type",
    "published_at",
    "why_it_matters",
    "career_angle",
    "score",
}


def fail(message: str) -> None:
    print(f"data validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    if not DATA_FILE.exists():
        fail(f"missing {DATA_FILE}")
    try:
        payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON: {exc}")

    if payload.get("meta", {}).get("schema_version") != 1:
        fail("unsupported schema_version")
    items = payload.get("items")
    if not isinstance(items, list):
        fail("items must be a list")
    if not items:
        fail("refusing to publish an empty dataset")
    if len(items) > 2000:
        fail("dataset exceeded the safety limit of 2000 items")

    seen: set[str] = set()
    for index, item in enumerate(items):
        missing = REQUIRED_ITEM_FIELDS - set(item)
        if missing:
            fail(f"item {index} is missing {sorted(missing)}")
        if item["id"] in seen:
            fail(f"duplicate item id: {item['id']}")
        seen.add(item["id"])
        parsed = urllib.parse.urlsplit(item["url"])
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            fail(f"unsafe URL for item {item['id']}")
        if not isinstance(item["score"], int) or not 0 <= item["score"] <= 100:
            fail(f"invalid score for item {item['id']}")

    print(f"validated {len(items)} intelligence items")
    return 0


if __name__ == "__main__":
    sys.exit(main())
