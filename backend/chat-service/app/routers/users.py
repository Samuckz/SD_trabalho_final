import uuid

from fastapi import APIRouter, Depends, Query, Request

from app.dependencies import get_current_user_id
from app.services import auth_client

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
async def search_users(
    request: Request,
    query: str = Query(default=""),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    if not query.strip():
        return {"success": True, "data": []}

    token = request.headers["authorization"].split(" ", 1)[1]
    users = await auth_client.search_users(query.strip(), token)

    current_id = str(user_id)
    filtered = [u for u in users if u.get("id") != current_id]

    return {"success": True, "data": filtered}
