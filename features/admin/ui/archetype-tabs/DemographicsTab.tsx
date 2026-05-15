"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import BarChart from "@features/admin/ui/BarChart";

interface DistItem {
  label: string;
  count: number;
}

interface ArchetypeData {
  demographics: {
    gender: DistItem[];
    orientation: DistItem[];
    relationship: DistItem[];
    location: DistItem[];
  };
}

export default function DemographicsTab({ slug, days }: { slug: string; days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ArchetypeData>(
    `/api/admin/archetypes/${slug}`,
    params
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load demographics."}
      </div>
    );
  }

  const sections = [
    { title: "Gender", items: data.demographics.gender },
    { title: "Sexual Orientation", items: data.demographics.orientation },
    { title: "Relationship Status", items: data.demographics.relationship },
    { title: "Top Locations", items: data.demographics.location },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {sections.map(
        (s) =>
          s.items.length > 0 && (
            <div key={s.title} className="rounded-xl border border-white/10 bg-surface p-5">
              <h3 className="mb-4 text-sm font-medium text-text-primary">{s.title}</h3>
              <BarChart
                items={s.items.map((i) => ({ label: i.label, value: i.count }))}
                direction="horizontal"
              />
            </div>
          )
      )}
    </div>
  );
}
