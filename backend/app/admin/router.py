from __future__ import annotations

import io
import statistics
from typing import Annotated, Any, Literal

import qrcode
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.admin import managed_events as me
from app.admin import state as admin_state
from app.core.config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])


class CompanyLoginBody(BaseModel):
    company_slug: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=1, max_length=128)


class CompanyLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    company_slug: str
    email: str


class AdminMeResponse(BaseModel):
    company: str
    email: str


class EventCreateBody(BaseModel):
    type: str = Field(min_length=1, max_length=64)
    meta: dict[str, Any] = Field(default_factory=dict)


class TrainingSessionIngest(BaseModel):
    session_id: str | None = None
    room_id: str | None = None
    user_label: str | None = None
    team_id: int | None = None
    final_wpm: float = 0
    accuracy: float = 0
    progress: float = 0
    duration_s: float = 0
    wpm_history: list[float] = Field(default_factory=list)
    replay: list[dict[str, Any]] = Field(default_factory=list)
    managed_event_id: str | None = None


class ManagedEventCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    room_id: str | None = Field(default=None, max_length=64)
    join_code: str | None = Field(default=None, min_length=4, max_length=12)
    status: Literal["draft", "scheduled", "lobby_open"] = "scheduled"
    starts_at: float | None = None
    ends_at: float | None = None
    timezone: str = "UTC"
    max_players: int = Field(default=500, ge=2, le=10_000)
    text_line_count: int = 1
    relay_mode: bool = False
    theme_primary: str = "#7c3aed"
    public_wall: bool = False


class ManagedEventStatusBody(BaseModel):
    status: Literal[
        "draft",
        "scheduled",
        "lobby_open",
        "in_progress",
        "finished",
        "archived",
        "cancelled",
    ]


def get_bearer_token(authorization: Annotated[str | None, Header()] = None) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip() or None


