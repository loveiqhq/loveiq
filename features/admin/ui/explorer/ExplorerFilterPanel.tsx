"use client";

import MultiSelect from "@features/admin/ui/MultiSelect";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  type DimensionKey,
  type Facets,
} from "@features/admin/server/explorer";

// paidStatus is a header segmented control, not a multi-select.
const FILTER_DIMENSIONS = DIMENSION_KEYS.filter((d) => d !== "paidStatus");

interface Props {
  facets: Facets;
  selections: Partial<Record<DimensionKey, string[]>>;
  onChange: (dim: DimensionKey, values: string[]) => void;
}

export default function ExplorerFilterPanel({ facets, selections, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {FILTER_DIMENSIONS.map((dim) => (
        <MultiSelect
          key={dim}
          title={DIMENSION_LABELS[dim]}
          options={facets[dim] ?? []}
          selected={selections[dim] ?? []}
          onChange={(values) => onChange(dim, values)}
        />
      ))}
    </div>
  );
}
