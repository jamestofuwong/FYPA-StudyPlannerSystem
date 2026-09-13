#!/usr/bin/env bash
set -e

DB_DATA=".postgres/data"
DB_LOG=".postgres/postgres.log"
DB_PORT=5435
PG_CTL="/opt/homebrew/opt/postgresql@16/bin/pg_ctl"

# Start PostgreSQL if not already running
if $PG_CTL -D "$DB_DATA" status > /dev/null 2>&1; then
  echo "[db] Already running on port $DB_PORT"
else
  $PG_CTL -D "$DB_DATA" -l "$DB_LOG" -o "-p $DB_PORT" start --silent
  echo "[db] Started on port $DB_PORT"
fi

# Stop PostgreSQL on Ctrl+C or exit
cleanup() {
  echo ""
  echo "[db] Stopping..."
  $PG_CTL -D "$DB_DATA" stop -m fast --silent
  echo "[db] Stopped"
}
trap cleanup EXIT INT TERM

# Start Next.js (takes over the terminal)
npx next dev
