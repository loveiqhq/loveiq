"use client";

import type { Table, Tile } from "@features/admin/server/ap/common";
import type { Unit } from "@features/admin/server/ap/format";

/** One CSV cell, with spreadsheet formulas defused as the admin's other exports do. */
function cell(value: string): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d+(\.\d+)?%?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** What a number column is counted in, said once in its header. */
const UNIT_NAMES: Partial<Record<Unit, string>> = {
  eur: "EUR",
  eur3: "EUR",
  pct: "%",
  mmss: "seconds",
  min: "minutes",
  days: "days",
};

const headerOf = (label: string, unit: Unit | "text") =>
  UNIT_NAMES[unit as Unit] ? `${label} (${UNIT_NAMES[unit as Unit]})` : label;

/** A figure as a spreadsheet can add it up: plain digits, the unit in the header instead. */
export function csvNumber(unit: Unit | "text", v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "";
  switch (unit) {
    case "pct":
      return String(Math.round(v * 10000) / 100);
    case "mmss":
      return String(Math.round(v / 1000));
    case "eur3":
      return String(Math.round(v * 10000) / 10000);
    case "text":
      return String(v);
    default:
      return String(Math.round(v * 100) / 100);
  }
}

/** The page's tiles and tables as one CSV: names as the page shows them, figures as numbers. */
export function tablesToCsv(
  sections: Array<{ name: string; table: Table }>,
  tiles: Tile[] = []
): string {
  const lines: string[] = [];
  if (tiles.length) {
    lines.push(cell("Headline"), ["Figure", "Value", "Previous"].map(cell).join(","));
    for (const t of tiles) {
      lines.push(
        [
          headerOf(t.label, t.unit),
          t.blocked ? "" : csvNumber(t.unit, t.value),
          csvNumber(t.unit, t.prev),
        ]
          .map(cell)
          .join(",")
      );
    }
    lines.push("");
  }
  for (const s of sections) {
    lines.push(cell(s.name));
    lines.push(s.table.columns.map((c) => cell(headerOf(c.label, c.unit))).join(","));
    for (const r of s.table.rows) {
      lines.push(
        [r.label, ...r.values.map((v, i) => csvNumber(s.table.columns[i + 1]?.unit ?? "text", v))]
          .map(cell)
          .join(",")
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function exportTables(
  filename: string,
  sections: Array<{ name: string; table: Table }>,
  tiles: Tile[] = []
) {
  const blob = new Blob([`﻿${tablesToCsv(sections, tiles)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
