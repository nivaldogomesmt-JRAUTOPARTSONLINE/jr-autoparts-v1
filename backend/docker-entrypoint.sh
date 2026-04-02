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
  if ! npx prisma migrate deploy; then
    echo "Falha no prisma migrate deploy. Tentando sincronizar schema legado com prisma db push..."
    npx prisma db push --accept-data-loss
  fi
else
  npx prisma db push --accept-data-loss
fi
exec node index.js
