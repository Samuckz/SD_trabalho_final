import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas import (
    ConversationCreate,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
    ParticipantResponse,
)

_NOW = datetime.now(timezone.utc)
_UUID = uuid.uuid4()


# ── MessageCreate ─────────────────────────────────────────────────────────────

def test_message_create_valid():
    msg = MessageCreate(conversation_id=_UUID, content="Olá", type="text")
    assert msg.content == "Olá"
    assert msg.type == "text"


def test_message_create_accepts_camel_case_input():
    msg = MessageCreate(conversationId=str(_UUID), content="Oi")
    assert msg.conversation_id == _UUID


def test_message_create_empty_content():
    with pytest.raises(ValidationError):
        MessageCreate(conversation_id=_UUID, content="")


def test_message_create_whitespace_content():
    with pytest.raises(ValidationError):
        MessageCreate(conversation_id=_UUID, content="   ")


def test_message_create_default_type_is_text():
    msg = MessageCreate(conversation_id=_UUID, content="oi")
    assert msg.type == "text"


# ── ConversationCreate ────────────────────────────────────────────────────────

def test_conversation_create_valid_private():
    conv = ConversationCreate(type="private", participant_ids=[_UUID])
    assert conv.type == "private"


def test_conversation_create_valid_group():
    conv = ConversationCreate(type="group", name="Squad", participant_ids=[_UUID, uuid.uuid4()])
    assert conv.type == "group"
    assert conv.name == "Squad"


def test_conversation_create_invalid_type():
    with pytest.raises(ValidationError):
        ConversationCreate(type="channel", participant_ids=[_UUID])


def test_conversation_create_name_stripped():
    conv = ConversationCreate(type="group", name="  Dev Team  ", participant_ids=[_UUID])
    assert conv.name == "Dev Team"


def test_conversation_create_accepts_camel_participant_ids():
    conv = ConversationCreate(participantIds=[str(_UUID)], type="private")
    assert conv.participant_ids == [_UUID]


# ── MessageResponse (serialization) ──────────────────────────────────────────

def test_message_response_camel_case_keys():
    msg = MessageResponse(
        id=_UUID,
        conversation_id=_UUID,
        sender_id=_UUID,
        content="Hello",
        type="text",
        timestamp=_NOW,
        status="sent",
    )
    data = msg.model_dump(by_alias=True, mode="json")
    assert "conversationId" in data
    assert "senderId" in data
    assert "conversation_id" not in data
    assert "sender_id" not in data


# ── ConversationResponse (serialization) ──────────────────────────────────────

def test_conversation_response_camel_case_keys():
    conv = ConversationResponse(
        id=_UUID,
        type="private",
        created_at=_NOW,
        participants=[],
    )
    data = conv.model_dump(by_alias=True, mode="json")
    assert "createdAt" in data
    assert "unreadCount" in data
    assert "created_at" not in data


def test_conversation_response_defaults():
    conv = ConversationResponse(id=_UUID, type="group", created_at=_NOW)
    assert conv.participants == []
    assert conv.unread_count == 0
    assert conv.name is None
