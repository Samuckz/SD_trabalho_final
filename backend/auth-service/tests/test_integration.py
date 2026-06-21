"""
Testes de integração do Auth Service.
Exercitam a pilha completa: HTTP → FastAPI → PostgreSQL.
Usam httpx.Client (síncrono) contra o servidor real na porta 8000.
Cada execução usa sufixo UUID único para evitar colisões entre runs.
"""
import uuid

import httpx
import pytest

RUN = str(uuid.uuid4())[:8]
BASE_URL = "http://localhost:8000"


def make_user(tag: str = "") -> dict:
    return {
        "username": f"u{tag}_{RUN}",
        "email": f"{tag}_{RUN}@example.com",
        "password": "senha123",
    }


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE_URL) as c:
        yield c


@pytest.fixture(scope="module")
def registered(client):
    """Registra um usuário de base e retorna {token, user}."""
    resp = client.post("/register", json=make_user("base"))
    assert resp.status_code == 201
    return resp.json()["data"]


# ── /register ─────────────────────────────────────────────────────────────────

def test_register_returns_201_and_token(client):
    resp = client.post("/register", json=make_user("reg"))
    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert "token" in body["data"]
    assert "user" in body["data"]


def test_register_duplicate_email_returns_409(client):
    data = make_user("dup")
    client.post("/register", json=data)
    resp = client.post("/register", json=data)
    assert resp.status_code == 409


def test_register_short_password_returns_422(client):
    resp = client.post(
        "/register",
        json={"username": f"u_{RUN}", "email": f"shortpw_{RUN}@example.com", "password": "abc"},
    )
    assert resp.status_code == 422


def test_register_invalid_email_returns_422(client):
    resp = client.post(
        "/register",
        json={"username": f"u_{RUN}", "email": "not-an-email-at-all", "password": "senha123"},
    )
    assert resp.status_code == 422


# ── /login ────────────────────────────────────────────────────────────────────

def test_login_valid_credentials_returns_token(client):
    data = make_user("login")
    client.post("/register", json=data)
    resp = client.post("/login", json={"email": data["email"], "password": data["password"]})
    assert resp.status_code == 200
    assert "token" in resp.json()["data"]


def test_login_wrong_password_returns_401(client):
    data = make_user("wrongpw")
    client.post("/register", json=data)
    resp = client.post("/login", json={"email": data["email"], "password": "errada123"})
    assert resp.status_code == 401


def test_login_unknown_email_returns_401(client):
    resp = client.post(
        "/login", json={"email": f"nobody_{RUN}@example.com", "password": "senha123"}
    )
    assert resp.status_code == 401


# ── /verify ───────────────────────────────────────────────────────────────────

def test_verify_valid_token_returns_200(client, registered):
    token = registered["token"]
    resp = client.get("/verify", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_verify_invalid_token_returns_401(client):
    resp = client.get("/verify", headers={"Authorization": "Bearer bogus.token.here"})
    assert resp.status_code == 401


def test_verify_missing_auth_header_returns_403(client):
    resp = client.get("/verify")
    assert resp.status_code == 403


# ── /logout ───────────────────────────────────────────────────────────────────

def test_logout_returns_200(client, registered):
    token = registered["token"]
    resp = client.post("/logout", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ── /users/search ─────────────────────────────────────────────────────────────

def test_search_empty_query_returns_empty_list(client, registered):
    token = registered["token"]
    resp = client.get("/users/search?query=", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_search_returns_matching_users(client, registered):
    token = registered["token"]
    other = make_user("searchable")
    client.post("/register", json=other)
    resp = client.get(f"/users/search?query={RUN}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert isinstance(data, list)
    assert any(u["email"].endswith("@example.com") for u in data)


def test_search_excludes_current_user(client, registered):
    token = registered["token"]
    current_id = registered["user"]["id"]
    resp = client.get(f"/users/search?query={RUN}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ids = [u["id"] for u in resp.json()["data"]]
    assert current_id not in ids


# ── /users/{user_id} ──────────────────────────────────────────────────────────

def test_get_user_by_id_returns_user(client, registered):
    token = registered["token"]
    user_id = registered["user"]["id"]
    resp = client.get(f"/users/{user_id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == user_id


def test_get_user_not_found_returns_404(client, registered):
    token = registered["token"]
    fake_id = str(uuid.uuid4())
    resp = client.get(f"/users/{fake_id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
