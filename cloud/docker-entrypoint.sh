#!/bin/sh
set -e

echo "[entrypoint] Pushing schema to database..."
npx prisma db push \
  --schema ./core/db/prisma/schema

echo "[entrypoint] Starting Next.js server..."
exec node ./cloud/server.js
