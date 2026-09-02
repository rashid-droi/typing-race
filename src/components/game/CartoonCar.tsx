type CarColor = "red" | "blue" | "yellow" | "green" | "orange";

export type { CarColor };

const PALETTE: Record<
  CarColor,
  { body: string; roof: string; trim: string; window: string; accent: string }
> = {
  red: { body: "#ef5350", roof: "#e53935", trim: "#b71c1c", window: "#81d4fa", accent: "#ffcdd2" },
  blue: { body: "#42a5f5", roof: "#1e88e5", trim: "#1565c0", window: "#b3e5fc", accent: "#bbdefb" },
  yellow: { body: "#ffee58", roof: "#fdd835", trim: "#f9a825", window: "#81d4fa", accent: "#fff9c4" },
  green: { body: "#66bb6a", roof: "#43a047", trim: "#2e7d32", window: "#b2ebf2", accent: "#c8e6c9" },
  orange: { body: "#ffa726", roof: "#fb8c00", trim: "#e65100", window: "#80deea", accent: "#ffe0b2" },
};

export function CartoonCar({
  color = "red",
  className = "",
  number,
  moving = false,
}: {
  color?: CarColor;
  className?: string;
  number?: number;
  moving?: boolean;
}) {
  const p = PALETTE[color];
  return (
    <svg
      viewBox="0 0 128 64"
      className={`${className}${moving ? " cartoon-car-moving" : ""}`}
      aria-hidden
      role="img"
    >
      <ellipse cx="64" cy="54" rx="46" ry="6" fill="rgba(0,0,0,0.18)" />
      <path
        d="M18 38 C18 28 28 22 42 22 L52 22 L62 14 L88 14 L98 22 L108 22 C116 22 122 28 122 36 L122 42 C122 46 118 50 114 50 L14 50 C10 50 6 46 6 42 L6 36 C6 30 11 25 18 24 Z"
        fill={p.body}
        stroke="#263238"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M56 22 L64 15 L86 15 L94 22 Z"
        fill={p.roof}
        stroke="#263238"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="58" y="18" width="28" height="12" rx="3" fill={p.window} stroke="#263238" strokeWidth="2" />
      <rect x="22" y="30" width="18" height="6" rx="2" fill="rgba(255,255,255,0.45)" />
      <path d="M24 38 H104" stroke={p.trim} strokeWidth="4" strokeLinecap="round" />
      {number != null && (
        <text
          x="36"
          y="36"
          fontSize="11"
          fontWeight="700"
          fill="#263238"
          fontFamily="var(--font-race), sans-serif"
        >
          {number}
        </text>
      )}
      <circle cx="34" cy="50" r="11" fill="#263238" className="cartoon-car-wheel" />
      <circle cx="34" cy="50" r="6" fill="#eceff1" className="cartoon-car-hub" />
      <circle cx="96" cy="50" r="11" fill="#263238" className="cartoon-car-wheel" />
      <circle cx="96" cy="50" r="6" fill="#eceff1" className="cartoon-car-hub" />
      <circle cx="108" cy="34" r="4" fill="#fff9c4" stroke="#263238" strokeWidth="1.5" />
    </svg>
  );
}

