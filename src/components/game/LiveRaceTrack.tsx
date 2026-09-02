"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useGameStore } from "@/lib/game-store";
import { RaceCarChaseView } from "./RaceCarChase";
import type { CarColor } from "./CartoonCar";
import "./arcade-race.css";

const OPPONENT_COLORS: CarColor[] = ["red", "blue", "orange", "green", "yellow"];

function opponentColor(index: number): CarColor {
  return OPPONENT_COLORS[index % OPPONENT_COLORS.length];
}

function perspectivePlacement(progress: number, laneIndex: number, laneCount: number) {
  const t = Math.min(1, Math.max(0, progress));
  const vanishY = 14;
  const bottomY = 88;
  const y = bottomY - t * (bottomY - vanishY);

  const laneNorm = laneCount <= 1 ? 0.5 : laneIndex / (laneCount - 1);
  const spread = 0.06 + (1 - t) * 0.78;
  const x = 50 + (laneNorm - 0.5) * spread * 100;

  const scale = 0.28 + (1 - t) * 0.72;
  const zIndex = Math.round((1 - t) * 200) + (laneIndex % 3);

  return { x, y, scale, zIndex };
}

function useSmoothedProgress(targets: Record<string, number>, myId: string) {
  const [smooth, setSmooth] = useState(targets);
  const ref = useRef(targets);
  ref.current = targets;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setSmooth((prev) => {
        const t = ref.current;
        let changed = false;
        const next = { ...prev };
        for (const id of Object.keys(t)) {
          const target = t[id] ?? 0;
          if (id === myId) {
            if (next[id] !== target) { next[id] = target; changed = true; }
            continue;
          }
          const cur = next[id] ?? target;
          const diff = target - cur;
          if (Math.abs(diff) > 0.0008) { next[id] = cur + diff * 0.22; changed = true; }
          else if (cur !== target) { next[id] = target; changed = true; }
        }
        for (const id of Object.keys(prev)) if (!(id in t)) delete next[id];
        return changed ? next : prev;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [myId]);

  return smooth;
}

function PerspectiveRoad({ laneCount }: { laneCount: number }) {
  const laneLines = Math.max(laneCount - 1, 3);
  const vanish = { x: 200, y: 48 };

  return (
    <svg className="arcade-race__road-svg" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="arcade-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d2855" />
          <stop offset="55%" stopColor="#6b4080" />
          <stop offset="78%" stopColor="#c97a55" />
          <stop offset="100%" stopColor="#f0b060" />
        </linearGradient>
        <radialGradient id="arcade-horizon-glow" cx="50%" cy="100%" r="45%">
          <stop offset="0%" stopColor="rgba(255,200,100,0.55)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="arcade-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d5660" />
          <stop offset="100%" stopColor="#2a3d45" />
        </linearGradient>
      </defs>

      <rect width="400" height="320" fill="url(#arcade-sky)" />
      <ellipse cx="200" cy="95" rx="180" ry="50" fill="url(#arcade-horizon-glow)" />

      <path d="M0 110 Q80 85 160 95 T320 88 L400 92 L400 130 L0 130 Z" fill="#352050" opacity="0.9" />
      <path d="M0 125 Q100 105 200 112 T400 108 L400 145 L0 145 Z" fill="#2a1840" />

      <path d="M55 48 L345 48 L385 305 L15 305 Z" fill="url(#arcade-road)" />

      <path d="M15 305 L55 48" stroke="#1e2e34" strokeWidth="14" strokeLinecap="round" />
      <path d="M385 305 L345 48" stroke="#1e2e34" strokeWidth="14" strokeLinecap="round" />

      <path d="M68 52 L375 298" stroke="#e8e4dc" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M332 52 L25 298" stroke="#e8e4dc" strokeWidth="2.5" strokeLinecap="round" />

      <path d="M120 200 Q140 180 160 160" stroke="rgba(0,0,0,0.25)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M260 220 Q240 200 220 175" stroke="rgba(0,0,0,0.2)" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {Array.from({ length: Math.min(laneLines, 5) }).map((_, i) => {
        const laneNorm = (i + 1) / (Math.min(laneLines, 5) + 1);
        const bx = 15 + laneNorm * 370;
        return (
          <line
            key={i}
            x1={vanish.x}
            y1={vanish.y}
            x2={bx}
            y2={305}
            stroke="rgba(255,255,255,0.88)"
            strokeWidth="2"
            strokeDasharray="16 14"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function LiveRaceTrack() {
  const typedIndex = useGameStore((s) => s.typingLocal.typedIndex);
  const playerId = useGameStore((s) => s.playerId);
  const playerName = useGameStore((s) => s.playerName);
  const paragraph = useGameStore((s) => s.paragraph);
  const players = useGameStore((s) => s.players);
  const raceStarted = useGameStore((s) => s.raceStarted);
  const raceFinished = useGameStore((s) => s.raceFinished);

  const myProgress = typedIndex / Math.max(paragraph.length, 1);
  const targetProgress = useMemo(() => {
    const out: Record<string, number> = {};
    if (playerId) out[playerId] = myProgress;
    for (const p of players) out[p.id] = p.id === playerId ? myProgress : p.progress;
    if (playerId && !(playerId in out)) out[playerId] = myProgress;
    return out;
  }, [playerId, players, myProgress]);

  const smoothProgress = useSmoothedProgress(targetProgress, playerId);
  const prevRef = useRef<Record<string, number>>({});
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const moving = new Set<string>();
    for (const [id, prog] of Object.entries(targetProgress)) {
      const prev = prevRef.current[id] ?? prog;
      if (prog > prev + 0.0001) moving.add(id);
      prevRef.current[id] = prog;
    }
    setMovingIds(moving);
    const t = setTimeout(() => setMovingIds(new Set()), 180);
    return () => clearTimeout(t);
  }, [targetProgress]);

  const racers = useMemo(() => {
    const list = players.length
      ? players.map((p) => ({ id: p.id, name: p.name, rank: p.rank, isMe: p.id === playerId }))
      : playerId
        ? [{ id: playerId, name: playerName || "You", rank: 1, isMe: true }]
        : [];
    return [...list].sort((a, b) => a.rank - b.rank);
  }, [players, playerId, playerName]);

  const racersWithLanes = useMemo(() => {
    const ordered = [...racers];
    const meIdx = ordered.findIndex((r) => r.isMe);
    if (meIdx >= 0 && ordered.length > 1) {
      const [me] = ordered.splice(meIdx, 1);
      ordered.splice(Math.floor(ordered.length / 2), 0, me);
    }
    return ordered.map((r, laneIndex) => ({ ...r, laneIndex }));
  }, [racers]);

  const isLive = raceStarted && !raceFinished;
  const laneCount = Math.max(racersWithLanes.length, 4);

  return (
    <div className={`arcade-race ${isLive ? "arcade-race--live" : ""}`} aria-label="Live race track" aria-live="polite">
      <div className="arcade-race__scene">
        <PerspectiveRoad laneCount={laneCount} />

        <div className="arcade-race__cars">
          {racersWithLanes.length === 0 ? (
            <p className="arcade-race__empty">Waiting for racers…</p>
          ) : (
            [...racersWithLanes]
              .sort((a, b) => (smoothProgress[a.id] ?? 0) - (smoothProgress[b.id] ?? 0))
              .map((r) => {
                const progress = smoothProgress[r.id] ?? targetProgress[r.id] ?? 0;
                const { x, y, scale, zIndex } = perspectivePlacement(
                  progress,
                  r.laneIndex,
                  racersWithLanes.length
                );
                return (
                  <div
                    key={r.id}
                    data-racer-id={r.id}
                    className={`arcade-race__car ${r.isMe ? "arcade-race__car--player" : ""}`}
                    style={
                      {
                        left: `${x}%`,
                        top: `${y}%`,
                        zIndex,
                        "--car-scale": scale,
                      } as CSSProperties
                    }
                  >
                    <RaceCarChaseView
                      color={r.isMe ? "yellow" : opponentColor(r.laneIndex)}
                      number={r.rank}
                      moving={movingIds.has(r.id)}
                      isPlayer={r.isMe}
                      className="arcade-race__car-svg"
                    />
                    {r.isMe && <span className="arcade-race__player-label">player 1</span>}
                  </div>
                );
              })
          )}
        </div>
      </div>

      {racersWithLanes.length > 0 && (
        <div className="arcade-race__hud">
          {racersWithLanes.map((r) => {
            const pct = Math.round((smoothProgress[r.id] ?? 0) * 100);
            return (
              <div key={r.id} className={`arcade-race__hud-row ${r.isMe ? "is-me" : ""}`} title={r.name}>
                <span className="arcade-race__hud-rank">P{r.rank}</span>
                <span className="arcade-race__hud-name">{r.isMe ? `${r.name} (you)` : r.name}</span>
                <span className="arcade-race__hud-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
