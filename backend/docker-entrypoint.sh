#!/bin/sh
set -e

# Aguarda o banco de dados estar pronto antes de migrar
if [ -z "${DB_HOST:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  DB_HOST=$(printf '%s' "$DATABASE_URL" | sed -n 's#.*://[^@]*@\([^:/?]*\).*#\1#p')
fi

if [ -z "${DB_PORT:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  DB_PORT=$(printf '%s' "$DATABASE_URL" | sed -n 's#.*://[^@]*@[^:/?]*:\([0-9][0-9]*\).*#\1#p')
fi

DB_HOST=${DB_HOST:-db}
DB_PORT=${DB_PORT:-5432}
echo "Aguardando banco de dados em $DB_HOST:$DB_PORT..."
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  sleep 2
done
echo "Banco de dados disponivel."

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  if ! npx prisma migrate deploy 2> /tmp/prisma-migrate.err; then
    if grep -q "P3005" /tmp/prisma-migrate.err; then
      BASELINE_MIGRATION=$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | sort | head -n 1 | xargs -n 1 basename)
      if [ -n "${BASELINE_MIGRATION:-}" ]; then
        echo "Banco legado detectado. Marcando migration $BASELINE_MIGRATION como aplicada e repetindo deploy..."
        npx prisma migrate resolve --applied "$BASELINE_MIGRATION"
        npx prisma migrate deploy
      else
        echo "Nao foi possivel determinar a migration baseline."
        cat /tmp/prisma-migrate.err
        exit 1
      fi
    else
      echo "Falha no prisma migrate deploy."
      cat /tmp/prisma-migrate.err
      exit 1
    fi
  fi
else
  npx prisma db push --accept-data-loss
fi
exec node index.js
