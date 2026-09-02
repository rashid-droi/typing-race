"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGameStore } from "@/lib/game-store";

export function TypingInputZone({
  disabled,
}: {
  disabled?: boolean;
}) {
  const game = useGameStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  const typedLen = game.typingLocal.typedIndex;
  const me = game.players.find((p) => p.id === game.playerId);
  const chars = useMemo(() => [...game.paragraph], [game.paragraph]);
  const remainingText = game.paragraph.slice(typedLen);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled, game.paragraph]);

  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;
    const cursor = el.querySelector("[data-typing-cursor]");
    cursor?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [typedLen]);

  return (
    <div
      className={`typing-input-zone ${disabled ? "is-disabled" : ""}`}
      onPointerDown={() => inputRef.current?.focus()}
    >
      <p className="typing-input-label">Type here</p>

      <div
        ref={displayRef}
        className="typing-display"
        aria-hidden="true"
      >
        {chars.map((ch, i) => {
          let className = "typing-char typing-char-pending";
          if (i < typedLen) className = "typing-char typing-char-done";
          else if (i === typedLen) className = "typing-char typing-char-current";

          return (
            <span key={`${i}-${ch}`} className={className} data-typing-cursor={i === typedLen ? "" : undefined}>
              {ch === "\n" ? "\n" : ch}
            </span>
          );
        })}
      </div>

      <input
        ref={inputRef}
        className="typing-capture-input"
        readOnly
        tabIndex={0}
        aria-label="Typing input"
        aria-describedby="typing-progress-hint"
        disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Backspace") {
            e.preventDefault();
            game.sendBackspace();
            return;
          }
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            game.sendKey(e.key);
          }
        }}
      />

      <p id="typing-progress-hint" className="typing-progress-hint">
        {typedLen} / {game.paragraph.length} characters
        {remainingText.length === 0 && typedLen > 0 ? " · Finished!" : ""}
      </p>

      <div className="typing-stats-row">
        <span>
          WPM <strong>{Math.round(me?.wpm ?? 0)}</strong>
        </span>
        <span>
          Accuracy <strong>{Math.round((me?.accuracy ?? 1) * 100)}%</strong>
        </span>
        <span>
          Errors <strong>{me?.errors ?? 0}</strong>
        </span>
      </div>
    </div>
  );
}
