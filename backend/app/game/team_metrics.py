"""Team aggregate scores and qualitative metrics from player stats."""

from __future__ import annotations

from typing import Sequence


def team_average_progress(progresses: Sequence[float]) -> float:
    if not progresses:
        return 0.0
    return sum(progresses) / len(progresses)


def teamwork_score(progresses: Sequence[float]) -> float:
    """Tighter progress spread within the team → higher teamwork."""
    if len(progresses) < 2:
        return 88.0
    mean_p = sum(progresses) / len(progresses)
    var = sum((x - mean_p) ** 2 for x in progresses) / len(progresses)
    stdev = var**0.5
    return max(0.0, min(100.0, 100.0 * (1.0 - min(1.0, stdev * 3.8))))


def consistency_score(accuracies: Sequence[float]) -> float:
    if not accuracies:
        return 0.0
    return max(0.0, min(100.0, 100.0 * (sum(accuracies) / len(accuracies))))


def communication_efficiency_score(
    keystrokes: Sequence[int],
    errors: Sequence[int],
    relay_passes: int,
    member_count: int,
) -> float:
    """Keystroke hit-rate scaled by relay handoffs (proxy for coordination)."""
    tk = sum(keystrokes)
    if tk <= 0:
        base = 0.75
    else:
        er = sum(errors)
        base = max(0.0, min(1.0, (tk - er) / tk))
    bonus = 1.0 + min(0.4, relay_passes * 0.06 / max(1, member_count))
    return max(0.0, min(100.0, 100.0 * base * bonus))
