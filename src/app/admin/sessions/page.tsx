"use client";

import { useEffect, useState } from "react";
import { AdminPageTitle, AdminTable } from "@/components/game/AdminTheme";
import { CheckeredStrip } from "@/components/game/GameShell";
import { adminFetch } from "@/lib/admin-client";

export default function AdminSessionsPage() {
  const [rows, setRows] = useState<
    { id: string; user_label: string; final_wpm: number; room_id: string }[]
  >([]);

  useEffect(() => {
    adminFetch("/api/admin/training/sessions?limit=80").then(setRows).catch(console.error);
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageTitle title="Training sessions" subtitle="Past solo practice runs." />
      <div className="mt-4">
        <CheckeredStrip />
      </div>
      <div className="cartoon-card mt-6 p-4">
        <AdminTable>
          <thead>
            <tr>
              <th>User</th>
              <th>Room</th>
              <th>WPM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.user_label}</td>
                <td className="font-mono">{r.room_id}</td>
                <td className="font-extrabold text-blue-800">{Math.round(r.final_wpm)}</td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </div>
    </div>
  );
}
