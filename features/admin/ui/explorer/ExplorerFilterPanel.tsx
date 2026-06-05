"use client";

import MultiSelect from "@features/admin/ui/MultiSelect";
import { DIMENSION_LABELS, type DimensionKey, type Facets } from "@features/admin/server/explorer";
import { DIMENSION_GROUPS } from "@features/admin/ui/explorer/dimensions";

interface Props {
  facets: Facets;
  selections: Partial<Record<DimensionKey, string[]>>;
  onChange: (dim: DimensionKey, values: string[]) => void;
}

export default function ExplorerFilterPanel({ facets, selections, onChange }: Props) {
  return (
    <div className="space-y-3">
      {DIMENSION_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {group.title}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {group.dims.map((dim) => (
              <MultiSelect
                key={dim}
                title={DIMENSION_LABELS[dim]}
                options={facets[dim] ?? []}
                selected={selections[dim] ?? []}
                onChange={(values) => onChange(dim, values)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
