from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel

_camel = ConfigDict(
    from_attributes=True,
    populate_by_name=True,
    alias_generator=to_camel,
)


# ── Message ───────────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    conversation_id: UUID
    content: str
    type: str = "text"

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("content nao pode ser vazio")
        return v


class MessageResponse(BaseModel):
    model_config = _camel

    id: UUID
    conversation_id: UUID
    sender_id: UUID
    content: str
    type: str
    timestamp: datetime
    status: str


# ── Conversation ──────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    type: str
    name: Optional[str] = None
    participant_ids: list[UUID]

    @field_validator("type")
    @classmethod
    def type_must_be_valid(cls, v: str) -> str:
        if v not in ("private", "group"):
            raise ValueError("type deve ser 'private' ou 'group'")
        return v

    @field_validator("name")
    @classmethod
    def group_name_strip(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else v


class ParticipantResponse(BaseModel):
    """Frontend expects {id, joinedAt} — id maps from ConversationParticipant.user_id."""
    model_config = _camel

    id: UUID
    joined_at: datetime


class ConversationResponse(BaseModel):
    model_config = _camel

    id: UUID
    type: str
    name: Optional[str] = None
    avatar: Optional[str] = None
    created_at: datetime
    participants: list[ParticipantResponse] = []
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0


# ── Pagination ────────────────────────────────────────────────────────────────

class PaginatedMessages(BaseModel):
    data: list[MessageResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
