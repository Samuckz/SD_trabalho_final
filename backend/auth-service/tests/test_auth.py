from datetime import datetime, timedelta, timezone

import pytest
from jose import JWTError, jwt

from app.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.config import settings


def test_hash_password_creates_bcrypt_hash():
    hashed = hash_password("mysecret")
    assert hashed.startswith("$2b$")
    assert hashed != "mysecret"


def test_hash_password_same_input_produces_different_hashes():
    h1 = hash_password("password")
    h2 = hash_password("password")
    assert h1 != h2  # bcrypt usa salt aleatório


def test_verify_password_correct():
    hashed = hash_password("correct_password")
    assert verify_password("correct_password", hashed) is True


def test_verify_password_wrong():
    hashed = hash_password("correct_password")
    assert verify_password("wrong_password", hashed) is False


def test_verify_password_empty_against_hash():
    hashed = hash_password("secret")
    assert verify_password("", hashed) is False


def test_create_access_token_returns_valid_jwt():
    token = create_access_token("user-123")
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    assert payload["sub"] == "user-123"
    assert "exp" in payload


def test_create_access_token_exp_is_in_the_future():
    token = create_access_token("user-abc")
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    assert exp > datetime.now(timezone.utc)


def test_decode_access_token_valid():
    token = create_access_token("user-abc")
    user_id = decode_access_token(token)
    assert user_id == "user-abc"


def test_decode_access_token_expired():
    expire = datetime.now(timezone.utc) - timedelta(seconds=1)
    token = jwt.encode(
        {"sub": "user-xyz", "exp": expire},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(JWTError):
        decode_access_token(token)


def test_decode_access_token_tampered():
    token = create_access_token("user-tampered")
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".invalidsignature"
    with pytest.raises(JWTError):
        decode_access_token(tampered)


def test_decode_access_token_wrong_secret():
    token = jwt.encode({"sub": "user-x", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, "wrong-secret", algorithm="HS256")
    with pytest.raises(JWTError):
        decode_access_token(token)


def test_decode_access_token_missing_sub():
    token = jwt.encode({"exp": datetime.now(timezone.utc) + timedelta(hours=1)}, settings.JWT_SECRET, algorithm="HS256")
    with pytest.raises(JWTError):
        decode_access_token(token)
