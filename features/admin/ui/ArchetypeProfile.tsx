"use client";

import Link from "next/link";
import { useState } from "react";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import DemographicsTab from "@features/admin/ui/archetype-tabs/DemographicsTab";
import BehaviorTab from "@features/admin/ui/archetype-tabs/BehaviorTab";
import DimensionsTab from "@features/admin/ui/archetype-tabs/DimensionsTab";
import ArchetypeAnswersTab from "@features/admin/ui/archetype-tabs/ArchetypeAnswersTab";
import ArchetypeGrowthTab from "@features/admin/ui/archetype-tabs/ArchetypeGrowthTab";

const tabs = ["Demographics", "Behavior", "Dimensions", "Answers", "Growth"] as const;
type Tab = (typeof tabs)[number];

interface ArchetypeProfileProps {
  slug: string;
}

export default function ArchetypeProfile({ slug }: ArchetypeProfileProps) {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Demographics");

  const name = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin/archetypes" className="text-xs text-accent-purple hover:underline">
            ← All Archetypes
          </Link>
          <h2 className="mt-1 font-serif text-xl font-bold text-text-primary">{name}</h2>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>
      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:bg-white/5 hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      {activeTab === "Demographics" && <DemographicsTab slug={slug} days={days} />}
      {activeTab === "Behavior" && <BehaviorTab slug={slug} days={days} />}
      {activeTab === "Dimensions" && <DimensionsTab slug={slug} days={days} />}
      {activeTab === "Answers" && <ArchetypeAnswersTab slug={slug} days={days} />}
      {activeTab === "Growth" && <ArchetypeGrowthTab slug={slug} days={days} />}
    </div>
  );
}
