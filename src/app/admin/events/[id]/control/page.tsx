"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AdminButton,
  AdminCard,
  AdminLinkButton,
  AdminPageTitle,
  AdminSectionTitle,
  AdminStatusBadge,
  AdminTable,
} from "@/components/game/AdminTheme";
import { CartoonCar } from "@/components/game/CartoonCar";
import { CheckeredStrip, RaceLights } from "@/components/game/GameShell";
import { adminFetch, getToken } from "@/lib/admin-client";

type EventRow = {
  id: string;
  name: string;
  join_code: string;
  room_id: string;
  status: string;
  join_url: string;
  text_line_count: number;
  relay_mode: boolean;
};

type LivePlayer = {
  id: string;
  name: string;
  team_id: number;
  progress: number;
  wpm: number;
};

type LiveState = {
  player_count: number;
  started: boolean;
  paused: boolean;
  finished: boolean;
  text_line_count: number;
  relay_mode: boolean;
  admin_hosting: boolean;
  race_round: number;
  players: LivePlayer[];
};

const TEXT_LINE_OPTIONS = [1, 2, 5, 8];

export default function EventControlPage() {
  const params = useParams();
  const id = String(params.id);
  const [ev, setEv] = useState<EventRow | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshLive = useCallback(async () => {
    try {
      const data = await adminFetch(`/api/admin/managed-events/${id}/live`);
      setEv(data.event);
      setLive(data.live);
      setLineCount(data.live.text_line_count);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load live state");
    }
  }, [id]);

  useEffect(() => {
    refreshLive();
    const token = getToken();
    if (token) {
      fetch(`/api/admin/managed-events/${id}/qr.png`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.blob())
        .then((b) => setQrUrl(URL.createObjectURL(b)))
        .catch(() => undefined);
    }
  }, [id, refreshLive]);

  useEffect(() => {
    const timer = setInterval(refreshLive, 2500);
    return () => clearInterval(timer);
  }, [refreshLive]);

  async function gameAction(
    action: "open_lobby" | "start" | "pause" | "resume" | "finish" | "restart",
    extra?: { text_line_count?: number }
  ) {
    setBusy(action);
    setError(null);
    try {
      const data = await adminFetch(`/api/admin/managed-events/${id}/game`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      setEv(data.event);
      setLive(data.live);
      setLineCount(data.live.text_line_count);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Action failed";
      const friendly: Record<string, string> = {
        start_rejected: "Could not start — open the lobby first, then try again.",
        already_started: "Race is already running.",
        pause_rejected: "Pause was rejected.",
        resume_rejected: "Resume was rejected.",
        finish_rejected: "Finish was rejected.",
        restart_rejected: "Restart needs at least one connected player.",
      };
      setError(friendly[detail] ?? detail);
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: string) {
    const row = await adminFetch(`/api/admin/managed-events/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setEv(row);
  }

  async function applyLineCount() {
    await gameAction("open_lobby", { text_line_count: lineCount });
  }

  if (!ev || !live) {
    return <p className="admin-loading">{error ?? "Loading…"}</p>;
  }

  const raceLabel = live.finished
    ? "Finished"
    : live.paused
      ? "Paused"
      : live.started
        ? "In progress"
        : "Lobby";

  const lightMode = live.started && !live.finished && !live.paused ? "go" : live.paused ? "off" : "waiting";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <CartoonCar color="yellow" number={1} className="h-14 w-28 shrink-0" />
        <div className="min-w-0 flex-1">
          <AdminPageTitle title={ev.name} subtitle={`Live race: ${raceLabel}`} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AdminStatusBadge status={ev.status} />
            {live.admin_hosting && (
              <span className="admin-status-badge admin-badge-live">Admin hosting</span>
            )}
          </div>
        </div>
      </div>

      <CheckeredStrip />

      {error && <p className="cartoon-error text-sm">{error}</p>}

      <AdminCard>
        <AdminSectionTitle>Join info</AdminSectionTitle>
        <p className="mt-2 font-mono text-3xl font-extrabold text-blue-800">{ev.join_code}</p>
        <p className="mt-1 break-all text-sm font-semibold text-slate-600">{ev.join_url}</p>
        <p className="mt-2 text-sm font-bold text-slate-700">
          Room: <span className="font-mono">{ev.room_id}</span>
          {ev.relay_mode && (
            <span className="admin-status-badge admin-badge-lobby ml-2">Relay mode</span>
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {qrUrl && (
            <img
              src={qrUrl}
              alt="QR"
              className="h-36 w-36 rounded-xl border-4 border-slate-800 bg-white p-2"
            />
          )}
          <AdminLinkButton href={ev.join_url} target="_blank" variant="blue">
            Open player join page
          </AdminLinkButton>
        </div>
      </AdminCard>

      <AdminCard accent>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AdminSectionTitle>Host console</AdminSectionTitle>
          <span className="text-sm font-bold text-slate-600">
            {live.player_count} player{live.player_count === 1 ? "" : "s"} connected
          </span>
        </div>

        <div className="mt-4 flex justify-center">
          <RaceLights mode={lightMode} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <AdminButton
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => gameAction("open_lobby")}
          >
            {busy === "open_lobby" ? "…" : "Open lobby"}
          </AdminButton>
          <AdminButton
            variant="green"
            disabled={Boolean(busy) || (live.started && !live.finished)}
            onClick={() => gameAction("start")}
          >
            {busy === "start" ? "…" : "Start race"}
          </AdminButton>
          <AdminButton
            variant="yellow"
            disabled={Boolean(busy) || !live.started || live.paused || live.finished}
            onClick={() => gameAction("pause")}
          >
            {busy === "pause" ? "…" : "Pause"}
          </AdminButton>
          <AdminButton
            variant="green"
            disabled={Boolean(busy) || !live.paused}
            onClick={() => gameAction("resume")}
          >
            {busy === "resume" ? "…" : "Resume"}
          </AdminButton>
          <AdminButton
            variant="outline"
            disabled={Boolean(busy) || !live.started || live.finished}
            onClick={() => gameAction("finish")}
          >
            {busy === "finish" ? "…" : "Finish"}
          </AdminButton>
          <AdminButton
            variant="blue"
            disabled={Boolean(busy) || !live.finished}
            onClick={() => gameAction("restart")}
          >
            {busy === "restart" ? "…" : "Play again"}
          </AdminButton>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t-4 border-dashed border-amber-300 pt-4">
          <label className="text-sm font-bold text-slate-600">
            <span className="cartoon-label">Text lines (before start)</span>
            <select
              className="cartoon-select mt-1"
              value={lineCount}
              disabled={live.started && !live.finished}
              onChange={(e) => setLineCount(Number(e.target.value))}
            >
              {TEXT_LINE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} line{n === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <AdminButton
            variant="outline"
            disabled={Boolean(busy) || (live.started && !live.finished)}
            onClick={() => applyLineCount()}
          >
            Apply text length
          </AdminButton>
        </div>

        {live.players.length > 0 && (
          <div className="mt-4 border-t-4 border-dashed border-amber-300 pt-4">
            <AdminTable>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Progress</th>
                  <th>WPM</th>
                </tr>
              </thead>
              <tbody>
                {live.players.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <CartoonCar
                          color={(["red", "blue", "yellow", "green"] as const)[i % 4]}
                          className="h-6 w-12"
                        />
                        {p.name}
                      </div>
                    </td>
                    <td>
                      <span className={p.team_id === 0 ? "team-badge-a" : "team-badge-b"}>
                        Team {p.team_id === 0 ? "A" : "B"}
                      </span>
                    </td>
                    <td>
                      <div className="race-progress-track max-w-[8rem]">
                        <div
                          className="race-progress-fill"
                          style={{ width: `${Math.round(p.progress * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold">{Math.round(p.progress * 100)}%</span>
                    </td>
                    <td className="font-mono font-extrabold text-blue-800">
                      {Math.round(p.wpm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <AdminSectionTitle>Event record status</AdminSectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {["lobby_open", "in_progress", "finished", "archived"].map((s) => (
            <button
              key={s}
              type="button"
              className={`admin-status-badge cursor-pointer capitalize ${
                ev.status === s ? "admin-badge-live ring-2 ring-offset-2 ring-green-700" : ""
              }`}
              onClick={() => setStatus(s)}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">
          Host console buttons update live game state and sync event status.
        </p>
      </AdminCard>
    </div>
  );
}
