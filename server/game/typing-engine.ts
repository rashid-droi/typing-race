export const ALLOWED_TEXT_LINE_COUNTS = [1, 2, 5, 8] as const;
export const DEFAULT_TEXT_LINE_COUNT = 1;

const PARAGRAPHS = [
  "The quick brown fox jumps over the lazy dog while the river runs calm below the bridge.",
  "Typing fast requires rhythm patience and a steady mind focused on each word ahead.",
  "Stars fill the night sky over the quiet harbor where boats sway gently in the breeze.",
  "Code is read far more often than it is written so clarity beats cleverness every time.",
];

const EXTRA_LINES = [
  "Rain taps the window while the city hums with traffic far below the apartment.",
  "A good teammate calls out the next move before the moment gets tense and rushed.",
  "Practice turns mistakes into muscle memory if you keep the reps honest and slow.",
  "The lighthouse beam sweeps the dark water in a steady rhythm older than the town.",
  "Ship early ship often but never ship secrets keys or tokens in client bundles.",
  "Coffee cools on the desk next to notes scribbled during a midnight debugging session.",
  "The forest path narrows until sunlight filters through leaves in scattered coins.",
  "Latency hides in the places you forget to measure so watch your percentiles closely.",
];

function linePool(): string[] {
  const out: string[] = [];
  for (const block of PARAGRAPHS) {
    for (const seg of block.split(/(?<=[.!?])\s+/)) {
      const s = seg.trim();
      if (s) out.push(s);
    }
  }
  out.push(...EXTRA_LINES);
  return out.length ? out : ["Type carefully and steadily."];
}

const POOL = linePool();

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function normalizeTextLineCount(raw: number): number {
  const allowed = [...ALLOWED_TEXT_LINE_COUNTS];
  const n = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_TEXT_LINE_COUNT;
  if (allowed.includes(n as (typeof allowed)[number])) return n;
  if (n <= allowed[0]!) return allowed[0]!;
  if (n >= allowed[allowed.length - 1]!) return allowed[allowed.length - 1]!;
  for (let i = 0; i < allowed.length - 1; i++) {
    const lo = allowed[i]!;
    const hi = allowed[i + 1]!;
    if (n >= lo && n <= hi) return n - lo <= hi - n ? lo : hi;
  }
  return DEFAULT_TEXT_LINE_COUNT;
}

export function buildRaceParagraph(
  roomId: string,
  opts?: { raceRound?: number; lineCount?: number }
): string {
  const n = normalizeTextLineCount(opts?.lineCount ?? DEFAULT_TEXT_LINE_COUNT);
  const start = (stableHash(roomId) + (opts?.raceRound ?? 0) * 31) % POOL.length;
  const lines = Array.from({ length: n }, (_, i) => POOL[(start + i) % POOL.length]!);
  return lines.join("\n");
}

export type TypingRuntimeState = {
  typedIndex: number;
  keystrokes: number;
  errors: number;
  startedAtMono: number | null;
};

export function newTypingState(): TypingRuntimeState {
  return { typedIndex: 0, keystrokes: 0, errors: 0, startedAtMono: null };
}

export function applyKeystroke(
  state: TypingRuntimeState,
  paragraph: string,
  opts: { char?: string | null; backspace?: boolean; nowMono: number }
): void {
  if (!paragraph) return;
  if (opts.backspace) {
    state.keystrokes += 1;
    if (state.typedIndex > 0) state.typedIndex -= 1;
    return;
  }
  const char = opts.char;
  if (!char || char.length !== 1) return;
  if (state.startedAtMono === null) state.startedAtMono = opts.nowMono;
  state.keystrokes += 1;
  if (state.typedIndex >= paragraph.length) return;
  if (char === paragraph[state.typedIndex]) {
    state.typedIndex += 1;
  } else {
    state.errors += 1;
    state.typedIndex = Math.max(0, state.typedIndex - 1);
  }
}

export function computeStats(
  state: TypingRuntimeState,
  paragraphLen: number,
  nowMono: number,
  wpmCap = 350
): { wpm: number; accuracy: number; progress: number } {
  const pl = Math.max(paragraphLen, 1);
  const progress = Math.min(1, state.typedIndex / pl);
  const accuracy =
    state.keystrokes <= 0
      ? 1
      : Math.max(0, Math.min(1, (state.keystrokes - state.errors) / state.keystrokes));
  if (state.startedAtMono === null || state.typedIndex <= 0) {
    return { wpm: 0, accuracy, progress };
  }
  const elapsedS = Math.max(nowMono - state.startedAtMono, 1e-3);
  const wpm = state.typedIndex / 5 / (elapsedS / 60);
  return { wpm: Math.min(wpm, wpmCap), accuracy, progress };
}
