import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.messages import (
    create_message,
    get_message_by_id,
    get_messages_paginated,
    is_participant,
    mark_message_read,
)
from app.database import get_db
from app.dependencies import get_current_user_id
from app.schemas import MessageCreate, MessageResponse
from app.ws_manager import manager

router = APIRouter(tags=["messages"])


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(
    conversation_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not await is_participant(db, conversation_id, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    messages, total = await get_messages_paginated(db, conversation_id, page, page_size)

    return {
        "data": [MessageResponse.model_validate(m).model_dump(by_alias=True, mode="json") for m in messages],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.post("/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    body: MessageCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not await is_participant(db, body.conversation_id, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    msg = await create_message(
        db,
        conversation_id=body.conversation_id,
        sender_id=user_id,
        content=body.content,
        msg_type=body.type,
    )

    msg_payload = MessageResponse.model_validate(msg).model_dump(by_alias=True, mode="json")

    # Publica no Redis para entrega cross-instância via Pub/Sub
    await manager.publish("message", body.conversation_id, msg_payload, exclude_user_id=user_id)

    return {"success": True, "data": msg_payload}


@router.put("/messages/{message_id}/read")
async def read_message(
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    msg = await get_message_by_id(db, message_id)
    if msg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensagem nao encontrada")

    if not await is_participant(db, msg.conversation_id, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    await mark_message_read(db, message_id)
    return {"success": True}
