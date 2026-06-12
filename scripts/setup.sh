#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing Node dependencies"
npm run install:all

echo "==> Setting up Python backend"
npm run setup:backend

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo "==> Created backend/.env from example"
else
  echo "==> backend/.env already exists (skipped)"
fi

if [[ ! -f frontend/.env ]]; then
  cp frontend/.env.example frontend/.env
  echo "==> Created frontend/.env from example"
else
  echo "==> frontend/.env already exists (skipped)"
fi

mkdir -p backend/data

echo ""
echo "Setup complete. Start the app:"
echo "  npm run dev"
echo ""
echo "Admin login: http://localhost:5173/admin/login"
echo "  company: acme  email: admin@typingrace.local  password: changeme"
echo ""
echo "Optional Redis (leaderboard pub/sub):"
echo "  docker compose up -d redis"
echo "  Then set REDIS_URL=redis://127.0.0.1:6379/0 in backend/.env"
