import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.models import User
from app.schemas import UserCreate


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None
    result = await db.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        status="online",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user_status(db: AsyncSession, user: User, status: str) -> User:
    from datetime import datetime, timezone
    user.status = status
    if status == "offline":
        user.last_seen = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


async def search_users(
    db: AsyncSession, query: str, exclude_user_id: uuid.UUID
) -> list[User]:
    pattern = f"%{query}%"
    result = await db.execute(
        select(User)
        .where(
            User.id != exclude_user_id,
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
            ),
        )
        .order_by(User.username)
        .limit(20)
    )
    return list(result.scalars().all())
