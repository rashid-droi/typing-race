"""Load-balancing preparation: logical rooms map to many in-process shards.

Gateways should keep WebSocket path ``/ws/{logical_room_id}`` unchanged; this
process assigns the connection to a shard bucket (``max_players_per_shard``).

For multi-instance deployments, front proxies should:
  - enable sticky sessions to the same worker for a connection lifetime, and/or
  - route using ``GET /api/v1/routing/snapshot`` (instance_id, per-shard counts).
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class RoutableInstance(Protocol):
    """Marker protocol for app.state objects exposing routing metadata."""

    instance_id: str

    def routing_snapshot(self) -> dict: ...
