export function teamAverageProgress(progresses: number[]): number {
  if (!progresses.length) return 0;
  return progresses.reduce((a, b) => a + b, 0) / progresses.length;
}

export function teamworkScore(progresses: number[]): number {
  if (progresses.length < 2) return 88;
  const mean = progresses.reduce((a, b) => a + b, 0) / progresses.length;
  const variance =
    progresses.reduce((s, x) => s + (x - mean) ** 2, 0) / progresses.length;
  const stdev = Math.sqrt(variance);
  return Math.max(0, Math.min(100, 100 * (1 - Math.min(1, stdev * 3.8))));
}

export function consistencyScore(accuracies: number[]): number {
  if (!accuracies.length) return 0;
  return Math.max(0, Math.min(100, (100 * accuracies.reduce((a, b) => a + b, 0)) / accuracies.length));
}

export function communicationEfficiencyScore(
  keystrokes: number[],
  errors: number[],
  relayPasses: number,
  memberCount: number
): number {
  const tk = keystrokes.reduce((a, b) => a + b, 0);
  let base: number;
  if (tk <= 0) base = 0.75;
  else {
    const er = errors.reduce((a, b) => a + b, 0);
    base = Math.max(0, Math.min(1, (tk - er) / tk));
  }
  const bonus = 1 + Math.min(0.4, (relayPasses * 0.06) / Math.max(1, memberCount));
  return Math.max(0, Math.min(100, 100 * base * bonus));
}
