#!/bin/sh
set -e

echo "[entrypoint] Pushing schema to database..."
prisma db push --schema ./core/db/prisma/schema --skip-generate

echo "[entrypoint] Starting Next.js server..."
exec node ./cloud/server.js
