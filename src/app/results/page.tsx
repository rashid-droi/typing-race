"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  CartoonTitle,
  CheckeredStrip,
  GameShell,
  rankClass,
} from "@/components/game/GameShell";
import { useGameStore } from "@/lib/game-store";
import { useRequireGameSession } from "@/lib/use-require-game-session";

export default function ResultsPage() {
  const router = useRouter();
  const game = useGameStore();
  const { ready } = useRequireGameSession();

  useEffect(() => {
    if (!ready) return;
    if (!game.raceFinished && !game.finalStandings.length) {
      router.replace(game.raceStarted ? "/game" : "/lobby");
    }
  }, [ready, game.raceFinished, game.finalStandings.length, game.raceStarted, router]);

  useEffect(() => {
    if (ready && game.raceStarted && !game.raceFinished) router.push("/game");
  }, [ready, game.raceStarted, game.raceFinished, router]);

  const rows = [...game.finalStandings].sort((a, b) => a.rank - b.rank);

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
        <div className="text-center">
          <span className="cartoon-banner text-lg font-extrabold tracking-wider">Finish</span>
        </div>
        <CartoonTitle size="md">Results</CartoonTitle>

        <div className="mt-5">
          <CheckeredStrip />
        </div>

        <div className="cartoon-card mt-8 overflow-x-auto p-4">
          <table className="results-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>WPM</th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`race-rank-badge ${rankClass(r.rank)}`}>#{r.rank}</span>
                  </td>
                  <td className="font-extrabold">{r.name}</td>
                  <td className="font-mono text-blue-700">{Math.round(r.wpm)}</td>
                  <td>{Math.round(r.accuracy * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="cartoon-btn cartoon-btn-outline px-5 py-2.5 text-sm"
            onClick={() => {
              game.sendLeave();
              game.resetSession();
              router.push("/");
            }}
          >
            Leave room
          </button>
          <Link
            href="/admin"
            className="cartoon-btn cartoon-btn-blue px-5 py-2.5 text-sm no-underline"
          >
            Admin
          </Link>
        </div>
      </main>
    </GameShell>
  );
}
