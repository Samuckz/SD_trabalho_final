import asyncio
import json
import uuid
from typing import Optional

import redis.asyncio as aioredis
from fastapi import WebSocket
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import ConversationParticipant
from app.redis_client import get_redis

BROADCAST_CHANNEL = "chat:broadcast"


class ConnectionManager:
    def __init__(self) -> None:
        # user_id (str) → lista de WebSockets ativos (suporta multi-tab)
        self.connections: dict[str, list[WebSocket]] = {}
        self._subscriber_task: Optional[asyncio.Task] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start_subscriber(self) -> None:
        self._subscriber_task = asyncio.create_task(self._subscriber_loop())

    async def stop_subscriber(self) -> None:
        if self._subscriber_task:
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass

    # ── WebSocket helpers ─────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        await websocket.accept()
        uid = str(user_id)
        self.connections.setdefault(uid, []).append(websocket)
        await self._set_redis_status(uid, "online")

    async def disconnect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        uid = str(user_id)
        conns = self.connections.get(uid, [])
        self.connections[uid] = [ws for ws in conns if ws is not websocket]
        if not self.connections[uid]:
            del self.connections[uid]
            await self._set_redis_status(uid, "offline")

    async def send_to_user(self, user_id: str, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.connections.get(user_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if user_id in self.connections:
                self.connections[user_id] = [w for w in self.connections[user_id] if w is not ws]

    async def send_to_conversation(
        self,
        conversation_id: uuid.UUID,
        message: dict,
        exclude_user_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Entrega local: apenas para clientes conectados NESTA instância."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conversation_id
                )
            )
            participant_ids: list[uuid.UUID] = result.scalars().all()

        for pid in participant_ids:
            if exclude_user_id and pid == exclude_user_id:
                continue
            await self.send_to_user(str(pid), message)

    # ── Redis Pub/Sub ─────────────────────────────────────────────────────────

    async def publish(
        self,
        event_type: str,
        conversation_id: uuid.UUID,
        payload: dict,
        exclude_user_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Publica evento no canal Redis para que todas as instâncias entreguem."""
        redis = get_redis()
        try:
            data = json.dumps({
                "type": event_type,
                "conversation_id": str(conversation_id),
                "exclude_user_id": str(exclude_user_id) if exclude_user_id else None,
                "payload": payload,
            })
            await redis.publish(BROADCAST_CHANNEL, data)
        finally:
            await redis.aclose()

    async def _subscriber_loop(self) -> None:
        """Recebe eventos do canal Redis e entrega localmente. Reconecta em falhas."""
        while True:
            redis: Optional[aioredis.Redis] = None
            try:
                # Conexão dedicada — subscribe bloqueia o canal
                redis = aioredis.Redis.from_url(
                    settings.REDIS_URL, decode_responses=True
                )
                pubsub = redis.pubsub()
                await pubsub.subscribe(BROADCAST_CHANNEL)
                print(f"[{settings.INSTANCE_ID}] subscriber conectado → {BROADCAST_CHANNEL}", flush=True)

                async for raw in pubsub.listen():
                    if raw["type"] != "message":
                        continue
                    try:
                        data = json.loads(raw["data"])
                        event_type = data["type"]
                        conv_id = uuid.UUID(data["conversation_id"])
                        excl = uuid.UUID(data["exclude_user_id"]) if data.get("exclude_user_id") else None
                        msg_payload = data["payload"]

                        await self.send_to_conversation(
                            conv_id,
                            {"type": event_type, "payload": msg_payload},
                            exclude_user_id=excl,
                        )
                    except Exception as e:
                        print(f"[{settings.INSTANCE_ID}] subscriber erro ao processar: {e}", flush=True)

            except asyncio.CancelledError:
                if redis:
                    await redis.aclose()
                break
            except Exception as e:
                print(f"[{settings.INSTANCE_ID}] subscriber desconectado: {e}. Reconectando em 2s...", flush=True)
                if redis:
                    await redis.aclose()
                await asyncio.sleep(2)

    # ── Redis status ──────────────────────────────────────────────────────────

    async def _set_redis_status(self, user_id: str, status: str) -> None:
        redis = get_redis()
        try:
            await redis.set(f"user:status:{user_id}", status)
        finally:
            await redis.aclose()


manager = ConnectionManager()
