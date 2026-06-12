import json
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps({"type": "error", "payload": {"detail": "invalid_json"}})
                )
                continue

            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "pong",
                            "payload": {"ts": datetime.now(UTC).isoformat()},
                        }
                    )
                )
            elif msg_type == "echo":
                payload = data.get("payload") or {}
                message = payload.get("message", "")
                await websocket.send_text(
                    json.dumps({"type": "echo", "payload": {"message": message}})
                )
            else:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "payload": {"detail": "unknown_type", "received": msg_type},
                        }
                    )
                )
    except WebSocketDisconnect:
        return
