from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, decode_access_token, verify_password
from app.crud import create_user, get_user_by_email, get_user_by_id, search_users, update_user_status
from app.database import get_db
from app.models import User
from app.schemas import AuthResponse, LoginRequest, UserCreate, UserResponse

router = APIRouter(tags=["auth"])
bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido ou expirado")
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario nao encontrado")
    return user


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    if await get_user_by_email(db, data.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ja cadastrado")

    user = await create_user(db, data)
    token = create_access_token(str(user.id))

    return {
        "success": True,
        "message": "Usuario criado com sucesso",
        "data": AuthResponse(user=UserResponse.model_validate(user), token=token),
    }


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais invalidas")

    user = await update_user_status(db, user, "online")
    token = create_access_token(str(user.id))

    return {
        "success": True,
        "message": "Login realizado com sucesso",
        "data": AuthResponse(user=UserResponse.model_validate(user), token=token),
    }


@router.get("/verify")
async def verify(current_user: User = Depends(get_current_user)):
    return {
        "success": True,
        "message": "Token valido",
        "data": {"user": UserResponse.model_validate(current_user)},
    }


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await update_user_status(db, current_user, "offline")
    return {"success": True, "message": "Logout realizado com sucesso"}


@router.get("/users/search")
async def users_search(
    query: str = Query(default=""),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not query.strip():
        return {"success": True, "data": []}

    users = await search_users(db, query.strip(), exclude_user_id=current_user.id)

    data = [
        {
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "avatar": u.avatar,
            "status": u.status,
            "createdAt": u.created_at.isoformat(),
            "lastSeen": u.last_seen.isoformat() if u.last_seen else None,
        }
        for u in users
    ]
    return {"success": True, "data": data}


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    return {
        "success": True,
        "data": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "avatar": user.avatar,
            "status": user.status,
            "createdAt": user.created_at.isoformat(),
            "lastSeen": user.last_seen.isoformat() if user.last_seen else None,
        },
    }
