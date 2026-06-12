"""Redis pub/sub for shard leaderboard fan-out (observers, future edge workers)."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class RedisBus:
    def __init__(self, client: Any) -> None:
        self._client = client

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def leaderboard_channel(self, logical_room_id: str, shard_index: int) -> str:
        return f"typingrace:lb:{logical_room_id}:{shard_index}"

    async def publish_shard_leaderboard(
        self, *, logical_room_id: str, shard_index: int, body: str
    ) -> None:
        if self._client is None:
            return
        try:
            ch = self.leaderboard_channel(logical_room_id, shard_index)
            await self._client.publish(ch, body)
        except Exception:
            logger.exception(
                "redis publish failed logical=%s shard=%s",
                logical_room_id,
                shard_index,
            )

    # Future: subscribe loop for cross-instance aggregation / replay hooks.
