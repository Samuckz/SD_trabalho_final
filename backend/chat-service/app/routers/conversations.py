import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.conversations import (
    add_participants,
    create_conversation,
    get_conversation_by_id,
    get_user_conversations,
    mark_conversation_as_read,
    remove_participant,
    rename_group,
)
from app.database import get_db
from app.dependencies import get_current_user_id
from app.schemas import (
    AddParticipantsRequest,
    ConversationCreate,
    ConversationResponse,
    MessageResponse,
    ParticipantResponse,
    RenameGroupRequest,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _build_conversation_response(
    conv, last_msg=None, unread_count: int = 0
) -> dict:
    return ConversationResponse(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar=conv.avatar,
        created_at=conv.created_at,
        participants=[
            ParticipantResponse(id=p.user_id, joined_at=p.joined_at)
            for p in conv.participants
        ],
        last_message=MessageResponse.model_validate(last_msg) if last_msg else None,
        unread_count=unread_count,
    ).model_dump(by_alias=True, mode="json")


@router.get("")
async def list_conversations(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    convs = await get_user_conversations(db, user_id)
    data = [_build_conversation_response(conv, last_msg, unread) for conv, last_msg, unread in convs]
    return {"success": True, "data": data}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_conv(
    body: ConversationCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if body.type == "private" and len(body.participant_ids) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Conversa privada requer exatamente 1 participantId",
        )
    if body.type == "group" and not body.name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Grupo requer um nome",
        )

    conv = await create_conversation(db, user_id, body)
    return {
        "success": True,
        "message": "Conversa criada com sucesso",
        "data": _build_conversation_response(conv),
    }


@router.get("/{conversation_id}")
async def get_conv(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation_by_id(db, conversation_id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa nao encontrada")

    participant_ids = {p.user_id for p in conv.participants}
    if user_id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    return {"success": True, "data": _build_conversation_response(conv)}


@router.put("/{conversation_id}/name")
async def rename_group_endpoint(
    conversation_id: uuid.UUID,
    body: RenameGroupRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation_by_id(db, conversation_id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa nao encontrada")
    if conv.type != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Apenas grupos podem ser renomeados")
    if user_id not in {p.user_id for p in conv.participants}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    updated = await rename_group(db, conversation_id, body.name)
    return {"success": True, "data": _build_conversation_response(updated)}


@router.post("/{conversation_id}/participants")
async def add_participants_endpoint(
    conversation_id: uuid.UUID,
    body: AddParticipantsRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation_by_id(db, conversation_id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa nao encontrada")
    if conv.type != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e um grupo")
    if user_id not in {p.user_id for p in conv.participants}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
    if len(conv.participants) + len(body.participant_ids) > 50:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Limite de 50 participantes atingido")

    updated = await add_participants(db, conversation_id, body.participant_ids)
    return {"success": True, "data": _build_conversation_response(updated)}


@router.delete("/{conversation_id}/participants/{target_user_id}")
async def remove_participant_endpoint(
    conversation_id: uuid.UUID,
    target_user_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation_by_id(db, conversation_id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa nao encontrada")
    if conv.type != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e um grupo")
    if user_id not in {p.user_id for p in conv.participants}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    updated = await remove_participant(db, conversation_id, target_user_id)
    if updated is None:
        return {"success": True, "data": None}
    return {"success": True, "data": _build_conversation_response(updated)}


@router.post("/{conversation_id}/leave")
async def leave_group_endpoint(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation_by_id(db, conversation_id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa nao encontrada")
    if conv.type != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e um grupo")
    if user_id not in {p.user_id for p in conv.participants}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Voce nao e membro deste grupo")

    await remove_participant(db, conversation_id, user_id)
    return {"success": True}


@router.put("/{conversation_id}/read")
async def mark_as_read(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    conv = await get_conversation_by_id(db, conversation_id)
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa nao encontrada")

    participant_ids = {p.user_id for p in conv.participants}
    if user_id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    await mark_conversation_as_read(db, conversation_id, user_id)
    return {"success": True}
