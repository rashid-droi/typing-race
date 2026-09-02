"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  CartoonTitle,
  CheckeredStrip,
  GameShell,
} from "@/components/game/GameShell";
import { useGameStore } from "@/lib/game-store";
import { resolveJoinTarget } from "@/lib/join";

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const game = useGameStore();
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [teamId, setTeamId] = useState<0 | 1>(0);
  const [relay, setRelay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(null);

  useEffect(() => {
    const room = params.get("room");
    const event = params.get("event");
    if (event) {
      setCodeInput(event.toUpperCase());
      resolveJoinTarget(event)
        .then((resolved) => {
          setEventName(resolved.eventName ?? null);
          setResolvedRoomId(resolved.roomId);
          if (resolved.relayMode) setRelay(true);
        })
        .catch(() => setError("Event not found"));
      return;
    }
    if (room) {
      setCodeInput(room);
      resolveJoinTarget(room)
        .then((resolved) => {
          setResolvedRoomId(resolved.roomId);
          if (resolved.eventName) setEventName(resolved.eventName);
          if (resolved.relayMode) setRelay(true);
        })
        .catch(() => setResolvedRoomId(room));
    }
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name");
    setBusy(true);
    try {
      const resolved = await resolveJoinTarget(codeInput);
      setEventName(resolved.eventName ?? null);
      setResolvedRoomId(resolved.roomId);
      const useRelay = resolved.relayMode ?? relay;

      await game.connectAndJoin(resolved.roomId, name, {
        teamId,
        relay: useRelay || undefined,
      });
      router.push(useGameStore.getState().raceStarted ? "/game" : "/lobby");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameShell>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
        <div className="mb-4 text-center">
          <span className="cartoon-banner text-xs font-bold uppercase tracking-widest text-slate-600">
            Finish line
          </span>
        </div>
        <CartoonTitle>Typing Race</CartoonTitle>
        <p className="cartoon-subtitle mt-3 text-center text-sm font-semibold">
          Enter the event code from your organizer to join the multiplayer race.
        </p>

        <div className="mt-5">
          <CheckeredStrip />
        </div>

        {eventName && (
          <p className="cartoon-event-pill mt-5 text-center text-sm">
            Event: {eventName}
            {resolvedRoomId && (
              <span className="mt-1 block text-xs font-semibold opacity-80">
                Room: {resolvedRoomId}
              </span>
            )}
          </p>
        )}

        <form onSubmit={onSubmit} className="cartoon-card mt-6 space-y-4 p-5 sm:p-6">
          <label className="block">
            <span className="cartoon-label">Display name</span>
            <input
              className="cartoon-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your racer name"
            />
          </label>
          <label className="block">
            <span className="cartoon-label">Event code</span>
            <input
              className="cartoon-input font-mono uppercase tracking-widest"
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase());
                setEventName(null);
                setResolvedRoomId(null);
              }}
              placeholder="e.g. JZZWV8"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs font-semibold text-slate-500">
              6-letter code from admin panel · or room ID if you have it
            </span>
          </label>
          <label className="block">
            <span className="cartoon-label">Team</span>
            <select
              className="cartoon-select"
              value={teamId}
              onChange={(e) => setTeamId(Number(e.target.value) as 0 | 1)}
            >
              <option value={0}>Team A — Blue</option>
              <option value={1}>Team B — Red</option>
            </select>
          </label>
          {error && <p className="cartoon-error text-sm">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="cartoon-btn cartoon-btn-green w-full px-4 py-3 text-base"
          >
            {busy ? "Connecting…" : "Enter lobby"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs font-semibold text-slate-700">
          <Link href="/admin/login" className="underline decoration-2 hover:text-blue-800">
            Admin login
          </Link>
        </p>
      </main>
    </GameShell>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <GameShell>
          <main className="p-8 text-center font-bold text-slate-700">Loading…</main>
        </GameShell>
      }
    >
      <JoinForm />
    </Suspense>
  );
}
