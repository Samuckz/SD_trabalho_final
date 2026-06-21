from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> str:
    """Retorna o user_id (sub) do token. Lança JWTError se inválido ou expirado."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise JWTError("sub ausente no token")
    return user_id
