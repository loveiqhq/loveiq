"use client";

import { useState } from "react";

export default function WeeklyDigestButton() {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/digest");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loveiq-digest-${new Date().toISOString().split("T")[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-white/5 hover:text-text-primary disabled:opacity-40"
    >
      {loading ? "Generating..." : "Weekly Digest"}
    </button>
  );
}
