"""Public (unauthenticated) endpoints for player join flows."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.admin import managed_events as me

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/events/by-code/{join_code}")
async def resolve_event_by_code(join_code: str, request: Request) -> dict:
    """Resolve a join code to room_id and event metadata for the player join screen."""
    row = await me.get_managed_event_by_join_code(join_code)
    if row is None:
        raise HTTPException(404, "event_not_found")
    if row["status"] in ("cancelled", "archived"):
        raise HTTPException(410, "event_closed")
    settings = request.app.state.settings
    public_base = settings.app_public_url.rstrip("/")
    return {
        "join_code": row["join_code"],
        "room_id": row["room_id"],
        "name": row["name"],
        "description": row["description"],
        "status": row["status"],
        "text_line_count": row["text_line_count"],
        "relay_mode": row["relay_mode"],
        "theme_primary": row["theme_primary"],
        "join_url": f"{public_base}/?event={row['join_code']}",
        "room_url": f"{public_base}/?room={row['room_id']}",
    }
