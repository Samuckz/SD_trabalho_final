import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.ws_manager import ConnectionManager


@pytest.fixture
def manager():
    return ConnectionManager()


@pytest.fixture
def mock_ws():
    return AsyncMock()


@pytest.fixture
def uid():
    return uuid.uuid4()


async def _connect(manager: ConnectionManager, ws: AsyncMock, user_id: uuid.UUID) -> None:
    with patch.object(manager, "_set_redis_status", new=AsyncMock()):
        await manager.connect(ws, user_id)


async def _disconnect(manager: ConnectionManager, ws: AsyncMock, user_id: uuid.UUID) -> None:
    with patch.object(manager, "_set_redis_status", new=AsyncMock()):
        await manager.disconnect(ws, user_id)


# ── connect ───────────────────────────────────────────────────────────────────

async def test_connect_calls_accept(manager, mock_ws, uid):
    await _connect(manager, mock_ws, uid)
    mock_ws.accept.assert_called_once()


async def test_connect_registers_websocket(manager, mock_ws, uid):
    await _connect(manager, mock_ws, uid)
    assert str(uid) in manager.connections
    assert mock_ws in manager.connections[str(uid)]


async def test_connect_multi_tab_same_user(manager, uid):
    ws1, ws2 = AsyncMock(), AsyncMock()
    await _connect(manager, ws1, uid)
    await _connect(manager, ws2, uid)
    assert len(manager.connections[str(uid)]) == 2


# ── disconnect ────────────────────────────────────────────────────────────────

async def test_disconnect_removes_websocket(manager, mock_ws, uid):
    await _connect(manager, mock_ws, uid)
    await _disconnect(manager, mock_ws, uid)
    assert str(uid) not in manager.connections


async def test_disconnect_last_socket_removes_user_key(manager, mock_ws, uid):
    await _connect(manager, mock_ws, uid)
    await _disconnect(manager, mock_ws, uid)
    assert str(uid) not in manager.connections


async def test_disconnect_one_of_two_sockets(manager, uid):
    ws1, ws2 = AsyncMock(), AsyncMock()
    await _connect(manager, ws1, uid)
    await _connect(manager, ws2, uid)
    await _disconnect(manager, ws1, uid)
    conns = manager.connections.get(str(uid), [])
    assert ws2 in conns
    assert ws1 not in conns


async def test_disconnect_unknown_user_no_error(manager, mock_ws, uid):
    with patch.object(manager, "_set_redis_status", new=AsyncMock()):
        await manager.disconnect(mock_ws, uid)  # não estava conectado


# ── send_to_user ──────────────────────────────────────────────────────────────

async def test_send_to_user_delivers_message(manager, mock_ws, uid):
    await _connect(manager, mock_ws, uid)
    msg = {"type": "message", "payload": {"content": "oi"}}
    await manager.send_to_user(str(uid), msg)
    mock_ws.send_json.assert_called_once_with(msg)


async def test_send_to_user_no_connections_no_error(manager, uid):
    await manager.send_to_user(str(uid), {"type": "message", "payload": {}})


async def test_send_to_user_removes_dead_socket(manager, uid):
    dead_ws = AsyncMock()
    dead_ws.send_json.side_effect = RuntimeError("connection closed")

    await _connect(manager, dead_ws, uid)
    await manager.send_to_user(str(uid), {"type": "ping"})

    conns = manager.connections.get(str(uid), [])
    assert dead_ws not in conns


async def test_send_to_user_multi_tab_delivers_to_all(manager, uid):
    ws1, ws2 = AsyncMock(), AsyncMock()
    await _connect(manager, ws1, uid)
    await _connect(manager, ws2, uid)
    msg = {"type": "message", "payload": {}}
    await manager.send_to_user(str(uid), msg)
    ws1.send_json.assert_called_once_with(msg)
    ws2.send_json.assert_called_once_with(msg)
