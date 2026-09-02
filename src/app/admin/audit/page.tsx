"use client";

import { useEffect, useState } from "react";
import { AdminPageTitle, AdminTable } from "@/components/game/AdminTheme";
import { CheckeredStrip } from "@/components/game/GameShell";
import { adminFetch } from "@/lib/admin-client";

export default function AdminAuditPage() {
  const [rows, setRows] = useState<{ id: string; type: string; actor: string; ts: number }[]>([]);

  useEffect(() => {
    adminFetch("/api/admin/events?limit=200").then(setRows).catch(console.error);
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageTitle title="Audit log" subtitle="Admin actions and event changes." />
      <div className="mt-4">
        <CheckeredStrip />
      </div>
      <div className="cartoon-card mt-6 p-4">
        <AdminTable>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-xs font-semibold text-slate-500">
                  {new Date(r.ts * 1000).toLocaleString()}
                </td>
                <td className="font-mono text-blue-800">{r.type}</td>
                <td>{r.actor}</td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </div>
    </div>
  );
}
