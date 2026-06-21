"""
Teste de carga — H24
Simula usuários simultâneos fazendo login, enviando mensagens e listando conversas.
Alvo: http://localhost (nginx → chat-service-1 e chat-service-2 via round-robin)

Execução headless:
  locust -f locustfile.py --headless -u 10 -r 2 --run-time 60s --host http://localhost

Critérios esperados:
  - Taxa de erro < 1%
  - P95 latência REST < 500 ms
"""
import random
import uuid

from locust import HttpUser, between, task


class ChatUser(HttpUser):
    wait_time = between(1, 2)

    # ── Inicialização do usuário virtual ──────────────────────────────────────

    def on_start(self) -> None:
        uid = str(uuid.uuid4())[:8]
        self.email = f"load_{uid}@example.com"
        self.password = "senha123"

        # Registra (primeiro acesso) ou faz login (retry)
        resp = self.client.post(
            "/api/auth/register",
            json={"username": f"load_{uid}", "email": self.email, "password": self.password},
            name="/api/auth/register",
        )
        if resp.status_code == 201:
            data = resp.json()["data"]
        else:
            resp = self.client.post(
                "/api/auth/login",
                json={"email": self.email, "password": self.password},
                name="/api/auth/login [retry]",
            )
            data = resp.json().get("data", {})

        self.token = data.get("token", "")
        self.headers = {"Authorization": f"Bearer {self.token}"}

        # Cria uma conversa privada com um parceiro fictício para as tasks de mensagem
        other_id = str(uuid.uuid4())
        resp = self.client.post(
            "/api/chat/conversations",
            json={"type": "private", "participantIds": [other_id]},
            headers=self.headers,
            name="/api/chat/conversations [create]",
        )
        self.conv_id = resp.json().get("data", {}).get("id") if resp.status_code == 201 else None

    # ── Tasks ─────────────────────────────────────────────────────────────────

    @task(3)
    def send_message(self) -> None:
        if not self.conv_id:
            return
        self.client.post(
            "/api/chat/messages",
            json={
                "conversationId": self.conv_id,
                "content": f"msg-{random.randint(1, 9999)}",
                "type": "text",
            },
            headers=self.headers,
            name="/api/chat/messages [send]",
        )

    @task(1)
    def get_conversations(self) -> None:
        self.client.get(
            "/api/chat/conversations",
            headers=self.headers,
            name="/api/chat/conversations [list]",
        )

    @task(1)
    def get_messages(self) -> None:
        if not self.conv_id:
            return
        self.client.get(
            f"/api/chat/conversations/{self.conv_id}/messages",
            headers=self.headers,
            name="/api/chat/conversations/{id}/messages",
        )
