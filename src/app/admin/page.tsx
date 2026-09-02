"use client";

import { useEffect, useState } from "react";
import { AdminPageTitle, AdminStatCard } from "@/components/game/AdminTheme";
import { CheckeredStrip } from "@/components/game/GameShell";
import { adminFetch } from "@/lib/admin-client";

export default function AdminOverviewPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/analytics/overview").then(setData).catch(console.error);
  }, []);

  if (!data) return <p className="admin-loading">Loading analytics…</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageTitle title="Overview" subtitle="Race stats from your training sessions." />
      <div className="mt-4">
        <CheckeredStrip />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Sessions", data.session_count],
            ["Avg WPM", data.avg_final_wpm],
            ["Median WPM", data.median_final_wpm],
            ["Peak WPM", data.recent_peak_wpm],
          ] as [string, unknown][]
        ).map(([label, val]) => (
          <AdminStatCard key={String(label)} label={label} value={String(val)} />
        ))}
      </div>
    </div>
  );
}
