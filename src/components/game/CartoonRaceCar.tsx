import type { CarColor } from "./CartoonCar";

const PALETTE: Record<
  CarColor,
  { body: string; roof: string; trim: string; window: string; highlight: string; accent: string }
> = {
  red: { body: "#b71c1c", roof: "#8b0000", trim: "#5d0000", window: "#455a64", highlight: "#ef5350", accent: "#ffcdd2" },
  blue: { body: "#1565c0", roof: "#0d47a1", trim: "#082a6b", window: "#455a64", highlight: "#42a5f5", accent: "#bbdefb" },
  yellow: { body: "#f9a825", roof: "#e65100", trim: "#bf360c", window: "#455a64", highlight: "#ffca28", accent: "#fff9c4" },
  green: { body: "#2e7d32", roof: "#1b5e20", trim: "#0d3d12", window: "#455a64", highlight: "#66bb6a", accent: "#c8e6c9" },
  orange: { body: "#e65100", roof: "#bf360c", trim: "#8d2600", window: "#455a64", highlight: "#ff9800", accent: "#ffe0b2" },
};

const CARTOON: Record<CarColor, { body: string; roof: string; trim: string; window: string; accent: string }> = {
  red: { body: "#ef5350", roof: "#e53935", trim: "#b71c1c", window: "#81d4fa", accent: "#ffcdd2" },
  blue: { body: "#42a5f5", roof: "#1e88e5", trim: "#1565c0", window: "#b3e5fc", accent: "#bbdefb" },
  yellow: { body: "#ffee58", roof: "#fdd835", trim: "#f9a825", window: "#81d4fa", accent: "#fff9c4" },
  green: { body: "#66bb6a", roof: "#43a047", trim: "#2e7d32", window: "#b2ebf2", accent: "#c8e6c9" },
  orange: { body: "#ffa726", roof: "#fb8c00", trim: "#e65100", window: "#80deea", accent: "#ffe0b2" },
};

/** Top-down car — front at top (y=0), drives upward on vertical lanes. No rotation hack. */
export function CartoonRaceCar({
  color = "red",
  className = "",
  number,
  moving = false,
  realistic = false,
}: {
  color?: CarColor;
  className?: string;
  number?: number;
  moving?: boolean;
  realistic?: boolean;
}) {
  const p = realistic ? PALETTE[color] : CARTOON[color];
  const uid = `${realistic ? "r" : "c"}-${color}-${number ?? "x"}`;
  const moveClass = moving
    ? realistic
      ? " race-car-realistic cartoon-car-moving"
      : " cartoon-car-topdown-moving"
    : realistic
      ? " race-car-realistic"
      : "";

  const wheels = [
    { cx: 9, cy: 17 },
    { cx: 51, cy: 17 },
    { cx: 9, cy: 55 },
    { cx: 51, cy: 55 },
  ];

  const stroke = realistic ? "#1a1a1a" : "#263238";
  const strokeW = realistic ? 1.2 : 2;

  return (
    <svg
      viewBox="0 0 60 64"
      className={`cartoon-car-topdown cartoon-race-car ${className}${moveClass}`}
      aria-hidden
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`race-body-${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={realistic ? PALETTE[color].highlight : p.accent} />
          <stop offset="45%" stopColor={p.body} />
          <stop offset="100%" stopColor={p.trim} />
        </linearGradient>
        <linearGradient id={`race-glass-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={realistic ? "#546e7a" : "#e3f2fd"} />
          <stop offset="100%" stopColor={p.window} />
        </linearGradient>
      </defs>

      <ellipse cx="30" cy="62" rx="14" ry="2" fill="rgba(0,0,0,0.3)" />

      {/* Body — nose at top */}
      <path
        d="M16 52 C16 58 20 60 30 60 C40 60 44 58 44 52 L42 16 C42 12 38 8 30 8 C22 8 18 12 18 16 Z"
        fill={`url(#race-body-${uid})`}
        stroke={stroke}
        strokeWidth={strokeW}
        strokeLinejoin="round"
      />

      {wheels.map((w, i) => (
        <g key={i}>
          <rect
            x={w.cx - 5}
            y={w.cy - 3}
            width={10}
            height={6}
            rx={3}
            fill={realistic ? "#1a1a1a" : "#263238"}
            stroke={realistic ? "#111" : "#111"}
            strokeWidth={1}
          />
          {moving && (
            <g className="cartoon-car-tread">
              <line x1={w.cx - 3.5} y1={w.cy} x2={w.cx + 3.5} y2={w.cy} stroke="#444" strokeWidth="1" strokeLinecap="round" />
            </g>
          )}
          <ellipse
            cx={w.cx}
            cy={w.cy}
            rx={realistic ? 2 : 1.8}
            ry={1.1}
            fill={realistic ? "#9e9e9e" : "#546e7a"}
          />
        </g>
      ))}

      {/* Front wing */}
      <path d="M12 14 H48" stroke={stroke} strokeWidth={strokeW + 0.5} strokeLinecap="round" />
      <path d="M14 10 H46" stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" />
      <rect x="19" y="7" width="5" height="3" rx="1" fill="#fffde7" stroke={stroke} strokeWidth="0.8" />
      <rect x="36" y="7" width="5" height="3" rx="1" fill="#fffde7" stroke={stroke} strokeWidth="0.8" />

      {/* Cockpit */}
      <path
        d="M20 24 L23 16 L37 16 L40 24 L40 34 L20 34 Z"
        fill={`url(#race-glass-${uid})`}
        stroke={stroke}
        strokeWidth={strokeW}
        strokeLinejoin="round"
      />

      {/* Rear wing + taillights */}
      <path d="M14 54 H46 M16 58 H44" stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" />
      <rect x="20" y="55" width="4" height="2" rx="0.5" fill="#c62828" />
      <rect x="36" y="55" width="4" height="2" rx="0.5" fill="#c62828" />

      {number != null && (
        <text
          x="30"
          y="48"
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill={realistic ? "#fff" : "#263238"}
          stroke={realistic ? "none" : undefined}
          fontFamily="ui-monospace, monospace"
        >
          {number}
        </text>
      )}
    </svg>
  );
}