/** Top-down racing car — wheels sit flush on the lane as horizontal tread patches. */
export function CartoonCarTopDown({
  color = "red",
  className = "",
  number,
  moving = false,
}: {
  color?: CarColor;
  className?: string;
  number?: number;
  moving?: boolean;
}) {
  const p = PALETTE[color];
  const uid = typeof number === "number" ? `${color}-${number}` : color;

  const wheels = [
    { cx: 8, cy: 18 },
    { cx: 52, cy: 18 },
    { cx: 8, cy: 56 },
    { cx: 52, cy: 56 },
  ];

  return (
    <svg
      viewBox="0 0 60 64"
      className={`cartoon-car-topdown ${className}${moving ? " cartoon-car-topdown-moving" : ""}`}
      aria-hidden
      role="img"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id={`car-body-${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={p.accent} />
          <stop offset="40%" stopColor={p.body} />
          <stop offset="100%" stopColor={p.trim} />
        </linearGradient>
        <linearGradient id={`car-glass-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e3f2fd" />
          <stop offset="100%" stopColor={p.window} />
        </linearGradient>
      </defs>

      {/* Main body (covers inner half of each wheel) */}
      <path
        d="M16 52 C16 58 20 60 30 60 C40 60 44 58 44 52 L42 16 C42 12 38 8 30 8 C22 8 18 12 18 16 Z"
        fill={`url(#car-body-${uid})`}
        stroke="#263238"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Wheels — wide flat ovals = tire contact patch from above */}
      {wheels.map((w, i) => (
        <g key={`wheel-${i}`} className="cartoon-car-topdown-wheel">
          <ellipse
            cx={w.cx}
            cy={w.cy + 0.5}
            rx={5.5}
            ry={2.2}
            fill="rgba(0,0,0,0.35)"
          />
          <rect
            x={w.cx - 5}
            y={w.cy - 3}
            width={10}
            height={6}
            rx={3}
            fill="#1a1a1a"
            stroke="#111"
            strokeWidth="1.2"
          />
          <g className="cartoon-car-tread">
            <line
              x1={w.cx - 3.5}
              y1={w.cy}
              x2={w.cx + 3.5}
              y2={w.cy}
              stroke="#333"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <line
              x1={w.cx - 2.5}
              y1={w.cy - 1.2}
              x2={w.cx + 2.5}
              y2={w.cy - 1.2}
              stroke="#2a2a2a"
              strokeWidth="0.8"
              strokeLinecap="round"
            />
            <line
              x1={w.cx - 2.5}
              y1={w.cy + 1.2}
              x2={w.cx + 2.5}
              y2={w.cy + 1.2}
              stroke="#2a2a2a"
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          </g>
          <ellipse cx={w.cx} cy={w.cy} rx={1.8} ry={1.1} fill="#546e7a" />
        </g>
      ))}

      {/* Front wing */}
      <path
        d="M12 14 H48 M14 10 H46 M16 6 H44"
        stroke="#263238"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M16 6 H44" stroke={p.trim} strokeWidth="1.5" strokeLinecap="round" />

      {/* Cockpit */}
      <path
        d="M20 24 L23 16 L37 16 L40 24 L40 34 L20 34 Z"
        fill={`url(#car-glass-${uid})`}
        stroke="#263238"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M21 34 H39" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />

      {/* Rear wing */}
      <path
        d="M14 54 H46 M16 58 H44"
        stroke="#263238"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M16 58 H44" stroke={p.trim} strokeWidth="1.5" strokeLinecap="round" />

      {/* Headlights */}
      <rect x="19" y="9" width="5" height="3" rx="1" fill="#fff9c4" stroke="#263238" strokeWidth="1" />
      <rect x="36" y="9" width="5" height="3" rx="1" fill="#fff9c4" stroke="#263238" strokeWidth="1" />

      {number != null && (
        <text
          x="30"
          y="48"
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill="#fff"
          stroke="#263238"
          strokeWidth="1.2"
          paintOrder="stroke fill"
          fontFamily="var(--font-race), sans-serif"
        >
          {number}
        </text>
      )}
    </svg>
  );
}

const CARS: { color: CarColor; delay: string; duration: string; bottom: string; scale: string }[] = [
  { color: "red", delay: "0s", duration: "14s", bottom: "8px", scale: "scale-[0.85]" },
  { color: "blue", delay: "4s", duration: "18s", bottom: "18px", scale: "scale-100" },
  { color: "yellow", delay: "9s", duration: "16s", bottom: "4px", scale: "scale-75" },
  { color: "green", delay: "2s", duration: "20s", bottom: "14px", scale: "scale-90" },
  { color: "orange", delay: "12s", duration: "15s", bottom: "10px", scale: "scale-80" },
];

export function AdminRaceTrack() {
  return (
    <div className="admin-race-track mt-auto" aria-hidden>
      <div className="admin-track-road">
        {CARS.map((car, i) => (
          <div
            key={car.color}
            className={`admin-track-car ${car.scale}`}
            style={{
              animationDelay: car.delay,
              animationDuration: car.duration,
              bottom: car.bottom,
            }}
          >
            <CartoonCar color={car.color} number={i + 1} className="h-12 w-24 sm:h-14 sm:w-28" />
          </div>
        ))}
      </div>
      <div className="checkered-strip w-full" />
    </div>
  );
}
