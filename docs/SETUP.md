# Typing Race — Setup Guide

This guide walks through running the **player app**, **admin panel**, and **event management** system described in [ADMIN_AND_EVENTS.md](./ADMIN_AND_EVENTS.md).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Python | 3.11+ |

Optional: [Docker](https://docs.docker.com/get-docker/) for Redis.

---

## Quick start (one command)

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
npm run dev
```

| URL | Purpose |
|-----|---------|
| http://localhost:5173 | Player app |
| http://localhost:5173/admin/login | Admin panel |
| http://127.0.0.1:8000/docs | API documentation |

---

## Manual setup

### 1. Install dependencies

```bash
npm run setup
```

This installs frontend + root npm packages and creates `backend/.venv` with Python dependencies.

### 2. Environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Important backend variables:**

| Variable | Purpose |
|----------|---------|
| `ADMIN_PASSWORD` | Change from `changeme` before sharing |
| `DATABASE_PATH` | SQLite file for events + analytics (default `data/typing-race.db`) |
| `APP_PUBLIC_URL` | Base URL for join links and QR codes |
| `REDIS_URL` | Optional — `redis://127.0.0.1:6379/0` with Docker Redis |

### 3. Start services

**Both frontend and backend:**

```bash
npm run dev
```

**Or separately:**

```bash
npm run dev:backend   # http://0.0.0.0:8000
npm run dev:frontend  # http://localhost:5173
```

### 4. Verify health

```bash
curl -s http://127.0.0.1:8000/api/v1/health
# {"status":"ok","service":"typing-race-api"}
```

---

## Admin panel

1. Open http://localhost:5173/admin/login
2. Sign in with defaults from `backend/.env`:
   - Company: `acme`
   - Email: `admin@typingrace.local`
   - Password: `changeme`
3. Use **Overview** for WPM analytics and PDF export.
4. Use **Events** to create managed typing events.

---

## Event workflow (admin → players)

### Create an event

1. Admin → **Events** → **Create event**
2. Complete the 3-step wizard (details, schedule, game settings)
3. On success you land on the **Control centre** with:
   - Auto-generated **join code** (e.g. `A3K9X2`)
   - **Player link** (`/?event=CODE`)
   - **QR code** PNG
   - **Room ID** for direct join

### Players join

Share the player link or QR. Players open:

```
http://localhost:5173/?event=YOUR_CODE
```

The join screen resolves the code to a room and connects via WebSocket.

### Run the race

1. First player to check **Host** controls the room (or use host mode on join)
2. Lobby → set race length → **Start race**
3. Game → type the paragraph; leaderboard updates in real time
4. Results → standings; sessions ingest to admin if admin is signed in

### Event status

From the control centre, update status: `lobby_open`, `in_progress`, `finished`, `archived`, `cancelled`.

Cancelled/archived events return `410` on public join-code lookup.

---

## Optional: Redis

```bash
docker compose up -d redis
```

Add to `backend/.env`:

```
REDIS_URL=redis://127.0.0.1:6379/0
```

Restart the backend. Leaderboard snapshots publish to `typingrace:lb:{room}:{shard}`.

---

## Data persistence

| Data | Location |
|------|----------|
| Managed events | `backend/data/typing-race.db` |
| Training sessions | Same SQLite file |
| Audit log | Same SQLite file |
| Live game rooms | In-memory (lost on API restart) |
| Admin tokens | In-memory (re-login after API restart) |

Back up `backend/data/typing-race.db` before deployments.

---

## Production checklist

- [ ] Set strong `ADMIN_PASSWORD`
- [ ] Set `APP_PUBLIC_URL` to your real domain
- [ ] Use HTTPS (reverse proxy)
- [ ] Plan MySQL migration for multi-instance admin (see ADMIN_AND_EVENTS.md)
- [ ] Enable Redis for scale-out leaderboard observers
- [ ] Restrict CORS origins

---

## Troubleshooting

See [ADMIN_AND_EVENTS.md §30](./ADMIN_AND_EVENTS.md#30-troubleshooting) or:

| Issue | Fix |
|-------|-----|
| Port 8000 in use | Change `PORT` in `backend/.env` and `VITE_DEV_PROXY_TARGET` |
| Admin 401 after restart | Log in again (tokens are in-memory) |
| Empty analytics | Play a race while signed in as admin to ingest sessions |
| Event code not found | Check code spelling; event not cancelled/archived |

---

## Related docs

- [ADMIN_AND_EVENTS.md](./ADMIN_AND_EVENTS.md) — Full specification
- [WORKFLOW.md](./WORKFLOW.md) — Player journey and WebSocket protocol
