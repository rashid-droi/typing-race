import type { CarColor } from "./CartoonCar";

/** Arcade rear-view sports car — matches synthwave racing reference. */
export function RaceCarChaseView({
  color = "yellow",
  className = "",
  number,
  moving = false,
  isPlayer = false,
}: {
  color?: CarColor;
  className?: string;
  number?: number;
  moving?: boolean;
  isPlayer?: boolean;
}) {
  const uid = `arcade-${color}-${number ?? "x"}`;
  const body = isPlayer ? "#f5c518" : color === "red" ? "#e53935" : color === "blue" ? "#1e88e5" : color === "green" ? "#43a047" : color === "orange" ? "#fb8c00" : "#fdd835";
  const bodyDark = isPlayer ? "#d4a80f" : "#b71c1c";

  return (
    <svg
      viewBox="0 0 120 72"
      className={`arcade-race-car ${className}${moving ? " arcade-race-car--moving" : ""}${isPlayer ? " arcade-race-car--player" : ""}`}
      aria-hidden
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5ce1e6" />
          <stop offset="100%" stopColor="#0288d1" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Taillight glow on road */}
      <ellipse cx="60" cy="68" rx="38" ry="6" fill="rgba(255,23,68,0.45)" className="arcade-car-tail-glow" />

      {/* Headlight beam (opponents ahead) */}
      {!isPlayer && (
        <ellipse cx="60" cy="8" rx="12" ry="22" fill="rgba(255,255,255,0.12)" />
      )}

      {/* Body — wide low rear profile */}
      <path
        d="M8 52 L12 28 C12 22 18 16 28 14 L92 14 C102 16 108 22 108 28 L112 52 Z"
        fill={body}
        stroke="#1a1030"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Cabin glass */}
      <path
        d="M32 26 L38 16 L82 16 L88 26 L88 38 L32 38 Z"
        fill={`url(#${uid}-glass)`}
        stroke="#1a1030"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Side mirrors with cyan accent */}
      <rect x="6" y="24" width="6" height="4" rx="1" fill={bodyDark} stroke="#1a1030" strokeWidth="0.8" />
      <rect x="108" y="24" width="6" height="4" rx="1" fill={bodyDark} stroke="#1a1030" strokeWidth="0.8" />
      <circle cx="9" cy="26" r="1.2" fill="#4dd0e1" filter={`url(#${uid}-glow`} />
      <circle cx="111" cy="26" r="1.2" fill="#4dd0e1" filter={`url(#${uid}-glow`} />

      {/* Rear spoiler (opponents) */}
      {!isPlayer && (
        <path d="M22 48 H98" stroke="#1a1030" strokeWidth="3" strokeLinecap="round" />
      )}

      {/* Full-width red taillight bar (player) or dual lights */}
      {isPlayer ? (
        <rect x="18" y="44" width="84" height="5" rx="2" fill="#ff1744" filter={`url(#${uid}-glow`} className="arcade-car-taillight" />
      ) : (
        <>
          <rect x="24" y="44" width="14" height="5" rx="2" fill="#ff1744" filter={`url(#${uid}-glow`} />
          <rect x="82" y="44" width="14" height="5" rx="2" fill="#ff1744" filter={`url(#${uid}-glow`} />
        </>
      )}

      {/* Lower diffuser / bumper cutouts */}
      <path d="M18 52 H42 L46 58 H74 L78 52 H102" fill="#141414" stroke="#1a1030" strokeWidth="0.8" strokeLinejoin="round" />

      {/* Exhaust pipes */}
      <rect x="52" y="54" width="5" height="6" rx="1" fill="#bdbdbd" stroke="#757575" strokeWidth="0.6" />
      <rect x="63" y="54" width="5" height="6" rx="1" fill="#bdbdbd" stroke="#757575" strokeWidth="0.6" />

      {number != null && !isPlayer && (
        <text x="60" y="36" textAnchor="middle" fontSize="9" fontWeight="800" fill="rgba(255,255,255,0.85)" fontFamily="ui-monospace, monospace">
          {number}
        </text>
      )}
    </svg>
  );
}
