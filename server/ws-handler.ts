import type { IncomingMessage } from "http";
import type { Server } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { getRoomManager, setRoomManager, RoomManager } from "./game/manager";
import { ROOM_ID_RE, sendJson, type ClientMessage, type JoinPayload } from "./game/types";

function parseJoinPayload(payload: Record<string, unknown> | undefined): JoinPayload {
  const rawPlayerId = payload?.player_id ?? payload?.playerId;
  return {
    name: typeof payload?.name === "string" ? payload.name : "Player",
    teamId:
      payload?.team_id === 0 || payload?.team_id === 1
        ? payload.team_id
        : payload?.teamId === 0 || payload?.teamId === 1
          ? payload.teamId
          : undefined,
    relay: typeof payload?.relay === "boolean" ? payload.relay : undefined,
    host: typeof payload?.host === "boolean" ? payload.host : undefined,
    playerId: typeof rawPlayerId === "string" && rawPlayerId.trim() ? rawPlayerId.trim() : undefined,
  };
}

export function attachWebSocketServer(server: Server): RoomManager {
  const manager = getRoomManager();
  setRoomManager(manager);

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const match = url.match(/^\/ws\/([^/?]+)/);
    if (!match) {
      socket.destroy();
      return;
    }
    const roomId = decodeURIComponent(match[1]!);
    if (!ROOM_ID_RE.test(roomId)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleRoomConnection(ws, roomId, manager);
    });
  });

  return manager;
}

async function handleRoomConnection(
  ws: WebSocket,
  roomId: string,
  manager: RoomManager
): Promise<void> {
  const room = manager.assignRoom(roomId);
  let playerId: string | null = null;
  let lastActivity = Date.now();
  let removed = false;
  let idleTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const touch = () => {
    lastActivity = Date.now();
  };

  const removeOnce = async (pid: string, reason: string) => {
    if (removed) return;
    removed = true;
    await room.removePlayer(pid, reason);
  };

  const sendError = (detail: string) => {
    sendJson(ws, { type: "error", payload: { detail } });
  };

  const onMessage = async (raw: Buffer | ArrayBuffer | Buffer[]) => {
    touch();
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      sendError("invalid_message");
      return;
    }

    if (playerId === null) {
      if (msg.type !== "join") {
        sendError("join_first");
        return;
      }
      const jp = parseJoinPayload(msg.payload);
      const player = room.join(ws, jp);
      playerId = player.id;
      await manager.resyncRoomParagraphAfterJoin(room);
      const flags = manager.playerRoomFlags(room.logicalRoomId, playerId, jp.host);
      const typing = room.getTypingState(playerId);
      sendJson(ws, {
        type: "join_ok",
        payload: {
          player_id: playerId,
          room_id: roomId,
          logical_room_id: room.logicalRoomId,
          shard_index: room.shardIndex,
          text: room.getParagraph(),
          text_line_count: manager.logicalTextLineCount(room.logicalRoomId),
          team_id: player.teamId,
          relay_mode: room.getRelayMode(),
          is_host: flags.isHost,
          started: flags.started,
          paused: flags.paused,
          finished: flags.finished,
          reconnected: Boolean(jp.playerId),
          typed_chars: typing?.typedIndex ?? 0,
          errors: typing?.errors ?? 0,
          peers: room.peersSnapshot(playerId),
        },
      });
      await room.pushLeaderboardSnapshot();
      if (flags.finished) {
        room.sendRaceFinishedTo(ws);
      }

      idleTimer = setInterval(() => {
        if (Date.now() - lastActivity > manager.idleSeconds * 1000) {
          ws.close(4408);
          if (playerId) void removeOnce(playerId, "idle_timeout");
        }
      }, 2000);

      pingTimer = setInterval(() => {
        sendJson(ws, { type: "ping", payload: { ts: new Date().toISOString() } });
      }, manager.serverPingIntervalS * 1000);
      return;
    }

    const pid = playerId;

    switch (msg.type) {
      case "ping":
        sendJson(ws, { type: "pong", payload: { ts: new Date().toISOString() } });
        break;
      case "pong":
        break;
      case "leave":
        await removeOnce(pid, "leave");
        ws.close(1000);
        break;
      case "relay_pass":
        if (!room.relayPass(pid)) sendError("relay_pass_rejected");
        break;
      case "start":
        if (!manager.startLogicalRace(room.logicalRoomId, pid)) sendError("start_rejected");
        break;
      case "game_pause":
        if (!manager.pauseLogicalGame(room.logicalRoomId, pid)) {
          sendError("pause_rejected");
        } else {
          manager.broadcastToLogical(room.logicalRoomId, JSON.stringify({ type: "game_paused", payload: {} }));
        }
        break;
      case "game_resume":
        if (!manager.resumeLogicalGame(room.logicalRoomId, pid)) {
          sendError("resume_rejected");
        } else {
          manager.broadcastToLogical(room.logicalRoomId, JSON.stringify({ type: "game_resumed", payload: {} }));
        }
        break;
      case "game_finish":
        if (!manager.finishLogicalGame(room.logicalRoomId, pid)) {
          sendError("finish_rejected");
        } else {
          for (const shard of manager.roomsForLogical(room.logicalRoomId)) {
            await shard.broadcastRaceFinishedSnapshot();
          }
        }
        break;
      case "game_restart":
        if (!(await manager.beginRaceRestart(room.logicalRoomId, pid))) {
          sendError("restart_rejected");
        }
        break;
      case "room_settings_update": {
        const raw = msg.payload?.text_line_count;
        const { ok, count, newText } = manager.applyHostTextLineCount(
          room.logicalRoomId,
          pid,
          raw
        );
        if (!ok) {
          sendError("room_settings_rejected");
          break;
        }
        if (newText) await manager.pushParagraphToAllShards(room.logicalRoomId, newText);
        const syncPayload: Record<string, unknown> = { text_line_count: count };
        if (newText) syncPayload.text = newText;
        manager.broadcastToLogical(
          room.logicalRoomId,
          JSON.stringify({ type: "room_settings_sync", payload: syncPayload })
        );
        break;
      }
      case "key": {
        const backspace = Boolean(msg.payload?.backspace);
        const char =
          !backspace && typeof msg.payload?.char === "string" ? msg.payload.char : null;
        if (!backspace && (!char || char.length !== 1)) {
          sendError("invalid_key_payload");
          break;
        }
        room.applyKey(pid, char, backspace);
        break;
      }
      default:
        sendError("unknown_type");
    }
  };

  ws.on("message", (raw) => {
    void onMessage(raw);
  });

  ws.on("close", () => {
    if (idleTimer) clearInterval(idleTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (playerId && !removed) room.disconnectPlayer(playerId);
  });
}
