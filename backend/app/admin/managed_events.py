"""Managed typing-race events (join codes, rooms, scheduling)."""

from __future__ import annotations

import re
import secrets
import string
import time
import uuid
from typing import Any, Literal

from app.admin import state as admin_state
from app.db.sqlite import get_db
from app.game.typing_engine import ALLOWED_TEXT_LINE_COUNTS, normalize_text_line_count

ManagedEventStatus = Literal[
    "draft",
    "scheduled",
    "lobby_open",
    "in_progress",
    "finished",
    "archived",
    "cancelled",
]

_JOIN_CODE_ALPHABET = string.ascii_uppercase + string.digits
_ROOM_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _now() -> float:
    return time.time()


def _slug_room_id(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")[:32]
    if not base:
        base = "race"
    suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return f"{base}-{suffix}"[:64]


async def _unique_join_code() -> str:
    db = get_db()
    for _ in range(32):
        code = "".join(secrets.choice(_JOIN_CODE_ALPHABET) for _ in range(6))
        cur = await db.execute("SELECT 1 FROM managed_events WHERE join_code = ?", (code,))
        if await cur.fetchone() is None:
            return code
    raise RuntimeError("could not allocate join code")


def _row_to_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_slug": row["company_slug"],
        "name": row["name"],
        "description": row["description"],
        "join_code": row["join_code"],
        "room_id": row["room_id"],
        "status": row["status"],
        "starts_at": row["starts_at"],
        "ends_at": row["ends_at"],
        "timezone": row["timezone"],
        "max_players": row["max_players"],
        "text_line_count": row["text_line_count"],
        "relay_mode": bool(row["relay_mode"]),
        "theme_primary": row["theme_primary"],
        "public_wall": bool(row["public_wall"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


async def create_managed_event(
    *,
    company_slug: str,
    actor: str,
    name: str,
    description: str = "",
    room_id: str | None = None,
    join_code: str | None = None,
    status: ManagedEventStatus = "scheduled",
    starts_at: float | None = None,
    ends_at: float | None = None,
    timezone: str = "UTC",
    max_players: int = 500,
    text_line_count: int = 1,
    relay_mode: bool = False,
    theme_primary: str = "#7c3aed",
    public_wall: bool = False,
) -> dict[str, Any]:
    if not name.strip():
        raise ValueError("name_required")
    rid = (room_id or _slug_room_id(name)).strip()
    if not _ROOM_ID_RE.match(rid):
        raise ValueError("invalid_room_id")
    line_count = normalize_text_line_count(text_line_count)
    if line_count not in ALLOWED_TEXT_LINE_COUNTS:
        raise ValueError("invalid_text_line_count")
    code = (join_code or await _unique_join_code()).strip().upper()
    if len(code) < 4 or len(code) > 12:
        raise ValueError("invalid_join_code")
    now = _now()
    event_id = str(uuid.uuid4())
    db = get_db()
    try:
        await db.execute(
            """
            INSERT INTO managed_events
            (id, company_slug, name, description, join_code, room_id, status,
             starts_at, ends_at, timezone, max_players, text_line_count, relay_mode,
             theme_primary, public_wall, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                company_slug.strip().lower(),
                name.strip(),
                description.strip(),
                code,
                rid,
                status,
                starts_at,
                ends_at,
                timezone,
                max(2, min(10_000, int(max_players))),
                line_count,
                1 if relay_mode else 0,
                theme_primary,
                1 if public_wall else 0,
                now,
                now,
            ),
        )
        await db.commit()
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise ValueError("join_code_taken") from exc
        raise
    await admin_state.add_event(
        event_type="event.created",
        actor=actor,
        meta={"event_id": event_id, "join_code": code, "room_id": rid},
    )
    cur = await db.execute("SELECT * FROM managed_events WHERE id = ?", (event_id,))
    row = await cur.fetchone()
    assert row is not None
    return _row_to_dict(row)


async def list_managed_events(company_slug: str, *, limit: int = 100) -> list[dict[str, Any]]:
    db = get_db()
    cur = await db.execute(
        """
        SELECT * FROM managed_events
        WHERE company_slug = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (company_slug.strip().lower(), limit),
    )
    rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


async def get_managed_event(event_id: str, company_slug: str) -> dict[str, Any] | None:
    db = get_db()
    cur = await db.execute(
        "SELECT * FROM managed_events WHERE id = ? AND company_slug = ?",
        (event_id, company_slug.strip().lower()),
    )
    row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def get_managed_event_by_join_code(join_code: str) -> dict[str, Any] | None:
    db = get_db()
    cur = await db.execute(
        "SELECT * FROM managed_events WHERE join_code = ?",
        (join_code.strip().upper(),),
    )
    row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def update_managed_event_status(
    event_id: str,
    company_slug: str,
    *,
    status: ManagedEventStatus,
    actor: str,
) -> dict[str, Any] | None:
    db = get_db()
    now = _now()
    await db.execute(
        "UPDATE managed_events SET status = ?, updated_at = ? WHERE id = ? AND company_slug = ?",
        (status, now, event_id, company_slug.strip().lower()),
    )
    await db.commit()
    cur = await db.execute(
        "SELECT * FROM managed_events WHERE id = ? AND company_slug = ?",
        (event_id, company_slug.strip().lower()),
    )
    row = await cur.fetchone()
    if row is None:
        return None
    await admin_state.add_event(
        event_type="event.status_changed",
        actor=actor,
        meta={"event_id": event_id, "status": status},
    )
    return _row_to_dict(row)
