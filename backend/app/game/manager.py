from __future__ import annotations

import asyncio
import dataclasses
import json
import uuid

from app.core.redis_bus import RedisBus
from app.game.room import Room
from app.game.typing_engine import (
    DEFAULT_TEXT_LINE_COUNT,
    build_race_paragraph,
    normalize_text_line_count,
)


@dataclasses.dataclass
class _LogicalRoomConfig:
    relay_mode: bool
    host_player_id: str | None = None
    started: bool = False
    paused: bool = False
    finished: bool = False
    race_round: int = 0
    restart_in_progress: bool = False
    text_line_count: int = DEFAULT_TEXT_LINE_COUNT


class RoomManager:
    """In-memory rooms: one *logical* URL room_id maps to many shard instances."""

    def __init__(
        self,
        *,
        redis_bus: RedisBus,
        broadcast_interval_s: float,
        max_players_per_shard: int,
        instance_id: str,
        idle_seconds: float = 45.0,
        server_ping_interval_s: float = 10.0,
    ) -> None:
        self.redis_bus = redis_bus
        self.broadcast_interval_s = broadcast_interval_s
        self.max_players_per_shard = max_players_per_shard
        self.instance_id = instance_id
        self.idle_seconds = idle_seconds
        self.server_ping_interval_s = server_ping_interval_s
        self._rooms_lock = asyncio.Lock()
        self._rooms: dict[str, Room] = {}
        self._rooms_by_logical: dict[str, list[str]] = {}
        self._logical_lock = asyncio.Lock()
        self._logical_config: dict[str, _LogicalRoomConfig] = {}

    def new_player_id(self) -> str:
        return str(uuid.uuid4())

    async def relay_mode_for(self, logical_room_id: str, relay: bool | None) -> bool:
        """First join to a logical room locks relay mode for all shards of that room."""
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None:
                rm = bool(relay) if relay is not None else False
                self._logical_config[logical_room_id] = _LogicalRoomConfig(
                    relay_mode=rm,
                    text_line_count=DEFAULT_TEXT_LINE_COUNT,
                )
                return rm
            return c.relay_mode

    async def player_room_flags(
        self, logical_room_id: str, player_id: str, wants_host: bool | None
    ) -> tuple[bool, bool, bool, bool]:
        """Return (is_host, race_started, paused, finished)."""
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None:
                return False, False, False, False
            if wants_host and c.host_player_id is None:
                c.host_player_id = player_id
            is_host = c.host_player_id == player_id
            return is_host, c.started, c.paused, c.finished

    async def start_logical_race(self, logical_room_id: str, player_id: str) -> bool:
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None or c.started or c.host_player_id != player_id:
                return False
            c.started = True
            c.paused = False
        rooms: list[Room] = []
        async with self._rooms_lock:
            for sk in self._rooms_by_logical.get(logical_room_id, []):
                room = self._rooms.get(sk)
                if room is not None:
                    rooms.append(room)
        for room in rooms:
            await room.notify_race_started()
        return True

    async def typing_blocked(self, logical_room_id: str) -> bool:
        """True when keys / relay_pass should be ignored (not started, paused, or finished)."""
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None:
                return True
            if not c.started or c.finished or c.paused:
                return True
            return False

    async def logical_play_flags(self, logical_room_id: str) -> tuple[bool, bool]:
        """Return (paused, finished) for the logical room."""
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None:
                return False, False
            return c.paused, c.finished

    async def pause_logical_game(self, logical_room_id: str, player_id: str) -> bool:
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None or c.host_player_id != player_id or c.finished:
                return False
            if c.paused:
                return True
            c.paused = True
        return True

    async def resume_logical_game(self, logical_room_id: str, player_id: str) -> bool:
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None or c.host_player_id != player_id or c.finished:
                return False
            if not c.paused:
                return True
            c.paused = False
        return True

    async def finish_logical_game(self, logical_room_id: str, player_id: str) -> bool:
        """Idempotent: first successful call wins; duplicates return False."""
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None or c.host_player_id != player_id or not c.started:
                return False
            if c.finished:
                return False
            if c.restart_in_progress:
                return False
            c.finished = True
            c.paused = False
        return True

    async def begin_race_restart(self, logical_room_id: str, player_id: str) -> bool:
        """Same-room rematch: reset shards, broadcast restart + countdown, then race_started."""
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None or c.host_player_id != player_id:
                return False
            if c.restart_in_progress:
                return False
            c.restart_in_progress = True
            c.finished = False
            c.paused = False
            c.started = False
            c.race_round += 1
            c.text_line_count = normalize_text_line_count(c.text_line_count)
            rr = c.race_round
            lc = c.text_line_count
        text = build_race_paragraph(logical_room_id, race_round=rr, line_count=lc)
        rooms = await self.rooms_for_logical(logical_room_id)
        if not rooms:
            async with self._logical_lock:
                if c2 := self._logical_config.get(logical_room_id):
                    c2.restart_in_progress = False
            return False
        try:
            for r in rooms:
                await r.reset_race_session(text)
        except Exception:
            async with self._logical_lock:
                if c3 := self._logical_config.get(logical_room_id):
                    c3.restart_in_progress = False
            return False
        await self.broadcast_to_logical(
            logical_room_id,
            json.dumps({"type": "game_restart", "payload": {"text": text}}),
        )
        asyncio.create_task(
            self._restart_countdown_then_go(logical_room_id),
            name=f"restart-{logical_room_id}",
        )
        return True

    async def _restart_countdown_then_go(self, logical_room_id: str) -> None:
        try:
            for n in (3, 2, 1):
                await self.broadcast_to_logical(
                    logical_room_id,
                    json.dumps({"type": "game_restart_countdown", "payload": {"n": n}}),
                )
                await asyncio.sleep(1.0)
            await self.broadcast_to_logical(
                logical_room_id,
                json.dumps({"type": "game_restart_countdown", "payload": {"go": True}}),
            )
            await asyncio.sleep(0.45)
            async with self._logical_lock:
                c = self._logical_config.get(logical_room_id)
                if c is not None:
                    c.started = True
            rooms = await self.rooms_for_logical(logical_room_id)
            for room in rooms:
                await room.notify_race_started()
        finally:
            async with self._logical_lock:
                c = self._logical_config.get(logical_room_id)
                if c is not None:
                    c.restart_in_progress = False

    async def transfer_host_if_leaving(self, logical_room_id: str, leaving_player_id: str) -> None:
        """If the leaving player was host, assign another connected player or clear host."""
        new_host: str | None = None
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None or c.host_player_id != leaving_player_id:
                return
            c.host_player_id = None

        async with self._rooms_lock:
            for sk in self._rooms_by_logical.get(logical_room_id, []):
                room = self._rooms.get(sk)
                if room is None:
                    continue
                ids = await room.list_player_ids()
                for pid in ids:
                    if pid != leaving_player_id:
                        new_host = pid
                        break
                if new_host is not None:
                    break

        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is not None and new_host is not None:
                c.host_player_id = new_host

        await self.broadcast_host_state(logical_room_id)

    async def broadcast_to_logical(self, logical_room_id: str, message: str) -> None:
        rooms = await self.rooms_for_logical(logical_room_id)
        for room in rooms:
            await room.send_raw_to_all(message)

    async def broadcast_host_state(self, logical_room_id: str) -> None:
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            host_id = c.host_player_id if c else None
        msg = json.dumps(
            {"type": "game_state_update", "payload": {"host_player_id": host_id}}
        )
        await self.broadcast_to_logical(logical_room_id, msg)

    async def logical_text_line_count(self, logical_room_id: str) -> int:
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None:
                return DEFAULT_TEXT_LINE_COUNT
            n = normalize_text_line_count(c.text_line_count)
            if c.text_line_count != n:
                c.text_line_count = n
            return n

    async def canonical_paragraph_for_shard(self, room: Room) -> str:
        """Paragraph for this shard: matches siblings mid-race, or built from lobby settings."""
        logical_room_id = room.logical_room_id
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            started = bool(c and c.started)
            finished = bool(c and c.finished)
            rr = c.race_round if c else 0
            lc = (
                normalize_text_line_count(c.text_line_count)
                if c
                else DEFAULT_TEXT_LINE_COUNT
            )
        if started and not finished:
            rooms = await self.rooms_for_logical(logical_room_id)
            for r in rooms:
                if r is not room and len(r.paragraph) > 0:
                    return r.paragraph
        return build_race_paragraph(logical_room_id, race_round=rr, line_count=lc)

    async def resync_room_paragraph_after_join(self, room: Room) -> None:
        text = await self.canonical_paragraph_for_shard(room)
        await room.set_shared_paragraph(text)

    async def apply_host_text_line_count(
        self, logical_room_id: str, player_id: str, raw_line_count: object
    ) -> tuple[bool, int, str]:
        """Lobby-only host setting. Returns (ok, normalized_count, new_paragraph or \"\" if unchanged)."""
        try:
            raw_int = int(raw_line_count)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            raw_int = DEFAULT_TEXT_LINE_COUNT
        async with self._logical_lock:
            c = self._logical_config.get(logical_room_id)
            if c is None:
                return False, DEFAULT_TEXT_LINE_COUNT, ""
            if c.host_player_id != player_id:
                return False, c.text_line_count, ""
            if c.restart_in_progress:
                return False, c.text_line_count, ""
            if c.started and not c.finished:
                return False, c.text_line_count, ""
            c.text_line_count = normalize_text_line_count(c.text_line_count)
            n = normalize_text_line_count(raw_int)
            if n == c.text_line_count:
                return True, n, ""
            c.text_line_count = n
            rr = c.race_round
        text = build_race_paragraph(logical_room_id, race_round=rr, line_count=n)
        return True, n, text

    async def push_paragraph_to_all_shards(
        self, logical_room_id: str, text: str
    ) -> None:
        for r in await self.rooms_for_logical(logical_room_id):
            await r.set_shared_paragraph(text)

    async def rooms_for_logical(self, logical_room_id: str) -> list[Room]:
        async with self._rooms_lock:
            out: list[Room] = []
            for sk in self._rooms_by_logical.get(logical_room_id, []):
                r = self._rooms.get(sk)
                if r is not None:
                    out.append(r)
            return out

    async def assign_room(self, logical_room_id: str) -> Room:
        """Pick a shard with capacity or create a new shard for this logical room."""
        async with self._rooms_lock:
            keys = list(self._rooms_by_logical.get(logical_room_id, []))
            for sk in keys:
                room = self._rooms.get(sk)
                if room is None:
                    continue
                if await room.occupancy() < self.max_players_per_shard:
                    return room
            shard_idx = len(keys)
            storage_key = f"{logical_room_id}#{shard_idx}"
            room = Room(
                storage_key=storage_key,
                logical_room_id=logical_room_id,
                shard_index=shard_idx,
                manager=self,
            )
            self._rooms[storage_key] = room
            self._rooms_by_logical.setdefault(logical_room_id, []).append(storage_key)
            return room

    async def maybe_drop_room(self, storage_key: str) -> None:
        logical_id: str | None = None
        drop_logical_config = False
        async with self._rooms_lock:
            room = self._rooms.get(storage_key)
            if room is None:
                return
            if not await room.is_empty():
                return
            logical_id = room.logical_room_id
            self._rooms.pop(storage_key, None)
            lst = self._rooms_by_logical.get(logical_id)
            if lst and storage_key in lst:
                lst.remove(storage_key)
            if lst is not None and len(lst) == 0:
                self._rooms_by_logical.pop(logical_id, None)
                drop_logical_config = True
        if drop_logical_config and logical_id is not None:
            async with self._logical_lock:
                self._logical_config.pop(logical_id, None)

    def routing_snapshot(self) -> dict:
        """For load balancers / orchestrators: shard occupancy on this instance."""
        shards: list[dict] = []
        for sk, room in self._rooms.items():
            shards.append(
                {
                    "storage_key": sk,
                    "logical_room_id": room.logical_room_id,
                    "shard_index": room.shard_index,
                    "players": room.occupancy_sync(),
                }
            )
        return {
            "instance_id": self.instance_id,
            "max_players_per_shard": self.max_players_per_shard,
            "broadcast_interval_s": self.broadcast_interval_s,
            "broadcast_hz": 1.0 / self.broadcast_interval_s,
            "shards": shards,
        }
