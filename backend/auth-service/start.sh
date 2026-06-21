#!/bin/sh
set -e

echo "[auth-service] Aplicando migrations..."
alembic upgrade head

echo "[auth-service] Iniciando servidor..."
if [ "$RELOAD" = "true" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
fi
