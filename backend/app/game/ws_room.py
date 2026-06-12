from __future__ import annotations

import asyncio
import contextlib
import json
import re
import time
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.game.manager import RoomManager
from app.game.models import ClientMessage

router = APIRouter()

_ROOM_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _validate_room_id(room_id: str) -> None:
    if not _ROOM_ID_RE.match(room_id):
        raise ValueError("invalid room_id")


@router.websocket("/ws/{room_id}")
async def room_websocket(websocket: WebSocket, room_id: str) -> None:
    try:
        _validate_room_id(room_id)
    except ValueError:
        await websocket.close(code=4400)
        return

    manager: RoomManager = websocket.app.state.room_manager
    room = await manager.assign_room(room_id)
    player_id: str | None = None
    last_activity = time.monotonic()

    def touch() -> None:
        nonlocal last_activity
        last_activity = time.monotonic()

    removed = False

    async def remove_once(pid: str, reason: str) -> None:
        nonlocal removed
        if removed:
            return
        await room.remove_player(pid, reason=reason)
        removed = True

    idle_seconds = manager.idle_seconds
    ping_interval = manager.server_ping_interval_s

    async def idle_guard() -> None:
        try:
            while True:
                await asyncio.sleep(2.0)
                if time.monotonic() - last_activity > idle_seconds:
                    with contextlib.suppress(Exception):
                        await websocket.close(code=4408)
                    if player_id:
                        await remove_once(player_id, reason="idle_timeout")
                    return
        except asyncio.CancelledError:
            return

    async def server_pings() -> None:
        try:
            while True:
                await asyncio.sleep(ping_interval)
                payload = json.dumps(
                    {
                        "type": "ping",
                        "payload": {"ts": datetime.now(UTC).isoformat()},
                    }
                )
                await websocket.send_text(payload)
        except asyncio.CancelledError:
            return
        except Exception:
            if player_id:
                await remove_once(player_id, reason="ping_send_failed")

    await websocket.accept()

    idle_task: asyncio.Task[None] | None = None
    ping_task: asyncio.Task[None] | None = None

    try:
        while player_id is None:
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                return
            touch()
            try:
                msg = ClientMessage.model_validate_json(raw)
            except Exception:
                await websocket.send_text(
                    json.dumps(
                        {"type": "error", "payload": {"detail": "invalid_message"}}
                    )
                )
                continue
            if msg.type != "join":
                await websocket.send_text(
                    json.dumps(
                        {"type": "error", "payload": {"detail": "join_first"}}
                    )
                )
                continue
            try:
                jp = msg.join_payload()
            except Exception:
                await websocket.send_text(
                    json.dumps(
                        {"type": "error", "payload": {"detail": "invalid_join_payload"}}
                    )
                )
                continue
            player = await room.join(websocket, jp)
            player_id = player.id
            await manager.resync_room_paragraph_after_join(room)
            is_host, started, paused, finished = await manager.player_room_flags(
                room.logical_room_id, player_id, jp.host
            )
            peers = await room.peers_snapshot(player_id)
            text_line_count = await manager.logical_text_line_count(room.logical_room_id)
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "join_ok",
                        "payload": {
                            "player_id": player_id,
                            "room_id": room_id,
                            "logical_room_id": room.logical_room_id,
                            "shard_index": room.shard_index,
                            "text": room.paragraph,
                            "text_line_count": text_line_count,
                            "team_id": player.team_id,
                            "relay_mode": room.relay_mode,
                            "is_host": is_host,
                            "started": started,
                            "paused": paused,
                            "finished": finished,
                            "peers": peers,
                        },
                    }
                )
            )
            await room.push_leaderboard_snapshot()
            idle_task = asyncio.create_task(idle_guard())
            ping_task = asyncio.create_task(server_pings())
            break

        assert player_id is not None

        while True:
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                await remove_once(player_id, reason="disconnect")
                return
            touch()
            try:
                msg = ClientMessage.model_validate_json(raw)
            except Exception:
                await websocket.send_text(
                    json.dumps(
                        {"type": "error", "payload": {"detail": "invalid_message"}}
                    )
                )
                continue

            if msg.type == "ping":
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "pong",
                            "payload": {"ts": datetime.now(UTC).isoformat()},
                        }
                    )
                )
                continue
            if msg.type == "pong":
                continue
            if msg.type == "leave":
                await remove_once(player_id, reason="leave")
                with contextlib.suppress(Exception):
                    await websocket.close(code=1000)
                return
            if msg.type == "relay_pass":
                ok = await room.relay_pass(player_id)
                if not ok:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "relay_pass_rejected"},
                            }
                        )
                    )
                continue
            if msg.type == "start":
                ok = await manager.start_logical_race(room.logical_room_id, player_id)
                if not ok:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "start_rejected"},
                            }
                        )
                    )
                continue
            if msg.type == "game_pause":
                ok = await manager.pause_logical_game(room.logical_room_id, player_id)
                if not ok:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "pause_rejected"},
                            }
                        )
                    )
                else:
                    await manager.broadcast_to_logical(
                        room.logical_room_id,
                        json.dumps({"type": "game_paused", "payload": {}}),
                    )
                continue
            if msg.type == "game_resume":
                ok = await manager.resume_logical_game(room.logical_room_id, player_id)
                if not ok:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "resume_rejected"},
                            }
                        )
                    )
                else:
                    await manager.broadcast_to_logical(
                        room.logical_room_id,
                        json.dumps({"type": "game_resumed", "payload": {}}),
                    )
                continue
            if msg.type == "game_finish":
                ok = await manager.finish_logical_game(room.logical_room_id, player_id)
                if not ok:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "finish_rejected"},
                            }
                        )
                    )
                else:
                    for shard_room in await manager.rooms_for_logical(room.logical_room_id):
                        await shard_room.broadcast_race_finished_snapshot()
                continue
            if msg.type == "game_restart":
                ok = await manager.begin_race_restart(room.logical_room_id, player_id)
                if not ok:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "restart_rejected"},
                            }
                        )
                    )
                continue
            if msg.type == "room_settings_update":
                raw = (msg.payload or {}).get("text_line_count")
                ok, n, new_text = await manager.apply_host_text_line_count(
                    room.logical_room_id, player_id, raw
                )
                if not ok:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "room_settings_rejected"},
                            }
                        )
                    )
                    continue
                if new_text:
                    await manager.push_paragraph_to_all_shards(
                        room.logical_room_id, new_text
                    )
                sync_payload: dict[str, object] = {"text_line_count": n}
                if new_text:
                    sync_payload["text"] = new_text
                await manager.broadcast_to_logical(
                    room.logical_room_id,
                    json.dumps(
                        {"type": "room_settings_sync", "payload": sync_payload}
                    ),
                )
                continue
            if msg.type == "key":
                try:
                    kp = msg.key_payload()
                except Exception:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "payload": {"detail": "invalid_key_payload"},
                            }
                        )
                    )
                    continue
                await room.apply_key(
                    player_id,
                    char=kp.char if not kp.backspace else None,
                    backspace=kp.backspace,
                )
                continue

            await websocket.send_text(
                json.dumps(
                    {
                        "type": "error",
                        "payload": {"detail": "unknown_type", "received": msg.type},
                    }
                )
            )
    finally:
        for t in (idle_task, ping_task):
            if t is not None:
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await t
        if player_id and not removed:
            await remove_once(player_id, reason="disconnect")
