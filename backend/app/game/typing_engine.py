"""Server-side typing race logic: shared paragraph, keystrokes, stats."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Short paragraphs for races; all players in a room share one pick per session.
PARAGRAPHS: tuple[str, ...] = (
    "The quick brown fox jumps over the lazy dog while the river runs calm below the bridge.",
    "Typing fast requires rhythm patience and a steady mind focused on each word ahead.",
    "Stars fill the night sky over the quiet harbor where boats sway gently in the breeze.",
    "Code is read far more often than it is written so clarity beats cleverness every time.",
)

# Extra standalone lines (cycled) so long races have enough variety.
EXTRA_LINES: tuple[str, ...] = (
    "Rain taps the window while the city hums with traffic far below the apartment.",
    "A good teammate calls out the next move before the moment gets tense and rushed.",
    "Practice turns mistakes into muscle memory if you keep the reps honest and slow.",
    "The lighthouse beam sweeps the dark water in a steady rhythm older than the town.",
    "Ship early ship often but never ship secrets keys or tokens in client bundles.",
    "Coffee cools on the desk next to notes scribbled during a midnight debugging session.",
    "The forest path narrows until sunlight filters through leaves in scattered coins.",
    "Latency hides in the places you forget to measure so watch your percentiles closely.",
    "A calm breath before the sprint starts can steady your hands more than extra caffeine.",
    "The orchestra warms up in fragments until the conductor lifts the baton for silence.",
    "Refactors pay rent in readability even when tests stay green and nobody claps.",
    "The desert wind reshapes dunes overnight the way habits reshape your daily rhythm.",
    "Small wins stack faster than heroic pushes that burn out the team by Friday.",
    "The river bends around stone it cannot move and keeps going without complaint.",
    "Documentation is a love letter you write to your future self when memory fades.",
    "Thunder rolls across the ridge while dogs find the safest corner of the house.",
    "Version control is a time machine that only works if commits stay small and clear.",
    "Morning frost outlines each blade of grass until the sun erases the blueprint.",
    "A sharp error message saves an hour of guessing so write them like a good headline.",
    "The workshop smells of sawdust and oil tools hung in the same place for decades.",
    "Backups are boring until the day they become the most interesting thing you own.",
    "Snow muffles the world until footsteps become the loudest part of the neighborhood.",
    "Interfaces should be hard to misuse even when users are clever tired or rushed.",
    "The kite tugs against the string as if it wants to negotiate a higher altitude.",
    "Sleep is not a luxury it is part of performance the same way training is.",
    "Old maps show towns that dried up when the rails chose a different valley route.",
    "Security is a process not a checkbox so revisit assumptions after every release.",
    "The bakery opens before dawn with trays of proofed dough ready for the oven.",
    "Logs tell stories if you learn to read them without drowning in noise and spam.",
    "The climb is steep but the view rewards anyone patient enough to pack water.",
    "Automation removes toil so humans can focus on judgment taste and rare edge cases.",
    "Waves erase footprints and remind you that progress can look like starting again.",
    "Naming things is hard because names carry expectations longer than the code does.",
    "The cat watches the cursor move as if it might be prey worth pouncing on later.",
    "Resilience is built from retries with backoff not from hoping the network behaves.",
)

ALLOWED_TEXT_LINE_COUNTS: tuple[int, ...] = (1, 2, 5, 8)
DEFAULT_TEXT_LINE_COUNT: int = 1


def normalize_text_line_count(raw: int) -> int:
    """Clamp to the nearest allowed bucket (ties round down to the previous allowed)."""
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_TEXT_LINE_COUNT
    if n in ALLOWED_TEXT_LINE_COUNTS:
        return n
    allowed = list(ALLOWED_TEXT_LINE_COUNTS)
    if n <= allowed[0]:
        return allowed[0]
    if n >= allowed[-1]:
        return allowed[-1]
    for lo, hi in zip(allowed, allowed[1:]):
        if lo <= n <= hi:
            return lo if (n - lo) <= (hi - n) else hi
    return DEFAULT_TEXT_LINE_COUNT


def _sentence_line_pool() -> list[str]:
    out: list[str] = []
    for block in PARAGRAPHS:
        parts = re.split(r"(?<=[.!?])\s+", block.strip())
        for seg in parts:
            s = seg.strip()
            if s:
                out.append(s)
    out.extend(list(EXTRA_LINES))
    if not out:
        out = ["Type carefully and steadily."]
    return out


_LINE_POOL: list[str] | None = None


def _pool() -> list[str]:
    global _LINE_POOL
    if _LINE_POOL is None:
        _LINE_POOL = _sentence_line_pool()
    return _LINE_POOL


def build_race_paragraph(
    room_id: str, *, race_round: int = 0, line_count: int = DEFAULT_TEXT_LINE_COUNT
) -> str:
    """Multi-line race text: newline-separated lines, deterministic per room + round."""
    n = normalize_text_line_count(line_count)
    pool = _pool()
    start = (abs(hash(room_id)) + int(race_round) * 31) % len(pool)
    lines = [pool[(start + i) % len(pool)] for i in range(n)]
    return "\n".join(lines)


def pick_paragraph(room_id: str, *, race_round: int = 0) -> str:
    """Backward-compatible alias: default race length. Prefer build_race_paragraph."""
    return build_race_paragraph(
        room_id, race_round=race_round, line_count=DEFAULT_TEXT_LINE_COUNT
    )


@dataclass
class TypingRuntimeState:
    """Mutable per-player typing progress (authoritative on server)."""

    typed_index: int = 0
    keystrokes: int = 0
    errors: int = 0
    started_at_mono: float | None = None


def apply_keystroke(
    state: TypingRuntimeState,
    paragraph: str,
    *,
    char: str | None,
    backspace: bool,
    now_mono: float,
) -> None:
    if not paragraph:
        return
    if backspace:
        state.keystrokes += 1
        if state.typed_index > 0:
            state.typed_index -= 1
        return
    if char is None or len(char) != 1:
        return
    if state.started_at_mono is None:
        state.started_at_mono = now_mono
    state.keystrokes += 1
    if state.typed_index >= len(paragraph):
        return
    if char == paragraph[state.typed_index]:
        state.typed_index += 1
    else:
        state.errors += 1
        # Penalty: cursor moves back one correct character (never below 0).
        state.typed_index = max(0, state.typed_index - 1)


def compute_stats(
    state: TypingRuntimeState,
    paragraph_len: int,
    now_mono: float,
    *,
    wpm_cap: float = 350.0,
) -> tuple[float, float, float]:
    """Return (wpm, accuracy, progress). Progress is per-character (typed / len)."""
    pl = max(paragraph_len, 1)
    progress = min(1.0, state.typed_index / pl)
    if state.keystrokes <= 0:
        accuracy = 1.0
    else:
        accuracy = max(0.0, min(1.0, (state.keystrokes - state.errors) / state.keystrokes))
    if state.started_at_mono is None or state.typed_index <= 0:
        return 0.0, accuracy, progress
    elapsed_s = max(now_mono - state.started_at_mono, 1e-3)
    minutes = elapsed_s / 60.0
    wpm = (state.typed_index / 5.0) / max(minutes, 1e-9)
    return min(wpm, wpm_cap), accuracy, progress
