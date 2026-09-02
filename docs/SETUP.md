# Typing Race — Setup (Next.js + PostgreSQL + Prisma)

## Prerequisites

- Node.js 18+
- Docker (for local Postgres)

## One-command setup

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
npm run dev
```

## Manual setup

```bash
docker compose up -d postgres
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## URLs

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Player app |
| http://localhost:3000/admin/login | Admin |
| http://localhost:3000/api/health | API health |
| ws://localhost:3000/ws/{room_id} | Game WebSocket |

## Environment

See `.env.example`:

- `DATABASE_URL` — PostgreSQL connection string
- `APP_PUBLIC_URL` — Used for event join links and QR codes
- `ADMIN_*` — Default admin seed credentials

## Production deploy

```bash
npm run db:deploy
npm run db:seed   # first deploy only
npm run build
npm run start
```

Set `DATABASE_URL` and `APP_PUBLIC_URL` on your host (Railway, Render, Fly, VPS).

## Legacy stack

The previous Vue + FastAPI app is preserved under `legacy/` for reference.
