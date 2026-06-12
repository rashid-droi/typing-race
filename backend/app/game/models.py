from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

ClientMessageType = Literal[
    "join",
    "leave",
    "key",
    "relay_pass",
    "start",
    "game_pause",
    "game_resume",
    "game_finish",
    "game_restart",
    "room_settings_update",
    "ping",
    "pong",
]


class Player(BaseModel):
    id: str
    name: str = "Player"
    team_id: int = 0
    team_rank: int = 0
    relay_active: bool = False
    wpm: float = 0.0
    accuracy: float = 0.0
    progress: float = 0.0
    typed_chars: int = 0
    keystrokes: int = 0
    errors: int = 0
    rank: int = 0

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        n = v.strip()[:48] or "Player"
        return n

    @field_validator("team_id")
    @classmethod
    def team_id_ok(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("team_id must be 0 or 1")
        return v

    @field_validator("progress")
    @classmethod
    def clamp_progress(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))

    @field_validator("accuracy")
    @classmethod
    def clamp_accuracy(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))

    @field_validator("wpm")
    @classmethod
    def nonneg_wpm(cls, v: float) -> float:
        return max(0.0, float(v))

    @field_validator("typed_chars", "keystrokes", "errors", "team_rank")
    @classmethod
    def nonneg_int(cls, v: int) -> int:
        return max(0, int(v))


class JoinPayload(BaseModel):
    name: str = "Player"
    team_id: int | None = None
    relay: bool | None = None
    host: bool | None = None

    @field_validator("team_id")
    @classmethod
    def team_optional(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v not in (0, 1):
            raise ValueError("team_id must be 0 or 1")
        return v


class KeyPayload(BaseModel):
    """Single key event: one printable character or backspace."""

    char: str | None = None
    backspace: bool = False

    @model_validator(mode="after")
    def char_or_backspace(self) -> KeyPayload:
        if self.backspace:
            return self
        if self.char is None or len(self.char) != 1:
            raise ValueError("char must be a single character when backspace is false")
        return self


class ClientMessage(BaseModel):
    type: ClientMessageType
    payload: dict[str, Any] = Field(default_factory=dict)

    def join_payload(self) -> JoinPayload:
        return JoinPayload.model_validate(self.payload)

    def key_payload(self) -> KeyPayload:
        return KeyPayload.model_validate(self.payload)
