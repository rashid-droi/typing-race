from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "typing-race-api"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )

    # Scale-out: optional Redis for leaderboard pub/sub (no subscribe in-process yet).
    redis_url: str | None = None

    # Leaderboard WebSocket tick rate (Hz), clamped to 5–10 for bandwidth/CPU.
    broadcast_hz: float = 8.0

    # Each in-memory shard holds at most this many concurrent players.
    max_players_per_shard: int = 150

    # Advertised in routing snapshot for gateway / LB configuration.
    instance_id: str = "local-1"

    idle_seconds: float = 45.0
    server_ping_interval_s: float = 10.0

    # SQLite path for admin analytics + managed events (relative to backend/ cwd).
    database_path: str = "data/typing-race.db"

    # Public player UI base URL (join links, QR codes). No trailing slash.
    app_public_url: str = "http://localhost:5173"

    # Company admin (demo defaults — override in production).
    admin_company_slug: str = "acme"
    admin_email: str = "admin@typingrace.local"
    admin_password: str = "changeme"

    @field_validator("broadcast_hz")
    @classmethod
    def clamp_broadcast_hz(cls, v: float) -> float:
        return max(5.0, min(10.0, float(v)))

    @field_validator("max_players_per_shard")
    @classmethod
    def clamp_shard_size(cls, v: int) -> int:
        return max(50, min(200, int(v)))

    @property
    def broadcast_interval_s(self) -> float:
        return 1.0 / self.broadcast_hz

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
