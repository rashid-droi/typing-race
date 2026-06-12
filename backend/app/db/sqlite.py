"""SQLite persistence for admin audit, training sessions, and managed events."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

_db: aiosqlite.Connection | None = None
_db_path: str = "data/typing-race.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    ts REAL NOT NULL,
    type TEXT NOT NULL,
    actor TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events(ts DESC);

CREATE TABLE IF NOT EXISTS training_sessions (
    id TEXT PRIMARY KEY,
    ts REAL NOT NULL,
    room_id TEXT,
    user_label TEXT,
    team_id INTEGER,
    final_wpm REAL NOT NULL DEFAULT 0,
    accuracy REAL NOT NULL DEFAULT 0,
    progress REAL NOT NULL DEFAULT 0,
    duration_s REAL NOT NULL DEFAULT 0,
    wpm_history TEXT NOT NULL DEFAULT '[]',
    replay TEXT NOT NULL DEFAULT '[]',
    managed_event_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_training_sessions_ts ON training_sessions(ts DESC);

CREATE TABLE IF NOT EXISTS managed_events (
    id TEXT PRIMARY KEY,
    company_slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    join_code TEXT NOT NULL UNIQUE,
    room_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    starts_at REAL,
    ends_at REAL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    max_players INTEGER NOT NULL DEFAULT 500,
    text_line_count INTEGER NOT NULL DEFAULT 1,
    relay_mode INTEGER NOT NULL DEFAULT 0,
    theme_primary TEXT NOT NULL DEFAULT '#7c3aed',
    public_wall INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_managed_events_company ON managed_events(company_slug);
CREATE INDEX IF NOT EXISTS idx_managed_events_join_code ON managed_events(join_code);
"""


async def init_db(database_path: str) -> None:
    global _db, _db_path
    _db_path = database_path
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(database_path)
    _db.row_factory = aiosqlite.Row
    await _db.executescript(_SCHEMA)
    await _db.commit()
    logger.info("sqlite ready at %s", database_path)


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None


def get_db() -> aiosqlite.Connection:
    if _db is None:
        raise RuntimeError("database not initialized")
    return _db


def _json_loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default
