"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminButton,
  AdminLinkButton,
  AdminPageTitle,
  AdminStatusBadge,
} from "@/components/game/AdminTheme";
import { CartoonCar } from "@/components/game/CartoonCar";
import { CheckeredStrip } from "@/components/game/GameShell";
import { adminFetch } from "@/lib/admin-client";

type EventRow = { id: string; name: string; join_code: string; room_id: string; status: string };

const STARTABLE = new Set(["draft", "scheduled", "lobby_open"]);

const CAR_COLORS = ["red", "blue", "yellow", "green", "orange"] as const;

export default function AdminEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/api/admin/managed-events")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load events"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startEvent(ev: EventRow) {
    setStartingId(ev.id);
    setError(null);
    try {
      if (ev.status !== "lobby_open") {
        await adminFetch(`/api/admin/managed-events/${ev.id}/game`, {
          method: "POST",
          body: JSON.stringify({ action: "open_lobby" }),
        });
      }
      const data = await adminFetch(`/api/admin/managed-events/${ev.id}/game`, {
        method: "POST",
        body: JSON.stringify({ action: "start" }),
      });
      setRows((prev) => prev.map((r) => (r.id === ev.id ? data.event : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start event");
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <AdminPageTitle title="Events" subtitle="Create events and start races from here." />
        <AdminLinkButton href="/admin/events/new" variant="yellow" className="shrink-0">
          Create event
        </AdminLinkButton>
      </div>

      <div className="mt-4">
        <CheckeredStrip />
      </div>

      {error && <p className="cartoon-error mt-4 text-sm">{error}</p>}

      {loading ? (
        <p className="admin-loading mt-8">Loading events…</p>
      ) : rows.length === 0 ? (
        <p className="admin-loading mt-8">No events yet. Create one to get started.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((ev, index) => (
            <li key={ev.id} className="cartoon-card p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  <CartoonCar
                    color={CAR_COLORS[index % CAR_COLORS.length]}
                    number={index + 1}
                    className="hidden h-12 w-24 shrink-0 sm:block"
                  />
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold text-slate-800">{ev.name}</h2>
                      <AdminStatusBadge status={ev.status} />
                    </div>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="cartoon-label">Join code</dt>
                        <dd className="font-mono text-base font-extrabold text-blue-800">
                          {ev.join_code}
                        </dd>
                      </div>
                      <div>
                        <dt className="cartoon-label">Room ID</dt>
                        <dd className="truncate font-mono font-bold text-slate-700">
                          {ev.room_id}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {STARTABLE.has(ev.status) && (
                    <AdminButton
                      variant="green"
                      disabled={startingId === ev.id}
                      onClick={() => startEvent(ev)}
                      className="min-w-[7rem]"
                    >
                      {startingId === ev.id ? "Starting…" : "Start event"}
                    </AdminButton>
                  )}
                  {ev.status === "in_progress" && (
                    <span className="admin-status-badge admin-badge-live min-w-[7rem] text-center">
                      Running
                    </span>
                  )}
                  <AdminLinkButton
                    href={`/admin/events/${ev.id}/control`}
                    variant="outline"
                    className="min-w-[7rem] text-center"
                  >
                    Control panel
                  </AdminLinkButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
