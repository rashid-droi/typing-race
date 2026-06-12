from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin.router import router as admin_router
from app.api.public import router as public_router
from app.api.routes import router as api_router
from app.core.config import get_settings
from app.db import close_db, init_db
from app.core.redis_bus import RedisBus
from app.game.manager import RoomManager
from app.game.ws_room import router as room_ws_router
from app.ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings
    await init_db(settings.database_path)
    redis_client = None
    if settings.redis_url:
        import redis.asyncio as redis_async

        redis_client = redis_async.from_url(settings.redis_url, decode_responses=True)
    app.state.redis_bus = RedisBus(redis_client)
    app.state.room_manager = RoomManager(
        redis_bus=app.state.redis_bus,
        broadcast_interval_s=settings.broadcast_interval_s,
        max_players_per_shard=settings.max_players_per_shard,
        instance_id=settings.instance_id,
        idle_seconds=settings.idle_seconds,
        server_ping_interval_s=settings.server_ping_interval_s,
    )
    yield
    if redis_client is not None:
        await redis_client.aclose()
    await close_db()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        debug=settings.debug,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        # LAN / alternate hosts (e.g. http://192.168.1.5:5173) for direct fetch + WS to 127.0.0.1:8000 in dev
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d{1,5})?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/", tags=["health"])
    async def root() -> dict[str, str]:
        """Avoid a bare 404 JSON `{"detail":"Not Found"}` when someone opens the API host in a browser."""
        return {
            "service": settings.app_name,
            "health": "/health and /api/v1/health",
            "openapi": "/docs",
            "player_ui": "Run `cd frontend && npm run dev` then open http://localhost:5173",
            "websocket_game": "/ws/{room_id} (use the Vue app; Vite proxies /ws to this API in dev)",
        }

    application.include_router(api_router, prefix="/api/v1", tags=["api"])
    application.include_router(public_router, prefix="/api/v1", tags=["public"])
    application.include_router(admin_router, prefix="/api/v1", tags=["admin"])
    application.include_router(ws_router, tags=["websocket"])
    application.include_router(room_ws_router, tags=["multiplayer"])
    return application


app = create_app()
