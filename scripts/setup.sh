#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Starting PostgreSQL (Docker)"
docker compose up -d postgres

echo "==> Installing dependencies"
npm install

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "==> Waiting for Postgres..."
sleep 3

echo "==> Running migrations"
npm run db:migrate -- --skip-seed 2>/dev/null || npx prisma migrate deploy

echo "==> Seeding admin user"
npm run db:seed

echo ""
echo "Setup complete. Run: npm run dev"
echo "  Player: http://localhost:3000"
echo "  Admin:  http://localhost:3000/admin/login"
echo "  Login:  acme / admin@typingrace.local / changeme"
