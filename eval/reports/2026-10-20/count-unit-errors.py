#!/usr/bin/env python3
"""Count price-unit errors on generated pages, independently of the code under test.

A unit error is a price on the page whose amount matches a gold item price but whose
counter unit (the one written right after the amount, e.g. "¥22份", "22 元/份",
"12 元一个") differs from that gold item's unit. Prices without a unit are not counted.

Usage: python3 -I count-unit-errors.py <raw.json> <samples-dir> [out.json]
"""
import json
import re
import sys
from pathlib import Path

UNITS = "个份杯块只盒袋瓶碗件片支串张套客位"
PRICE = re.compile(
    r"[¥￥]\s*(\d+(?:\.\d+)?)\s*(?:/\s*)?([" + UNITS + r"])?"
    r"|(\d+(?:\.\d+)?)\s*元\s*(?:/\s*|一)?([" + UNITS + r"])?"
)


def gold_units(samples_dir: Path, sample_id: str) -> dict[float, set[str]]:
    gold = json.loads((samples_dir / sample_id / "gold.json").read_text(encoding="utf-8"))
    units: dict[float, set[str]] = {}
    for item in gold["items"]:
        price = item.get("price")
        if price and price.get("unit"):
            units.setdefault(float(price["amount"]), set()).add(price["unit"])
    return units


def main() -> None:
    raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    samples_dir = Path(sys.argv[2])
    errors = []
    pages_by_group: dict[str, int] = {}
    for page in raw["compare"]["pages"]:
        if not page["ok"]:
            continue
        group = page["group"]
        pages_by_group[group] = pages_by_group.get(group, 0) + 1
        units = gold_units(samples_dir, page["sampleId"])
        for m in PRICE.finditer(page["visibleText"]):
            amount = float(m.group(1) or m.group(3))
            unit = m.group(2) or m.group(4)
            if unit and amount in units and unit not in units[amount]:
                errors.append({
                    "page": f'{page["sampleId"]}/{group}/{page["n"]}',
                    "text": m.group(0),
                    "goldUnit": "/".join(sorted(units[amount])),
                    "pageUnit": unit,
                })
    by_group = {g: sum(1 for e in errors if e["page"].split("/")[1] == g) for g in pages_by_group}
    result = {"pagesByGroup": pages_by_group, "errorsByGroup": by_group, "total": len(errors), "errors": errors}
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if len(sys.argv) > 3:
        Path(sys.argv[3]).write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
