#!/bin/sh
set -eu

ROOT_DIR=${ROOT_DIR:-/opt/jr-autoparts}

cd "$ROOT_DIR"

if [ ! -f "infra/vps/.env" ]; then
  echo "Arquivo infra/vps/.env nao encontrado."
  exit 1
fi

docker compose -f infra/vps/docker-compose.prod.yml --env-file infra/vps/.env up -d --build
docker compose -f infra/vps/docker-compose.prod.yml --env-file infra/vps/.env ps

echo "Deploy concluido. Valide: curl http://127.0.0.1:${JR_HTTP_PORT:-8088}/health"
