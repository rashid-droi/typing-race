"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminButton, AdminPageTitle } from "@/components/game/AdminTheme";
import { CartoonCar } from "@/components/game/CartoonCar";
import { CheckeredStrip } from "@/components/game/GameShell";
import { adminFetch } from "@/lib/admin-client";
import { TEXT_LINE_COUNT_OPTIONS } from "@/lib/types";

export default function NewEventPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [textLineCount, setTextLineCount] = useState(1);
  const [relayMode, setRelayMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ev = await adminFetch("/api/admin/managed-events", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          text_line_count: textLineCount,
          relay_mode: relayMode,
          status: "lobby_open",
        }),
      });
      router.push(`/admin/events/${ev.id}/control`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center gap-3">
        <CartoonCar color="green" className="h-12 w-24" />
        <AdminPageTitle title="Create event" subtitle="Set up a new typing race." />
      </div>
      <div className="mt-4">
        <CheckeredStrip />
      </div>
      <form onSubmit={onSubmit} className="cartoon-card mt-6 space-y-4 p-5">
        <label className="block">
          <span className="cartoon-label">Event name</span>
          <input
            required
            className="cartoon-input"
            placeholder="Event name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="cartoon-label">Description</span>
          <textarea
            className="cartoon-input min-h-[5rem] resize-y"
            placeholder="Description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="cartoon-label">Race length</span>
          <select
            className="cartoon-select"
            value={textLineCount}
            onChange={(e) => setTextLineCount(Number(e.target.value))}
          >
            {TEXT_LINE_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} line{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-green-600"
            checked={relayMode}
            onChange={(e) => setRelayMode(e.target.checked)}
          />
          Relay mode
        </label>
        {error && <p className="cartoon-error text-sm">{error}</p>}
        <AdminButton type="submit" variant="green" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create event"}
        </AdminButton>
      </form>
    </div>
  );
}
