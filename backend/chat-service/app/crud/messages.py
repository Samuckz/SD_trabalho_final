import uuid
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConversationParticipant, Message


async def is_participant(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def get_messages_paginated(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Message], int]:
    total_result = await db.execute(
        select(func.count())
        .select_from(Message)
        .where(Message.conversation_id == conversation_id)
    )
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.timestamp.desc())
        .limit(page_size)
        .offset(offset)
    )
    messages = result.scalars().all()
    return list(messages), total


async def create_message(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    sender_id: uuid.UUID,
    content: str,
    msg_type: str = "text",
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        content=content,
        type=msg_type,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def get_message_by_id(
    db: AsyncSession, message_id: uuid.UUID
) -> Optional[Message]:
    result = await db.execute(select(Message).where(Message.id == message_id))
    return result.scalar_one_or_none()


async def mark_message_read(db: AsyncSession, message_id: uuid.UUID) -> None:
    await db.execute(
        update(Message).where(Message.id == message_id).values(status="read")
    )
    await db.commit()
