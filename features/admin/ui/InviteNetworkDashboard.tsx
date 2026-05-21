"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface Node {
  id: string;
  invitesSent: number;
  invitesReceived: number;
  methods: string[];
}

interface Edge {
  from: string;
  to: string;
  method: string;
  date: string;
}

interface TopReferrer {
  email: string;
  count: number;
  methods: string[];
}

interface NetworkData {
  nodes: Node[];
  edges: Edge[];
  topReferrers: TopReferrer[];
  stats: {
    totalInvites: number;
    uniqueReferrers: number;
    uniqueRecipients: number;
    avgInvitesPerReferrer: number;
    methodBreakdown: Record<string, number>;
  };
}

const TABS = ["Network", "Top Referrers", "Methods"] as const;
type Tab = (typeof TABS)[number];

const medals = ["text-yellow-400", "text-gray-300", "text-orange-400"];

export default function InviteNetworkDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Network");
  const { data, loading, error } = useAdminFetch<NetworkData>("/api/admin/invite-network");

  const nodePositions = useMemo(() => {
    if (!data) return [];
    const cx = 300,
      cy = 200,
      r = 150;
    return data.nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / data.nodes.length - Math.PI / 2;
      return {
        ...node,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });
  }, [data]);

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
        {error || "Failed to load invite data."}
      </div>
    );
  }

  const posMap = new Map(nodePositions.map((n) => [n.id, n]));
  const methodEntries = Object.entries(data.stats.methodBreakdown).sort(([, a], [, b]) => b - a);
  const maxMethod = methodEntries[0]?.[1] || 1;

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
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

      {activeTab === "Network" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Total Invites
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{data.stats.totalInvites}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Unique Referrers
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {data.stats.uniqueReferrers}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Unique Recipients
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {data.stats.uniqueRecipients}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Avg Invites/Referrer
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {data.stats.avgInvitesPerReferrer}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">Network Graph</h3>
            <svg viewBox="0 0 600 400" className="w-full">
              {data.edges.map((edge, i) => {
                const from = posMap.get(edge.from);
                const to = posMap.get(edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={i}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="rgba(156,125,255,0.3)"
                    strokeWidth="1"
                  />
                );
              })}
              {nodePositions.map((node) => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={6 + node.invitesSent * 2}
                    fill={node.invitesSent > 0 ? "rgba(156,125,255,0.6)" : "rgba(255,255,255,0.2)"}
                  />
                  <text
                    x={node.x}
                    y={node.y + 20}
                    fill="white"
                    fontSize="8"
                    textAnchor="middle"
                    opacity={0.6}
                  >
                    {node.id}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}

      {activeTab === "Top Referrers" && (
        <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Invites Sent</th>
                <th className="px-4 py-3">Methods</th>
              </tr>
            </thead>
            <tbody>
              {data.topReferrers.map((r, i) => (
                <tr key={r.email} className="border-b border-white/5 hover:bg-white/5">
                  <td className={`px-4 py-3 font-bold ${medals[i] || "text-text-muted"}`}>
                    #{i + 1}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{r.email}</td>
                  <td className="px-4 py-3 font-medium text-accent-purple">{r.count}</td>
                  <td className="px-4 py-3 text-text-muted">{r.methods.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Methods" && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Invite Method Distribution</h3>
          <div className="space-y-3">
            {methodEntries.map(([method, count]) => (
              <div key={method} className="flex items-center gap-3">
                <span className="w-24 text-sm text-text-muted capitalize">{method}</span>
                <div className="h-8 flex-1 rounded bg-white/5">
                  <div
                    className="flex h-full items-center rounded bg-accent-purple/50 px-3"
                    style={{ width: `${(count / maxMethod) * 100}%` }}
                  >
                    <span className="text-xs font-medium text-text-primary">{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
