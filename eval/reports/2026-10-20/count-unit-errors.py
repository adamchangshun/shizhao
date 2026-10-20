#!/usr/bin/env python3
"""Count price-unit errors on generated pages, independently of the code under test.

A unit error is a price on the page whose amount matches a gold item price but whose
counter unit (the one written right after the amount, e.g. "¥22份", "22 元/份",
"12 元一个") differs from that gold item's unit. Prices without a unit are not counted.
Not counted but listed for manual review: a slash after the amount followed by something
that is not a single counter (e.g. "¥128 / 6寸", "12 元 / 80g"), and an amount shared by
gold items with different units (the price cannot be tied to one item).

Usage: python3 -I count-unit-errors.py <raw.json> <samples-dir> [out.json]
"""
import hashlib
import json
import re
import sys
from pathlib import Path

UNITS = "个份杯块只盒袋瓶碗件片支串张套客位"
PRICE = re.compile(
    r"[¥￥]\s*(\d+(?:\.\d+)?)(?:\s*(?:/\s*)?([" + UNITS + r"]))?"
    r"|(\d+(?:\.\d+)?)\s*元(?:\s*(?:/\s*|一)?([" + UNITS + r"]))?"
)
OTHER_SLASH = re.compile(r"\s*/\s*(?![" + UNITS + r"])([^\n]{1,4})")


def gold_units(samples_dir: Path, sample_id: str) -> dict[float, set[str]]:
    gold = json.loads(gold_path(samples_dir, sample_id).read_text(encoding="utf-8"))
    units: dict[float, set[str]] = {}
    for item in gold["items"]:
        price = item.get("price")
        if price and price.get("unit"):
            units.setdefault(float(price["amount"]), set()).add(price["unit"])
    return units


def gold_path(samples_dir: Path, sample_id: str) -> Path:
    return samples_dir / sample_id / "gold.json"


def main() -> None:
    raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    samples_dir = Path(sys.argv[2])
    errors = []
    ambiguous = []
    unrecognized = []
    pages_by_group: dict[str, int] = {}
    for page in raw["compare"]["pages"]:
        if not page["ok"]:
            continue
        group = page["group"]
        pages_by_group[group] = pages_by_group.get(group, 0) + 1
        units = gold_units(samples_dir, page["sampleId"])
        page_id = f'{page["sampleId"]}/{group}/{page["n"]}'
        text = page["visibleText"]
        for m in PRICE.finditer(text):
            amount = float(m.group(1) or m.group(3))
            unit = m.group(2) or m.group(4)
            if amount not in units:
                continue
            if not unit:
                other = OTHER_SLASH.match(text, m.end())
                if other:
                    unrecognized.append({"page": page_id, "text": m.group(0) + other.group(0)})
                continue
            if len(units[amount]) > 1:
                ambiguous.append({"page": page_id, "text": m.group(0)})
            elif unit not in units[amount]:
                errors.append({
                    "page": page_id,
                    "text": m.group(0),
                    "goldUnit": "/".join(sorted(units[amount])),
                    "pageUnit": unit,
                })
    by_group = {g: sum(1 for e in errors if e["page"].split("/")[1] == g) for g in pages_by_group}
    # First 16 hex digits only: a full digest trips the repo's secret scan.
    gold_sha256 = {
        sid: hashlib.sha256(gold_path(samples_dir, sid).read_bytes()).hexdigest()[:16]
        for sid in sorted({page["sampleId"] for page in raw["compare"]["pages"]})
    }
    result = {
        "goldSha256": gold_sha256,
        "pagesByGroup": pages_by_group,
        "errorsByGroup": by_group,
        "total": len(errors),
        "errors": errors,
        "ambiguous": ambiguous,
        "unrecognized": unrecognized,
    }
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if len(sys.argv) > 3:
        Path(sys.argv[3]).write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
