"use client";

import { useRouter } from "next/navigation";
import {
  CartoonTitle,
  CheckeredStrip,
  GameShell,
  rankClass,
} from "@/components/game/GameShell";
import { LiveRaceTrack } from "@/components/game/LiveRaceTrack";
import { TypingInputZone } from "@/components/game/TypingInputZone";
import { useGameStore } from "@/lib/game-store";
import { useRequireGameSession } from "@/lib/use-require-game-session";
import { useEffect } from "react";

export default function GamePage() {
  const router = useRouter();
  const game = useGameStore();
  const { ready } = useRequireGameSession();

  useEffect(() => {
    if (!ready) return;
    if (game.raceFinished || game.finalStandings.length > 0) router.push("/results");
    else if (!game.raceStarted) router.push("/lobby");
  }, [ready, game.raceFinished, game.finalStandings.length, game.raceStarted, router]);

  if (!ready) {
    return (
      <GameShell>
        <main className="p-8 text-center font-bold text-slate-700">Reconnecting…</main>
      </GameShell>
    );
  }

  const typingBlocked = game.gamePaused || game.raceFinished || !game.raceStarted;

  return (
    <GameShell>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CartoonTitle size="md">Race!</CartoonTitle>
          <span className="cartoon-banner text-sm font-bold">GO GO GO</span>
        </div>

        <div className="mt-4">
          <CheckeredStrip />
        </div>

        {game.gamePaused && (
          <p className="cartoon-paused mt-4">Race paused — hang tight!</p>
        )}

        <div className="mt-6 race-track-wrap">
          <LiveRaceTrack />
        </div>

        <div className="cartoon-card mt-6 p-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Type this
          </p>
          <p className="typing-track">{game.paragraph}</p>
          <TypingInputZone disabled={typingBlocked} />
        </div>

        <div className="mt-6 space-y-3">
          {game.players
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <div
                key={p.id}
                className={`race-player-row ${p.id === game.playerId ? "is-me" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`race-rank-badge ${rankClass(p.rank)}`}>#{p.rank}</span>
                  <span className="flex-1 font-bold">{p.name}</span>
                  <span className="font-mono text-sm font-extrabold text-blue-700">
                    {Math.round(p.wpm)} WPM
                  </span>
                  <span className="text-sm font-bold text-slate-600">
                    {Math.round(p.progress * 100)}%
                  </span>
                </div>
                <div className="race-progress-track mt-2">
                  <div
                    className="race-progress-fill"
                    style={{ width: `${Math.min(100, Math.round(p.progress * 100))}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      </main>
    </GameShell>
  );
}
