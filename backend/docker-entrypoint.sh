#!/usr/bin/env sh
set -e

echo "[entrypoint] prisma migrate deploy (if any migrations)"
npx prisma migrate deploy || true

# IMPORTANT: Do not run `prisma db push` automatically in production.
# It can perform destructive drift changes or fail on data-loss warnings and block startup.
# Use migrations (`prisma migrate deploy`) as the source of truth.
if [ "${RUN_DB_PUSH:-false}" = "true" ]; then
  echo "[entrypoint] prisma db push (RUN_DB_PUSH=true)"
  npx prisma db push --accept-data-loss
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] running seed"
  node prisma/seed.js || echo "[entrypoint] seed failed (continuing)"
fi

echo "[entrypoint] starting app"
exec "$@"
