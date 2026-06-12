"""Admin data: audit events and training sessions (SQLite-backed)."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from app.db.sqlite import get_db, _json_loads

_tokens: dict[str, dict[str, Any]] = {}


def _now() -> float:
    return time.time()


async def add_event(
    *,
    event_type: str,
    actor: str,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = {
        "id": str(uuid.uuid4()),
        "ts": _now(),
        "type": event_type,
        "actor": actor,
        "meta": meta or {},
    }
    db = get_db()
    await db.execute(
        "INSERT INTO audit_events (id, ts, type, actor, meta) VALUES (?, ?, ?, ?, ?)",
        (row["id"], row["ts"], row["type"], row["actor"], json.dumps(row["meta"])),
    )
    await db.commit()
    return row


async def list_events(limit: int = 100) -> list[dict[str, Any]]:
    db = get_db()
    cur = await db.execute(
        "SELECT id, ts, type, actor, meta FROM audit_events ORDER BY ts DESC LIMIT ?",
        (limit,),
    )
    rows = await cur.fetchall()
    return [
        {
            "id": r["id"],
            "ts": r["ts"],
            "type": r["type"],
            "actor": r["actor"],
            "meta": _json_loads(r["meta"], {}),
        }
        for r in rows
    ]


async def ingest_training_session(payload: dict[str, Any]) -> dict[str, Any]:
    sid = str(payload.get("session_id") or uuid.uuid4())
    row = {
        "id": sid,
        "ts": _now(),
        "room_id": payload.get("room_id"),
        "user_label": payload.get("user_label"),
        "team_id": payload.get("team_id"),
        "final_wpm": float(payload.get("final_wpm") or 0),
        "accuracy": float(payload.get("accuracy") or 0),
        "progress": float(payload.get("progress") or 0),
        "duration_s": float(payload.get("duration_s") or 0),
        "wpm_history": payload.get("wpm_history") or [],
        "replay": payload.get("replay") or [],
        "managed_event_id": payload.get("managed_event_id"),
    }
    db = get_db()
    await db.execute(
        """
        INSERT INTO training_sessions
        (id, ts, room_id, user_label, team_id, final_wpm, accuracy, progress,
         duration_s, wpm_history, replay, managed_event_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row["id"],
            row["ts"],
            row["room_id"],
            row["user_label"],
            row["team_id"],
            row["final_wpm"],
            row["accuracy"],
            row["progress"],
            row["duration_s"],
            json.dumps(row["wpm_history"]),
            json.dumps(row["replay"]),
            row["managed_event_id"],
        ),
    )
    await db.commit()
    await add_event(
        event_type="training.session_ingested",
        actor=str(payload.get("user_label") or "unknown"),
        meta={"session_id": sid, "room_id": row["room_id"]},
    )
    return row


async def list_sessions(limit: int = 50) -> list[dict[str, Any]]:
    db = get_db()
    cur = await db.execute(
        """
        SELECT id, ts, room_id, user_label, team_id, final_wpm, accuracy, progress,
               duration_s, wpm_history, replay, managed_event_id
        FROM training_sessions ORDER BY ts DESC LIMIT ?
        """,
        (limit,),
    )
    rows = await cur.fetchall()
    return [
        {
            "id": r["id"],
            "ts": r["ts"],
            "room_id": r["room_id"],
            "user_label": r["user_label"],
            "team_id": r["team_id"],
            "final_wpm": r["final_wpm"],
            "accuracy": r["accuracy"],
            "progress": r["progress"],
            "duration_s": r["duration_s"],
            "wpm_history": _json_loads(r["wpm_history"], []),
            "replay": _json_loads(r["replay"], []),
            "managed_event_id": r["managed_event_id"],
        }
        for r in rows
    ]


def issue_token(*, company: str, email: str) -> str:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    _tokens[token] = {
        "company": company,
        "email": email,
        "exp": _now() + 86400 * 7,
    }
    return token


def revoke_token(token: str) -> None:
    _tokens.pop(token, None)


def validate_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    row = _tokens.get(token)
    if not row:
        return None
    if row["exp"] < _now():
        _tokens.pop(token, None)
        return None
    return row