def require_admin(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    token = get_bearer_token(authorization)
    row = admin_state.validate_token(token)
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_or_expired_token")
    return row


AdminUser = Annotated[dict[str, Any], Depends(require_admin)]


@router.post("/auth/company/login", response_model=CompanyLoginResponse)
async def company_login(body: CompanyLoginBody) -> CompanyLoginResponse:
    s = get_settings()
    if body.company_slug.strip().lower() != s.admin_company_slug.strip().lower():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown_company")
    if body.email.strip().lower() != s.admin_email.strip().lower():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")
    if body.password != s.admin_password:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")
    token = admin_state.issue_token(company=body.company_slug, email=body.email)
    await admin_state.add_event(
        event_type="auth.company_login",
        actor=body.email,
        meta={"company": body.company_slug},
    )
    return CompanyLoginResponse(
        access_token=token,
        company_slug=body.company_slug,
        email=body.email,
    )


@router.post("/auth/logout")
async def company_logout(
    admin: AdminUser,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    token = get_bearer_token(authorization)
    if token:
        admin_state.revoke_token(token)
    await admin_state.add_event(
        event_type="auth.company_logout",
        actor=str(admin.get("email")),
        meta={"company": admin.get("company")},
    )
    return {"status": "ok"}


@router.get("/me", response_model=AdminMeResponse)
async def admin_me(admin: AdminUser) -> AdminMeResponse:
    return AdminMeResponse(company=str(admin["company"]), email=str(admin["email"]))


@router.get("/analytics/overview")
async def analytics_overview(admin: AdminUser) -> dict[str, Any]:
    _ = admin
    sessions = await admin_state.list_sessions(200)
    wpms = [float(s.get("final_wpm") or 0) for s in sessions if s.get("final_wpm")]
    team_a = [s for s in sessions if s.get("team_id") == 0]
    team_b = [s for s in sessions if s.get("team_id") == 1]
    avg = round(statistics.mean(wpms), 2) if wpms else 0.0
    p50 = round(statistics.median(wpms), 2) if wpms else 0.0

    # Aggregate WPM history buckets (mean per index across sessions)
    max_len = max((len(s.get("wpm_history") or []) for s in sessions), default=0)
    blended: list[float | None] = []
    for i in range(min(max_len, 60)):
        vals = []
        for s in sessions:
            h = s.get("wpm_history") or []
            if i < len(h):
                try:
                    vals.append(float(h[i]))
                except (TypeError, ValueError):
                    continue
        blended.append(round(statistics.mean(vals), 2) if vals else None)

    return {
        "session_count": len(sessions),
        "avg_final_wpm": avg,
        "median_final_wpm": p50,
        "team_a_sessions": len(team_a),
        "team_b_sessions": len(team_b),
        "team_a_avg_wpm": round(
            statistics.mean([float(s.get("final_wpm") or 0) for s in team_a]) or 0, 2
        )
        if team_a
        else 0.0,
        "team_b_avg_wpm": round(
            statistics.mean([float(s.get("final_wpm") or 0) for s in team_b]) or 0, 2
        )
        if team_b
        else 0.0,
        "wpm_history_blended": blended,
        "recent_peak_wpm": round(max(wpms), 2) if wpms else 0.0,
    }


@router.get("/training/sessions")
async def training_sessions(admin: AdminUser, limit: int = 50) -> list[dict[str, Any]]:
    _ = admin
    return await admin_state.list_sessions(min(limit, 100))


@router.post("/training/sessions")
async def training_sessions_ingest(
    admin: AdminUser,
    body: TrainingSessionIngest,
) -> dict[str, Any]:
    payload = body.model_dump()
    payload["user_label"] = payload.get("user_label") or admin.get("email")
    row = await admin_state.ingest_training_session(payload)
    return row


@router.get("/events")
async def events_list(admin: AdminUser, limit: int = 100) -> list[dict[str, Any]]:
    _ = admin
    return await admin_state.list_events(min(limit, 200))


@router.post("/events")
async def events_create(admin: AdminUser, body: EventCreateBody) -> dict[str, Any]:
    return await admin_state.add_event(
        event_type=body.type,
        actor=str(admin.get("email")),
        meta=body.meta,
    )


def _managed_event_response(row: dict[str, Any], request: Request) -> dict[str, Any]:
    settings = request.app.state.settings
    public_base = settings.app_public_url.rstrip("/")
    return {
        **row,
        "join_url": f"{public_base}/?event={row['join_code']}",
        "room_url": f"{public_base}/?room={row['room_id']}",
        "qr_url": f"/api/v1/admin/managed-events/{row['id']}/qr.png",
    }


@router.get("/managed-events")
async def managed_events_list(
    admin: AdminUser, request: Request, limit: int = 100
) -> list[dict[str, Any]]:
    rows = await me.list_managed_events(str(admin["company"]), limit=min(limit, 200))
    return [_managed_event_response(r, request) for r in rows]


@router.post("/managed-events")
async def managed_events_create(
    admin: AdminUser, body: ManagedEventCreateBody, request: Request
) -> dict[str, Any]:
    try:
        row = await me.create_managed_event(
            company_slug=str(admin["company"]),
            actor=str(admin["email"]),
            name=body.name,
            description=body.description,
            room_id=body.room_id,
            join_code=body.join_code,
            status=body.status,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            timezone=body.timezone,
            max_players=body.max_players,
            text_line_count=body.text_line_count,
            relay_mode=body.relay_mode,
            theme_primary=body.theme_primary,
            public_wall=body.public_wall,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _managed_event_response(row, request)


@router.get("/managed-events/{event_id}")
async def managed_events_get(
    admin: AdminUser, event_id: str, request: Request
) -> dict[str, Any]:
    row = await me.get_managed_event(event_id, str(admin["company"]))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event_not_found")
    return _managed_event_response(row, request)


@router.patch("/managed-events/{event_id}/status")
async def managed_events_status(
    admin: AdminUser, event_id: str, body: ManagedEventStatusBody, request: Request
) -> dict[str, Any]:
    row = await me.update_managed_event_status(
        event_id,
        str(admin["company"]),
        status=body.status,
        actor=str(admin["email"]),
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event_not_found")
    return _managed_event_response(row, request)


@router.get("/managed-events/{event_id}/qr.png")
async def managed_events_qr(admin: AdminUser, event_id: str, request: Request) -> Response:
    row = await me.get_managed_event(event_id, str(admin["company"]))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event_not_found")
    settings = request.app.state.settings
    join_url = f"{settings.app_public_url.rstrip('/')}/?event={row['join_code']}"
    img = qrcode.make(join_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
