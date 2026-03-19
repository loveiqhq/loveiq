"use client";

import { useState, useMemo } from "react";

export interface Column<T> {
  key: keyof T & string;
  label: string;
  format?: (value: T[keyof T], row: T) => string;
  align?: "left" | "right";
  sortable?: boolean;
}

interface KpiDataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  defaultSortKey?: keyof T & string;
  defaultSortDir?: "asc" | "desc";
}

function frictionColor(value: number | null): string {
  if (value == null) return "";
  if (value > 3) return "text-red-400";
  if (value >= 0) return "text-yellow-300";
  return "text-emerald-400";
}

 
export default function KpiDataTable<T extends Record<string, any>>({
  data,
  columns,
  defaultSortKey,
  defaultSortDir = "asc",
}: KpiDataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [data, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-3 py-2.5 font-medium text-text-muted ${
                  col.align === "right" ? "text-right" : "text-left"
                } ${col.sortable !== false ? "cursor-pointer select-none hover:text-text-primary" : ""}`}
                onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr key={idx} className="border-b border-white/5 transition hover:bg-white/5">
              {columns.map((col) => {
                const raw = row[col.key];
                const formatted = col.format
                  ? col.format(raw, row)
                  : raw == null
                    ? "—"
                    : String(raw);
                const isFriction = col.key === "frictionIndex";
                return (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap px-3 py-2 ${
                      col.align === "right" ? "text-right" : "text-left"
                    } ${isFriction ? frictionColor(raw as number | null) + " font-medium" : "text-text-primary"}`}
                  >
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
