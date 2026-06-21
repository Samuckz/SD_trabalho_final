#!/bin/sh
set -e
# Stagger para evitar race condition nas migrations quando múltiplas instâncias sobem juntas
if [ "$INSTANCE_ID" = "chat-service-2" ]; then
    sleep 4
fi
echo "[${INSTANCE_ID:-chat-service}] Aplicando migrations..."
alembic upgrade head
echo "[${INSTANCE_ID:-chat-service}] Iniciando servidor..."
if [ "$RELOAD" = "true" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
fi
