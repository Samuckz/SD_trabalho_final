import pytest
from pydantic import ValidationError

from app.schemas import UserCreate


def test_user_create_valid():
    user = UserCreate(username="joao", email="joao@example.com", password="senha123")
    assert user.username == "joao"
    assert user.email == "joao@example.com"


def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(username="joao", email="not-an-email", password="senha123")


def test_user_create_password_too_short():
    with pytest.raises(ValidationError):
        UserCreate(username="joao", email="joao@example.com", password="12345")


def test_user_create_empty_password():
    with pytest.raises(ValidationError):
        UserCreate(username="joao", email="joao@example.com", password="")


def test_user_create_empty_username():
    with pytest.raises(ValidationError):
        UserCreate(username="   ", email="joao@example.com", password="senha123")


def test_user_create_username_stripped():
    user = UserCreate(username="  maria  ", email="maria@example.com", password="senha123")
    assert user.username == "maria"


def test_user_create_password_exactly_6_chars():
    user = UserCreate(username="joao", email="joao@example.com", password="123456")
    assert user.password == "123456"
