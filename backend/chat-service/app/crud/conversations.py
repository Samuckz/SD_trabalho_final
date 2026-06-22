import uuid
from typing import Optional

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Conversation, ConversationParticipant, Message
from app.schemas import ConversationCreate


async def get_user_conversations(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Conversation, Optional[Message], int]]:
    result = await db.execute(
        select(Conversation)
        .join(ConversationParticipant, Conversation.id == ConversationParticipant.conversation_id)
        .where(ConversationParticipant.user_id == user_id)
        .options(selectinload(Conversation.participants))
        .order_by(Conversation.created_at.desc())
    )
    conversations = result.scalars().unique().all()

    output = []
    for conv in conversations:
        last_msg_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.timestamp.desc())
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()

        unread_result = await db.execute(
            select(func.count())
            .select_from(Message)
            .where(
                Message.conversation_id == conv.id,
                Message.sender_id != user_id,
                Message.status == "sent",
            )
        )
        unread_count = unread_result.scalar() or 0

        output.append((conv, last_msg, unread_count))

    return output


async def get_conversation_by_id(
    db: AsyncSession, conversation_id: uuid.UUID
) -> Optional[Conversation]:
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.participants))
    )
    return result.scalar_one_or_none()


async def find_private_conversation(
    db: AsyncSession, user_a: uuid.UUID, user_b: uuid.UUID
) -> Optional[Conversation]:
    """Retorna conversa privada já existente entre os dois usuários, se houver."""
    cp_a = ConversationParticipant.__table__.alias("cp_a")
    cp_b = ConversationParticipant.__table__.alias("cp_b")

    result = await db.execute(
        select(Conversation)
        .join(cp_a, Conversation.id == cp_a.c.conversation_id)
        .join(cp_b, Conversation.id == cp_b.c.conversation_id)
        .where(
            Conversation.type == "private",
            cp_a.c.user_id == user_a,
            cp_b.c.user_id == user_b,
        )
        .options(selectinload(Conversation.participants))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_conversation(
    db: AsyncSession, creator_id: uuid.UUID, data: ConversationCreate
) -> Conversation:
    if data.type == "private":
        other_id = data.participant_ids[0]
        existing = await find_private_conversation(db, creator_id, other_id)
        if existing:
            return existing

    conv = Conversation(type=data.type, name=data.name)
    db.add(conv)
    await db.flush()

    participant_ids = set(data.participant_ids) | {creator_id}
    for uid in participant_ids:
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=uid))

    await db.commit()
    await db.refresh(conv)

    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv.id)
        .options(selectinload(Conversation.participants))
    )
    return result.scalar_one()


async def rename_group(
    db: AsyncSession, conversation_id: uuid.UUID, name: str
) -> Conversation:
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(name=name)
    )
    await db.commit()
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.participants))
    )
    return result.scalar_one()


async def add_participants(
    db: AsyncSession, conversation_id: uuid.UUID, user_ids: list[uuid.UUID]
) -> Conversation:
    result = await db.execute(
        select(ConversationParticipant.user_id)
        .where(ConversationParticipant.conversation_id == conversation_id)
    )
    existing_ids = {row[0] for row in result.all()}

    for uid in user_ids:
        if uid not in existing_ids:
            db.add(ConversationParticipant(conversation_id=conversation_id, user_id=uid))

    await db.commit()
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.participants))
    )
    return result.scalar_one()


async def remove_participant(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[Conversation]:
    await db.execute(
        delete(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    )
    await db.commit()

    count_result = await db.execute(
        select(func.count())
        .select_from(ConversationParticipant)
        .where(ConversationParticipant.conversation_id == conversation_id)
    )
    remaining = count_result.scalar() or 0

    if remaining == 0:
        await db.execute(delete(Conversation).where(Conversation.id == conversation_id))
        await db.commit()
        return None

    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.participants))
    )
    return result.scalar_one_or_none()


async def mark_conversation_as_read(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    await db.execute(
        update(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_id != user_id,
            Message.status == "sent",
        )
        .values(status="read")
    )
    await db.commit()
