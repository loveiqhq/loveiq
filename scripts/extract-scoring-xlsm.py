#!/usr/bin/env python3
"""
Extract every sheet from a scoring-config .xlsm workbook into CSV files
under data/scoring-config/.

Zero third-party deps: uses stdlib zipfile + xml.etree.ElementTree only.
The XXE Semgrep rules are suppressed inline below: the input is a trusted local
workbook we author, not untrusted XML, so stdlib parsing is appropriate
(per the Python docs' own trusted-vs-untrusted guidance).

Usage:
  python scripts/extract-scoring-xlsm.py [path-to-xlsm]

Defaults to .source-artifacts/scoring-v9/Scoring_Workbook_v9.xlsm.

Non-data sheets named in SKIP_SHEETS (e.g. README, changelog) are skipped
so they don't produce CSVs the codegen step doesn't know how to consume.
"""
from __future__ import annotations

import csv
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET  # nosemgrep: python.lang.security.use-defused-xml.use-defused-xml -- trusted local build artifact (own .xlsm), not untrusted input

NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

DEFAULT_XLSM = ".source-artifacts/scoring-v9/Scoring_Workbook_v9.xlsm"
OUTPUT_DIR = Path("data/scoring-config")

SKIP_SHEETS = {"README", "changelog"}


def col_letter_to_idx(col: str) -> int:
    n = 0
    for c in col:
        n = n * 26 + (ord(c) - ord("A") + 1)
    return n - 1


def parse_ref(ref: str) -> tuple[int, int]:
    m = re.match(r"([A-Z]+)(\d+)", ref)
    if not m:
        raise ValueError(f"bad cell ref: {ref}")
    return col_letter_to_idx(m.group(1)), int(m.group(2))


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        with zf.open("xl/sharedStrings.xml") as f:
            tree = ET.parse(f)  # nosemgrep: python.lang.security.use-defused-xml-parse.use-defused-xml-parse -- trusted local .xlsm parsed at build time, never remote input
    except KeyError:
        return []
    out: list[str] = []
    for si in tree.getroot().findall("main:si", NS):
        text = ""
        for t in si.iter():
            if t.tag.endswith("}t"):
                text += t.text or ""
        out.append(text)
    return out


def sheet_rows(zf: zipfile.ZipFile, sheet_path: str, shared: list[str]) -> list[list[str]]:
    with zf.open(sheet_path) as f:
        tree = ET.parse(f).getroot()  # nosemgrep: python.lang.security.use-defused-xml-parse.use-defused-xml-parse -- trusted local .xlsm parsed at build time, never remote input
    sheet_data = tree.find("main:sheetData", NS)
    rows: list[list[str]] = []
    max_col = 0
    raw: list[tuple[int, dict[int, str]]] = []
    for row in sheet_data.findall("main:row", NS):
        r_idx = int(row.get("r"))
        cells: dict[int, str] = {}
        for c in row.findall("main:c", NS):
            ref = c.get("r")
            col_idx, _ = parse_ref(ref)
            t = c.get("t")
            v_el = c.find("main:v", NS)
            is_el = c.find("main:is", NS)
            if v_el is None and is_el is None:
                val = ""
            elif t == "s":
                val = shared[int(v_el.text)]
            elif t == "inlineStr" and is_el is not None:
                val = "".join((x.text or "") for x in is_el.iter() if x.tag.endswith("}t"))
            elif t == "b":
                val = "TRUE" if v_el.text == "1" else "FALSE"
            else:
                val = v_el.text if v_el is not None else ""
            cells[col_idx] = val
            if col_idx > max_col:
                max_col = col_idx
        raw.append((r_idx, cells))

    # Trim trailing fully-blank rows
    while raw and not any(v.strip() for v in raw[-1][1].values()):
        raw.pop()

    # Determine last meaningful column (strip padding columns)
    used_cols = 0
    for _, cells in raw:
        for idx, v in cells.items():
            if v.strip() and idx + 1 > used_cols:
                used_cols = idx + 1
    if used_cols == 0:
        used_cols = max_col + 1

    for _, cells in raw:
        rows.append([cells.get(i, "") for i in range(used_cols)])
    return rows


def main() -> int:
    xlsm_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(DEFAULT_XLSM)
    if not xlsm_path.exists():
        print(f"ERROR: xlsm not found: {xlsm_path}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(xlsm_path) as zf:
        shared = load_shared_strings(zf)

        with zf.open("xl/workbook.xml") as f:
            wb = ET.parse(f).getroot()  # nosemgrep: python.lang.security.use-defused-xml-parse.use-defused-xml-parse -- trusted local .xlsm parsed at build time, never remote input
        sheets = []
        for s in wb.findall("main:sheets/main:sheet", NS):
            sheets.append(
                {
                    "name": s.get("name"),
                    "rid": s.get(f"{{{REL_NS}}}id"),
                }
            )

        with zf.open("xl/_rels/workbook.xml.rels") as f:
            rels = ET.parse(f).getroot()  # nosemgrep: python.lang.security.use-defused-xml-parse.use-defused-xml-parse -- trusted local .xlsm parsed at build time, never remote input
        rel_map = {r.get("Id"): r.get("Target") for r in rels}

        written: list[tuple[str, int]] = []
        skipped: list[str] = []
        for sh in sheets:
            name = sh["name"]
            if name in SKIP_SHEETS:
                skipped.append(name)
                continue
            target = rel_map[sh["rid"]]
            sheet_path = target if target.startswith("xl/") else f"xl/{target.lstrip('/')}"
            rows = sheet_rows(zf, sheet_path, shared)
            out_file = OUTPUT_DIR / f"{name}.csv"
            with out_file.open("w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f, lineterminator="\n")
                writer.writerows(rows)
            written.append((name, len(rows)))

    print(f"Extracted {len(written)} sheet(s) from {xlsm_path} -> {OUTPUT_DIR}/")
    for name, n in written:
        print(f"  {name}.csv  ({n} rows)")
    if skipped:
        print(f"Skipped non-data sheets: {', '.join(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
