import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError

from app.auth import decode_access_token
from app.config import settings
from app.redis_client import close_redis_pool, get_redis
from app.routers import conversations as conversations_router
from app.routers import messages as messages_router
from app.routers import users as users_router
from app.ws_manager import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = get_redis()
    pong = await redis.ping()
    print(f"[{settings.INSTANCE_ID}] Redis ping: {'OK' if pong else 'FAIL'}", flush=True)
    await redis.aclose()

    await manager.start_subscriber()

    yield

    await manager.stop_subscriber()
    await close_redis_pool()


app = FastAPI(title="Chat Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:5173"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(conversations_router.router)
app.include_router(messages_router.router)
app.include_router(users_router.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "chat", "instance": settings.INSTANCE_ID}


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=None),
):
    if not token:
        await websocket.accept()
        await websocket.close(code=4001)
        return

    try:
        user_id_str = decode_access_token(token)
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        await websocket.accept()
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")
            payload = data.get("payload", {})

            if event_type == "typing":
                try:
                    conv_id = uuid.UUID(payload["conversationId"])
                except (KeyError, ValueError):
                    continue
                await manager.publish(
                    "typing",
                    conv_id,
                    {**payload, "userId": str(user_id)},
                    exclude_user_id=user_id,
                )

            elif event_type == "read":
                try:
                    conv_id = uuid.UUID(payload["conversationId"])
                except (KeyError, ValueError):
                    continue
                await manager.publish(
                    "read",
                    conv_id,
                    {**payload, "userId": str(user_id)},
                    exclude_user_id=user_id,
                )

    except WebSocketDisconnect:
        await manager.disconnect(websocket, user_id)
    except Exception:
        await manager.disconnect(websocket, user_id)
