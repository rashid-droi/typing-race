# Typing Race

Multiplayer typing competition — **Next.js**, **Tailwind**, **PostgreSQL**, **Prisma**, WebSocket game server.

## Stack

| Layer | Tech |
|-------|------|
| UI | Next.js 15 App Router + Tailwind CSS 4 |
| API | Next.js Route Handlers |
| Database | PostgreSQL + Prisma |
| Realtime | WebSocket (`/ws/{room_id}`) on same Node server |

Legacy Vue + FastAPI code is in `legacy/` for reference.

## Quick start

```bash
# 1. Start Postgres
docker compose up -d postgres

# 2. Env + deps
cp .env.example .env
npm install

# 3. Migrate + seed admin user
npm run db:migrate
npm run db:seed

# 4. Run in DEV mode (live reload — no refresh needed while coding)
npm run dev
```

> **While developing:** always use `npm run dev`.  
> **Do not use** `npm run start` unless you want production mode (requires `npm run build` after every change).

For production / demo deploy:

```bash
npm run start:prod
```

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Player app |
| http://localhost:3000/admin/login | Admin |
| ws://localhost:3000/ws/{room_id} | Game WebSocket |

**Admin login:** `acme` / `admin@typingrace.local` / `changeme`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | **Development** — hot reload, no manual refresh |
| `npm run build` | Production build |
| `npm run start` | Production server (run `build` first) |
| `npm run start:prod` | Build + start in one command |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Seed company + admin |

## Deploy

1. Set `DATABASE_URL` to your Postgres instance.
2. Run `npm run db:deploy && npm run db:seed`.
3. Run `npm run build && npm run start`.
4. Set `APP_PUBLIC_URL` to your public domain.

## Docs

- [docs/SETUP.md](docs/SETUP.md)
- [docs/ADMIN_AND_EVENTS.md](docs/ADMIN_AND_EVENTS.md)
