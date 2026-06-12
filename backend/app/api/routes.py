from datetime import UTC, datetime

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
async def api_health() -> dict[str, str]:
    """Same payload as `GET /health` on the app, but under `/api/v1` for proxies that only route `/api/*`."""
    return {"status": "ok", "service": "typing-race-api"}


@router.get("/hello")
async def hello() -> dict[str, str]:
    return {"message": "hello", "service": "typing-race-api"}


@router.get("/time")
async def server_time() -> dict[str, str]:
    return {"utc": datetime.now(UTC).isoformat()}


@router.get("/routing/snapshot")
async def routing_snapshot(request: Request) -> dict:
    """Shard occupancy on this process (for gateways / load balancers)."""
    return request.app.state.room_manager.routing_snapshot()
