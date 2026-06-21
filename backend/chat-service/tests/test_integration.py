"""
Testes de integração do Chat Service.
Exercitam a pilha completa: HTTP → FastAPI → PostgreSQL.
Usam httpx.Client (síncrono) contra o servidor real na porta 8000.
"""
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from jose import jwt

from app.config import settings

BASE_URL = "http://localhost:8000"


def make_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.JWT_SECRET,
        algorithm="HS256",
    )


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE_URL) as c:
        yield c


@pytest.fixture(scope="module")
def user_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture(scope="module")
def other_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture(scope="module")
def token(user_id) -> str:
    return make_token(user_id)


# ── /health ───────────────────────────────────────────────────────────────────

def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ── /conversations (sem autenticação) ────────────────────────────────────────

def test_list_conversations_unauthenticated_returns_401(client):
    resp = client.get("/conversations")
    assert resp.status_code == 401


# ── /conversations (autenticado, estado limpo) ────────────────────────────────

def test_list_conversations_new_user_returns_empty(client, token):
    resp = client.get("/conversations", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_create_private_conversation(client, token, user_id, other_id):
    resp = client.post(
        "/conversations",
        json={"type": "private", "participantIds": [str(other_id)]},
        headers=auth(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["type"] == "private"
    participant_ids = [p["id"] for p in body["data"]["participants"]]
    assert str(user_id) in participant_ids
    assert str(other_id) in participant_ids


def test_create_group_conversation(client, token, other_id):
    resp = client.post(
        "/conversations",
        json={"type": "group", "name": "Test Group", "participantIds": [str(other_id)]},
        headers=auth(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["data"]["type"] == "group"
    assert body["data"]["name"] == "Test Group"


def test_create_group_without_name_returns_422(client, token, other_id):
    resp = client.post(
        "/conversations",
        json={"type": "group", "participantIds": [str(other_id)]},
        headers=auth(token),
    )
    assert resp.status_code == 422


def test_create_private_with_two_participants_returns_422(client, token, other_id):
    resp = client.post(
        "/conversations",
        json={"type": "private", "participantIds": [str(other_id), str(uuid.uuid4())]},
        headers=auth(token),
    )
    assert resp.status_code == 422


def test_get_conversation_by_id(client, token, other_id):
    create = client.post(
        "/conversations",
        json={"type": "private", "participantIds": [str(other_id)]},
        headers=auth(token),
    )
    # Pode retornar 201 (criada) ou 200 se já existir conversa privada
    assert create.status_code in (200, 201)
    conv_id = create.json()["data"]["id"]

    resp = client.get(f"/conversations/{conv_id}", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == conv_id


def test_get_nonexistent_conversation_returns_404(client, token):
    resp = client.get(f"/conversations/{uuid.uuid4()}", headers=auth(token))
    assert resp.status_code == 404


def test_get_conversation_not_participant_returns_403(client, token):
    other_token = make_token(uuid.uuid4())
    third_id = uuid.uuid4()
    create = client.post(
        "/conversations",
        json={"type": "private", "participantIds": [str(third_id)]},
        headers=auth(other_token),
    )
    assert create.status_code == 201
    conv_id = create.json()["data"]["id"]

    resp = client.get(f"/conversations/{conv_id}", headers=auth(token))
    assert resp.status_code == 403


# ── /messages ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def conv_id(client, token, other_id):
    """Conversa privada reutilizada nos testes de mensagem."""
    resp = client.post(
        "/conversations",
        json={"type": "private", "participantIds": [str(other_id)]},
        headers=auth(token),
    )
    return resp.json()["data"]["id"]


def test_send_message_returns_201(client, token, conv_id):
    resp = client.post(
        "/messages",
        json={"conversationId": conv_id, "content": "Olá!", "type": "text"},
        headers=auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["content"] == "Olá!"
    assert data["type"] == "text"


def test_send_message_persists_in_list(client, token, conv_id):
    client.post(
        "/messages",
        json={"conversationId": conv_id, "content": "Persistido!", "type": "text"},
        headers=auth(token),
    )
    resp = client.get(f"/conversations/{conv_id}/messages", headers=auth(token))
    assert resp.status_code == 200
    contents = [m["content"] for m in resp.json()["data"]]
    assert "Persistido!" in contents


def test_send_empty_message_returns_422(client, token, conv_id):
    resp = client.post(
        "/messages",
        json={"conversationId": conv_id, "content": "   "},
        headers=auth(token),
    )
    assert resp.status_code == 422


def test_non_participant_cannot_send_message(client, conv_id):
    outsider_token = make_token(uuid.uuid4())
    resp = client.post(
        "/messages",
        json={"conversationId": conv_id, "content": "Intruso"},
        headers=auth(outsider_token),
    )
    assert resp.status_code == 403


def test_list_messages_not_participant_returns_403(client, token):
    other_token = make_token(uuid.uuid4())
    create = client.post(
        "/conversations",
        json={"type": "private", "participantIds": [str(uuid.uuid4())]},
        headers=auth(other_token),
    )
    conv_id = create.json()["data"]["id"]
    resp = client.get(f"/conversations/{conv_id}/messages", headers=auth(token))
    assert resp.status_code == 403
