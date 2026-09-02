"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/game-store";

/** Wait for an active session; try restoring from sessionStorage after refresh. */
export function useRequireGameSession() {
  const router = useRouter();
  const playerId = useGameStore((s) => s.playerId);
  const restoreSession = useGameStore((s) => s.restoreSession);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (playerId) {
      setReady(true);
      return;
    }

    let cancelled = false;
    restoreSession()
      .then((ok) => {
        if (cancelled) return;
        if (!ok) router.replace("/");
        else setReady(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/");
      });

    return () => {
      cancelled = true;
    };
  }, [playerId, restoreSession, router]);

  return { ready: ready && Boolean(playerId), playerId };
}
