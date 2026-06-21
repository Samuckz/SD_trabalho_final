from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings

_TIMEOUT = httpx.Timeout(5.0)


async def search_users(query: str, token: str) -> list[dict[str, Any]]:
    """Busca usuários no Auth Service repassando o token do usuário logado."""
    url = f"{settings.AUTH_SERVICE_URL}/users/search"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(url, params={"query": query}, headers=headers)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth Service indisponivel",
        )

    if response.status_code == 401:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido ou expirado")

    if not response.is_success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Erro ao consultar Auth Service",
        )

    body = response.json()
    return body.get("data", [])
