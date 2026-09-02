"use client";

import { useEffect } from "react";

export function GameShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    document.body.classList.add("race-active");
    return () => document.body.classList.remove("race-active");
  }, []);

  return (
    <div className={`race-scene relative ${className}`}>
      <div className="race-cloud race-cloud-1" aria-hidden />
      <div className="race-cloud race-cloud-2" aria-hidden />
      <div className="race-cloud race-cloud-3" aria-hidden />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function CheckeredStrip() {
  return <div className="checkered-strip w-full" aria-hidden />;
}

export function RaceLights({ mode = "waiting" }: { mode?: "waiting" | "off" | "go" }) {
  return (
    <div className="race-lights" aria-label={mode === "waiting" ? "Waiting to start" : "Race lights"}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`race-light ${mode === "waiting" ? "is-waiting" : mode === "go" ? "is-go" : ""}`}
        />
      ))}
    </div>
  );
}

export function CartoonTitle({
  children,
  size = "lg",
}: {
  children: React.ReactNode;
  size?: "lg" | "md";
}) {
  return (
    <h1
      className={`cartoon-title text-center ${size === "lg" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}
    >
      {children}
    </h1>
  );
}

export function rankClass(rank: number) {
  if (rank === 1) return "race-rank-1";
  if (rank === 2) return "race-rank-2";
  if (rank === 3) return "race-rank-3";
  return "race-rank-default";
}
