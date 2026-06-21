from jose import JWTError, jwt

from app.config import settings


def decode_access_token(token: str) -> str:
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise JWTError("sub ausente no token")
    return user_id
