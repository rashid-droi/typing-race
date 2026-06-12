const TOKEN_KEY = "typing_race_admin_token";

export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  if (base) return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return path.startsWith("/") ? path : `/${path}`;
}

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function formatFastApiDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const loc = (item as { loc?: unknown[] }).loc;
          const path = Array.isArray(loc)
            ? loc.filter((x) => typeof x === "string").join(".")
            : "";
          const msg = String((item as { msg: unknown }).msg);
          return path ? `${path}: ${msg}` : msg;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  if (detail == null) return "";
  return String(detail);
}

async function parseJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON (${r.status}) from ${r.url}`);
  }
  if (!r.ok) {
    const raw =
      data && typeof data === "object" && "detail" in data
        ? (data as { detail: unknown }).detail
        : undefined;
    const detail = formatFastApiDetail(raw);
    if (r.status === 404) {
      throw new Error(
        `Not found (404): ${r.url} — open the game at http://localhost:5173 (frontend: npm run dev), or browse API routes at /docs on this server.`
      );
    }
    throw new Error(detail || r.statusText || `HTTP ${r.status}`);
  }
  return (data ?? {}) as T;
}

export type CompanyLoginRequest = {
  company_slug: string;
  email: string;
  password: string;
};

export type CompanyLoginResponse = {
  access_token: string;
  token_type: string;
  company_slug: string;
  email: string;
};

export async function adminCompanyLogin(body: CompanyLoginRequest): Promise<CompanyLoginResponse> {
  const r = await fetch(apiUrl("/api/v1/admin/auth/company/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<CompanyLoginResponse>(r);
}

export async function adminLogout(token: string): Promise<void> {
  const r = await fetch(apiUrl("/api/v1/admin/auth/logout"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  await parseJson(r);
}

export async function adminMe(token: string): Promise<{ company: string; email: string }> {
  const r = await fetch(apiUrl("/api/v1/admin/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(r);
}

export type AnalyticsOverview = {
  session_count: number;
  avg_final_wpm: number;
  median_final_wpm: number;
  team_a_sessions: number;
  team_b_sessions: number;
  team_a_avg_wpm: number;
  team_b_avg_wpm: number;
  wpm_history_blended: (number | null)[];
  recent_peak_wpm: number;
};

export async function fetchAnalyticsOverview(token: string): Promise<AnalyticsOverview> {
  const r = await fetch(apiUrl("/api/v1/admin/analytics/overview"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<AnalyticsOverview>(r);
}

export type TrainingSessionRow = {
  id: string;
  ts: number;
  room_id: string | null;
  user_label: string | null;
  team_id: number | null;
  final_wpm: number;
  accuracy: number;
  progress: number;
  duration_s: number;
  wpm_history: number[];
  replay: { t?: number; progress?: number; wpm?: number; label?: string }[];
};

export async function fetchTrainingSessions(
  token: string,
  limit = 50
): Promise<TrainingSessionRow[]> {
  const r = await fetch(apiUrl(`/api/v1/admin/training/sessions?limit=${limit}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<TrainingSessionRow[]>(r);
}

export async function postTrainingSession(
  token: string,
  body: Partial<TrainingSessionRow> & Record<string, unknown>
): Promise<TrainingSessionRow> {
  const r = await fetch(apiUrl("/api/v1/admin/training/sessions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return parseJson<TrainingSessionRow>(r);
}

export type AdminEventRow = {
  id: string;
  ts: number;
  type: string;
  actor: string;
  meta: Record<string, unknown>;
};

export async function fetchEvents(token: string, limit = 100): Promise<AdminEventRow[]> {
  const r = await fetch(apiUrl(`/api/v1/admin/events?limit=${limit}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<AdminEventRow[]>(r);
}

export async function postAdminEvent(
  token: string,
  type: string,
  meta: Record<string, unknown> = {}
): Promise<AdminEventRow> {
  const r = await fetch(apiUrl("/api/v1/admin/events"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type, meta }),
  });
  return parseJson<AdminEventRow>(r);
}

export type ManagedEventStatus =
  | "draft"
  | "scheduled"
  | "lobby_open"
  | "in_progress"
  | "finished"
  | "archived"
  | "cancelled";

export type ManagedEventRow = {
  id: string;
  company_slug: string;
  name: string;
  description: string;
  join_code: string;
  room_id: string;
  status: ManagedEventStatus;
  starts_at: number | null;
  ends_at: number | null;
  timezone: string;
  max_players: number;
  text_line_count: number;
  relay_mode: boolean;
  theme_primary: string;
  public_wall: boolean;
  created_at: number;
  updated_at: number;
  join_url: string;
  room_url: string;
  qr_url: string;
};

export type ManagedEventCreate = {
  name: string;
  description?: string;
  room_id?: string;
  join_code?: string;
  status?: "draft" | "scheduled" | "lobby_open";
  starts_at?: number | null;
  ends_at?: number | null;
  timezone?: string;
  max_players?: number;
  text_line_count?: number;
  relay_mode?: boolean;
  theme_primary?: string;
  public_wall?: boolean;
};

export type PublicEventResolve = {
  join_code: string;
  room_id: string;
  name: string;
  description: string;
  status: ManagedEventStatus;
  text_line_count: number;
  relay_mode: boolean;
  theme_primary: string;
  join_url: string;
  room_url: string;
};

export async function fetchManagedEvents(
  token: string,
  limit = 100
): Promise<ManagedEventRow[]> {
  const r = await fetch(apiUrl(`/api/v1/admin/managed-events?limit=${limit}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<ManagedEventRow[]>(r);
}

export async function createManagedEvent(
  token: string,
  body: ManagedEventCreate
): Promise<ManagedEventRow> {
  const r = await fetch(apiUrl("/api/v1/admin/managed-events"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return parseJson<ManagedEventRow>(r);
}

export async function fetchManagedEvent(
  token: string,
  eventId: string
): Promise<ManagedEventRow> {
  const r = await fetch(apiUrl(`/api/v1/admin/managed-events/${eventId}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<ManagedEventRow>(r);
}

export async function updateManagedEventStatus(
  token: string,
  eventId: string,
  status: ManagedEventStatus
): Promise<ManagedEventRow> {
  const r = await fetch(apiUrl(`/api/v1/admin/managed-events/${eventId}/status`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  return parseJson<ManagedEventRow>(r);
}

export async function fetchManagedEventQrBlob(
  token: string,
  eventId: string
): Promise<Blob> {
  const r = await fetch(apiUrl(`/api/v1/admin/managed-events/${eventId}/qr.png`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.blob();
}

export async function resolvePublicEventByCode(joinCode: string): Promise<PublicEventResolve> {
  const r = await fetch(
    apiUrl(`/api/v1/public/events/by-code/${encodeURIComponent(joinCode.trim().toUpperCase())}`)
  );
  return parseJson<PublicEventResolve>(r);
}
