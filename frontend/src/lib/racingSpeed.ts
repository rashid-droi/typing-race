import type { LeaderboardPlayer } from "../types/game";

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

/**
 * Streak-style multiplier from typing quality (no explicit streak from server).
 * Rewards high accuracy with few errors relative to keystrokes.
 */
export function streakMultiplier(p: LeaderboardPlayer): number {
  const ks = p.keystrokes ?? 0;
  if (ks <= 0) return 1;
  const err = p.errors ?? 0;
  const hitRate = clamp((ks - err) / ks, 0, 1);
  return clamp(1 + hitRate ** 1.65 * 2.35, 1, 3.5);
}

/**
 * Combined "visual speed" 0..~1.7 for camera / VFX (WPM + accuracy + streak + progress).
 */
export function visualIntensity(p: LeaderboardPlayer): number {
  const wpmNorm = clamp(p.wpm / 135, 0, 1.2);
  const acc = clamp(p.accuracy ?? 0.94, 0, 1);
  const streak = streakMultiplier(p);
  const prog = clamp(p.progress, 0, 1);
  const raw =
    wpmNorm * 0.42 + acc * 0.34 + (streak - 1) * 0.32 + prog * 0.18;
  return clamp(raw, 0, 1.75);
}

export function nitroActive(intensity: number): boolean {
  return intensity > 0.58;
}
