from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from typing import TYPE_CHECKING, Any

from fastapi import WebSocket

from app.game.models import JoinPayload, Player
from app.game.team_metrics import (
    communication_efficiency_score,
    consistency_score,
    team_average_progress,
    teamwork_score,
)
from app.game.typing_engine import (
    TypingRuntimeState,
    apply_keystroke,
    compute_stats,
    pick_paragraph,
)

if TYPE_CHECKING:
    from app.game.manager import RoomManager

logger = logging.getLogger(__name__)


def _ranked_players(players: dict[str, Player]) -> list[Player]:
    ordered = sorted(
        players.values(),
        key=lambda p: (-p.progress, -p.wpm, -p.typed_chars, p.id),
    )
    return [p.model_copy(update={"rank": i}) for i, p in enumerate(ordered, start=1)]


class Room:
    def __init__(
        self,
        storage_key: str,
        logical_room_id: str,
        shard_index: int,
        manager: RoomManager,
    ) -> None:
        self.storage_key = storage_key
        self.logical_room_id = logical_room_id
        self.shard_index = shard_index
        self._manager = manager
        self._lock = asyncio.Lock()
        self._paragraph: str = pick_paragraph(logical_room_id, race_round=0)
        self._players: dict[str, Player] = {}
        self._typing_states: dict[str, TypingRuntimeState] = {}
        self._connections: dict[str, WebSocket] = {}
        self._broadcast_task: asyncio.Task[None] | None = None
        self._relay_mode = False
        self._team_orders: dict[int, list[str]] = {0: [], 1: []}
        self._relay_cursor: dict[int, int] = {0: 0, 1: 0}
        self._relay_passes: dict[int, int] = {0: 0, 1: 0}
        self._meta_dirty = True
        self._started = False

    @property
    def paragraph(self) -> str:
        return self._paragraph

    @property
    def relay_mode(self) -> bool:
        return self._relay_mode

    @property
    def started(self) -> bool:
        return self._started

    async def notify_race_started(self) -> None:
        async with self._lock:
            self._started = True
        await self._send_to_all(json.dumps({"type": "race_started"}))

    async def is_empty(self) -> bool:
        async with self._lock:
            return len(self._connections) == 0

    async def occupancy(self) -> int:
        async with self._lock:
            return len(self._players)

    def occupancy_sync(self) -> int:
        return len(self._players)

    def _ensure_broadcast(self) -> None:
        if self._broadcast_task is not None and not self._broadcast_task.done():
            return
        self._broadcast_task = asyncio.create_task(
            self._broadcast_loop(), name=f"room-broadcast-{self.storage_key}"
        )

    def _pick_team(self, preferred: int | None) -> int:
        if preferred in (0, 1):
            return preferred
        n0 = len(self._team_orders[0])
        n1 = len(self._team_orders[1])
        return 0 if n0 <= n1 else 1

    def _active_relay_player(self, team_id: int) -> str | None:
        order = self._team_orders.get(team_id, [])
        if not order:
            return None
        idx = self._relay_cursor.get(team_id, 0) % len(order)
        return order[idx]

    def _advance_relay(self, team_id: int) -> None:
        order = self._team_orders.get(team_id, [])
        if not order:
            return
        cur = self._relay_cursor.get(team_id, 0) + 1
        self._relay_cursor[team_id] = cur % len(order)

    def _all_players_with_stats(self, now_mono: float) -> dict[str, Player]:
        plen = len(self._paragraph)
        out: dict[str, Player] = {}
        for pid, p in self._players.items():
            st = self._typing_states.get(pid)
            if st is None:
                continue
            wpm, acc, prog = compute_stats(st, plen, now_mono)
            out[pid] = p.model_copy(
                update={
                    "wpm": wpm,
                    "accuracy": acc,
                    "progress": prog,
                    "typed_chars": st.typed_index,
                    "keystrokes": st.keystrokes,
                    "errors": st.errors,
                }
            )
        return out

    def _decorate_teams_and_relay(self, merged: dict[str, Player]) -> list[Player]:
        by_team: dict[int, list[Player]] = {0: [], 1: []}
        for p in list(merged.values()):
            tid = p.team_id if p.team_id in (0, 1) else 0
            by_team[tid].append(p)
        for tid in (0, 1):
            by_team[tid].sort(
                key=lambda x: (-x.progress, -x.wpm, -x.typed_chars, x.id),
            )
            for i, pl in enumerate(by_team[tid], start=1):
                active = False
                if self._relay_mode:
                    ap = self._active_relay_player(tid)
                    active = ap == pl.id
                merged[pl.id] = pl.model_copy(update={"team_rank": i, "relay_active": active})
        ranked = _ranked_players(merged)
        return ranked

    def _team_payloads(self, merged: dict[str, Player]) -> tuple[list[dict], list[dict]]:
        teams_out: list[dict] = []
        for tid in (0, 1):
            members = [p for p in merged.values() if p.team_id == tid]
            if not members:
                teams_out.append(
                    {
                        "id": tid,
                        "name": "Team A" if tid == 0 else "Team B",
                        "score": 0.0,
                        "member_count": 0,
                        "teamwork_score": 0.0,
                        "consistency_score": 0.0,
                        "communication_efficiency_score": 0.0,
                    }
                )
                continue
            progresses = [p.progress for p in members]
            accs = [p.accuracy for p in members]
            kss = [p.keystrokes for p in members]
            ers = [p.errors for p in members]
            score = team_average_progress(progresses)
            tw = teamwork_score(progresses)
            cs = consistency_score(accs)
            ce = communication_efficiency_score(
                kss, ers, self._relay_passes.get(tid, 0), len(members)
            )
            teams_out.append(
                {
                    "id": tid,
                    "name": "Team A" if tid == 0 else "Team B",
                    "score": round(score, 4),
                    "member_count": len(members),
                    "teamwork_score": round(tw, 1),
                    "consistency_score": round(cs, 1),
                    "communication_efficiency_score": round(ce, 1),
                }
            )
        team_rankings = sorted(
            [dict(t) for t in teams_out],
            key=lambda x: (-x["score"], x["id"]),
        )
        for i, row in enumerate(team_rankings, start=1):
            row["rank"] = i
        return teams_out, team_rankings

    def _relay_state_payload(self) -> dict:
        active: dict[str, str | None] = {}
        for tid in (0, 1):
            pid = self._active_relay_player(tid) if self._relay_mode else None
            active[str(tid)] = pid
        return {"enabled": self._relay_mode, "active_player_by_team": active}

    def _build_room_meta_message(self, now_mono: float) -> str:
        merged = self._all_players_with_stats(now_mono)
        self._decorate_teams_and_relay(merged)
        teams_out, team_rankings = self._team_payloads(merged)
        return json.dumps(
            {
                "type": "room_meta",
                "teams": teams_out,
                "team_rankings": team_rankings,
                "relay": self._relay_state_payload(),
            }
        )

    def _build_lite_bundle_locked(self, now_mono: float) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]] | None:
        if not self._connections:
            return None
        merged = self._all_players_with_stats(now_mono)
        ranked = self._decorate_teams_and_relay(merged)
        p_lite: list[dict[str, Any]] = [
            {
                "i": x.id,
                "r": x.rank,
                "p": round(x.progress, 4),
                "w": round(x.wpm, 1),
            }
            for x in ranked
        ]
        y_map: dict[str, dict[str, Any]] = {}
        for x in ranked:
            y_map[x.id] = {
                "a": round(x.accuracy, 4),
                "e": x.errors,
                "tc": x.typed_chars,
                "t": x.team_id,
                "tr": x.team_rank,
                "ra": x.relay_active,
            }
        return p_lite, y_map

    async def _deliver_leaderboard_lite(
        self, p_lite: list[dict[str, Any]], y_map: dict[str, dict[str, Any]], ts: float
    ) -> None:
        bus = self._manager.redis_bus
        if bus.enabled:
            redis_body = json.dumps(
                {
                    "logical": self.logical_room_id,
                    "shard": self.shard_index,
                    "t": ts,
                    "p": p_lite,
                }
            )
            await bus.publish_shard_leaderboard(
                logical_room_id=self.logical_room_id,
                shard_index=self.shard_index,
                body=redis_body,
            )

        async with self._lock:
            pairs = list(self._connections.items())
        paused, finished = await self._manager.logical_play_flags(self.logical_room_id)
        base = {
            "type": "leaderboard",
            "t": ts,
            "p": p_lite,
            "paused": paused,
            "finished": finished,
        }
        dead: list[str] = []
        for pid, ws in pairs:
            y = y_map.get(pid)
            if y is None:
                continue
            try:
                await ws.send_text(json.dumps({**base, "y": y}))
            except Exception:
                dead.append(pid)
        for pid in dead:
            await self.remove_player(pid, reason="send_failed")

    async def _flush_leaderboard_and_meta(self) -> None:
        now_mono = time.monotonic()
        meta_msg: str | None = None
        bundle: tuple[list[dict[str, Any]], dict[str, dict[str, Any]]] | None = None
        async with self._lock:
            if not self._connections:
                return
            bundle = self._build_lite_bundle_locked(now_mono)
            if bundle is None:
                return
            if self._meta_dirty:
                self._meta_dirty = False
                meta_msg = self._build_room_meta_message(now_mono)
        p_lite, y_map = bundle
        await self._deliver_leaderboard_lite(p_lite, y_map, now_mono)
        if meta_msg:
            await self._send_to_all(meta_msg)

    async def _broadcast_loop(self) -> None:
        interval = self._manager.broadcast_interval_s
        try:
            while True:
                await asyncio.sleep(interval)
                async with self._lock:
                    if not self._connections:
                        break
                await self._flush_leaderboard_and_meta()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("room %s broadcast loop error", self.storage_key)
        finally:
            self._broadcast_task = None
            await self._manager.maybe_drop_room(self.storage_key)

    async def _send_to_all(self, message: str) -> None:
        async with self._lock:
            pairs = list(self._connections.items())
        dead: list[str] = []
        for pid, ws in pairs:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(pid)
        for pid in dead:
            await self.remove_player(pid, reason="send_failed")

    async def _send_to_others(self, exclude_player_id: str, message: str) -> None:
        async with self._lock:
            pairs = [(p, w) for p, w in self._connections.items() if p != exclude_player_id]
        dead: list[str] = []
        for pid, ws in pairs:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(pid)
        for pid in dead:
            await self.remove_player(pid, reason="send_failed")

    def peers_snapshot_locked(self, exclude_player_id: str) -> list[dict[str, Any]]:
        return [
            {"id": p.id, "name": p.name, "team_id": p.team_id}
            for pid, p in self._players.items()
            if pid != exclude_player_id
        ]

    async def peers_snapshot(self, exclude_player_id: str) -> list[dict[str, Any]]:
        async with self._lock:
            return self.peers_snapshot_locked(exclude_player_id)

    async def list_player_ids(self) -> list[str]:
        async with self._lock:
            return list(self._players.keys())

    async def send_raw_to_all(self, message: str) -> None:
        await self._send_to_all(message)

    async def broadcast_race_finished_snapshot(self) -> None:
        """Full standings for this shard; clients use for results screen."""
        now_mono = time.monotonic()
        async with self._lock:
            if not self._connections:
                return
            merged = self._all_players_with_stats(now_mono)
            ranked = self._decorate_teams_and_relay(merged)
            teams_out, team_rankings = self._team_payloads(merged)
            players_json = [p.model_dump(mode="json") for p in ranked]
        payload = {
            "type": "race_finished",
            "payload": {
                "players": players_json,
                "teams": teams_out,
                "team_rankings": team_rankings,
            },
        }
        await self._send_to_all(json.dumps(payload))

    async def set_shared_paragraph(self, text: str) -> None:
        """Replace race text on all clients in this shard (lobby or host settings sync)."""
        async with self._lock:
            self._paragraph = text
            self._meta_dirty = True
        await self.push_leaderboard_snapshot()

    async def reset_race_session(self, new_paragraph: str) -> None:
        """New race in same room: new text, zero stats, relay cursors reset; connections unchanged."""
        async with self._lock:
            self._paragraph = new_paragraph
            self._started = False
            self._relay_cursor = {0: 0, 1: 0}
            self._relay_passes = {0: 0, 1: 0}
            for pid in list(self._players.keys()):
                p = self._players[pid]
                self._typing_states[pid] = TypingRuntimeState()
                self._players[pid] = Player(id=pid, name=p.name, team_id=p.team_id)
            self._meta_dirty = True
        await self.push_leaderboard_snapshot()

    async def join(self, websocket: WebSocket, payload: JoinPayload) -> Player:
        relay_mode = await self._manager.relay_mode_for(self.logical_room_id, payload.relay)
        player_id = self._manager.new_player_id()
        async with self._lock:
            self._relay_mode = relay_mode
            team_id = self._pick_team(payload.team_id)
            player = Player(id=player_id, name=payload.name, team_id=team_id)
            self._players[player_id] = player
            self._typing_states[player_id] = TypingRuntimeState()
            self._connections[player_id] = websocket
            self._team_orders[team_id].append(player_id)
            self._meta_dirty = True
            self._ensure_broadcast()
        await self._send_to_others(
            player_id,
            json.dumps(
                {
                    "type": "player_joined",
                    "payload": {
                        "player": {
                            "id": player.id,
                            "name": player.name,
                            "team_id": player.team_id,
                        }
                    },
                }
            ),
        )
        return player

    async def push_leaderboard_snapshot(self) -> None:
        async with self._lock:
            if not self._connections:
                return
            self._meta_dirty = True
        await self._flush_leaderboard_and_meta()

    async def apply_key(self, player_id: str, char: str | None, backspace: bool) -> None:
        if await self._manager.typing_blocked(self.logical_room_id):
            return
        async with self._lock:
            st = self._typing_states.get(player_id)
            if st is None:
                return
            p = self._players.get(player_id)
            if p is None:
                return
            if self._relay_mode:
                ap = self._active_relay_player(p.team_id)
                if ap != player_id:
                    return
            apply_keystroke(
                st,
                self._paragraph,
                char=char,
                backspace=backspace,
                now_mono=time.monotonic(),
            )
            if self._relay_mode:
                _, _, prog = compute_stats(st, len(self._paragraph), time.monotonic())
                if prog >= 0.999:
                    self._advance_relay(p.team_id)

    async def relay_pass(self, player_id: str) -> bool:
        if await self._manager.typing_blocked(self.logical_room_id):
            return False
        async with self._lock:
            p = self._players.get(player_id)
            if p is None or not self._relay_mode:
                return False
            ap = self._active_relay_player(p.team_id)
            if ap != player_id:
                return False
            self._relay_passes[p.team_id] = self._relay_passes.get(p.team_id, 0) + 1
            self._advance_relay(p.team_id)
            self._meta_dirty = True
            return True

    async def remove_player(self, player_id: str, *, reason: str) -> None:
        async with self._lock:
            present = player_id in self._players or player_id in self._connections
        if not present:
            return
        await self._manager.transfer_host_if_leaving(self.logical_room_id, player_id)
        async with self._lock:
            if player_id not in self._players and player_id not in self._connections:
                return
            p = self._players.get(player_id)
            team_id = p.team_id if p else 0
            order = self._team_orders.get(team_id, [])
            if player_id in order:
                idx = order.index(player_id)
                order.remove(player_id)
                cur = self._relay_cursor.get(team_id, 0)
                if order:
                    if idx < cur:
                        self._relay_cursor[team_id] = max(0, cur - 1)
                    elif idx == cur:
                        self._relay_cursor[team_id] = cur % len(order)
                else:
                    self._relay_cursor[team_id] = 0
            self._players.pop(player_id, None)
            self._typing_states.pop(player_id, None)
            self._connections.pop(player_id, None)
            remaining = len(self._connections)
            self._meta_dirty = True
        if remaining == 0:
            if self._broadcast_task and not self._broadcast_task.done():
                self._broadcast_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self._broadcast_task
            await self._manager.maybe_drop_room(self.storage_key)
            return
        msg = json.dumps(
            {
                "type": "player_left",
                "payload": {"player_id": player_id, "reason": reason},
            }
        )
        await self._send_to_all(msg)
