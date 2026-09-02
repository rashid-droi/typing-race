"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  CartoonTitle,
  CheckeredStrip,
  GameShell,
  RaceLights,
} from "@/components/game/GameShell";
import { useGameStore } from "@/lib/game-store";
import { useRequireGameSession } from "@/lib/use-require-game-session";

export default function LobbyPage() {
  const router = useRouter();
  const game = useGameStore();
  const { ready } = useRequireGameSession();

  useEffect(() => {
    if (ready && game.raceStarted) router.push("/game");
  }, [ready, game.raceStarted, router]);

  if (!ready) {
    return (
      <GameShell>
        <main className="p-8 text-center font-bold text-slate-700">Reconnecting…</main>
      </GameShell>
    );
  }

  return (
    <GameShell>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <CartoonTitle size="md">Lobby</CartoonTitle>
        <p className="cartoon-subtitle mt-2 text-center text-sm font-semibold">
          Room <span className="font-mono font-bold">{game.roomId}</span>
        </p>

        <div className="mt-5">
          <CheckeredStrip />
        </div>

        <div className="mt-8 flex justify-center">
          <RaceLights mode="waiting" />
        </div>

        <ul className="cartoon-card mt-8 space-y-2 p-4">
          {game.players.map((p) => (
            <li
              key={p.id}
              className={`race-player-row flex items-center justify-between text-sm ${p.id === game.playerId ? "is-me" : ""}`}
            >
              <span className="font-bold">{p.name}</span>
              <span className={p.team_id === 0 ? "team-badge-a" : "team-badge-b"}>
                Team {p.team_id === 0 ? "A" : "B"}
              </span>
            </li>
          ))}
          {!game.players.length && (
            <li className="py-2 text-center text-sm font-semibold text-slate-500">
              Waiting for players…
            </li>
          )}
        </ul>

        <p className="mt-6 text-center text-sm font-bold text-slate-700">
          Waiting for the organizer to start the race…
        </p>
      </main>
    </GameShell>
  );
}
