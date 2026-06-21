"""
H25 — Smoke Test End-to-End
Valida os fluxos principais do sistema com dois usuários (Alice e Bob).

Execução:
  python smoke_test.py

Requer o ambiente Docker rodando: docker compose up -d
"""
import io
import sys
import uuid

import httpx

# Garante saida UTF-8 no Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

AUTH = "http://localhost/api/auth"
CHAT = "http://localhost/api/chat"
OK = "[OK]"
FAIL = "[FAIL]"

_errors = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global _errors
    if condition:
        print(f"  {OK} {label}")
    else:
        print(f"  {FAIL} {label}" + (f" - {detail}" if detail else ""))
        _errors += 1


def section(title: str) -> None:
    print(f"\n{'-'*60}")
    print(f"  {title}")
    print(f"{'-'*60}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def register(c: httpx.Client, name: str) -> dict:
    uid = str(uuid.uuid4())[:8]
    resp = c.post(f"{AUTH}/register", json={
        "username": f"{name}_{uid}",
        "email": f"{name.lower()}_{uid}@smoke.example.com",
        "password": "senha123",
    })
    assert resp.status_code == 201, f"register falhou: {resp.text}"
    data = resp.json()["data"]
    return {"token": data["token"], "user": data["user"], "id": data["user"]["id"]}


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Testes ────────────────────────────────────────────────────────────────────

def main() -> None:
    with httpx.Client(timeout=10) as c:

        # ── Passo 1-2: Health checks ──────────────────────────────────────────
        section("Passo 1 · Health checks dos serviços")
        r = c.get("http://localhost/api/auth/health")
        check("Auth Service responde /health", r.status_code == 200)
        r = c.get("http://localhost/api/chat/health")
        check("Chat Service responde /health", r.status_code == 200)
        nginx_instance = r.json().get("instance", "?")
        print(f"         instancia nginx: {nginx_instance}")

        # ── Passo 3: Registro de Alice e Bob ──────────────────────────────────
        section("Passo 2-3 · Registro de Alice e Bob")
        alice = register(c, "Alice")
        check("Alice registrada com sucesso", bool(alice["token"]))
        bob = register(c, "Bob")
        check("Bob registrado com sucesso", bool(bob["token"]))

        # ── Passo 4: Alice busca Bob ──────────────────────────────────────────
        section("Passo 4 · Alice busca Bob")
        bob_username = bob["user"]["username"]
        r = c.get(f"{AUTH}/users/search", params={"query": bob_username[:6]}, headers=headers(alice["token"]))
        check("Busca retorna 200", r.status_code == 200)
        results = r.json()["data"]
        found_bob = any(u["id"] == bob["id"] for u in results)
        check(f"Bob encontrado na busca ({len(results)} resultado(s))", found_bob)
        alice_in_results = any(u["id"] == alice["id"] for u in results)
        check("Alice não aparece nos próprios resultados", not alice_in_results)

        # ── Passo 5: Criar conversa privada ───────────────────────────────────
        section("Passo 5 · Alice cria conversa privada com Bob")
        r = c.post(f"{CHAT}/conversations", json={
            "type": "private",
            "participantIds": [bob["id"]],
        }, headers=headers(alice["token"]))
        check("Conversa criada (201)", r.status_code == 201)
        conv = r.json()["data"]
        conv_id = conv["id"]
        participant_ids = [p["id"] for p in conv["participants"]]
        check("Alice é participante", alice["id"] in participant_ids)
        check("Bob é participante", bob["id"] in participant_ids)

        # ── Passo 6: Alice envia mensagem ─────────────────────────────────────
        section("Passo 6 · Alice envia mensagem para Bob")
        r = c.post(f"{CHAT}/messages", json={
            "conversationId": conv_id,
            "content": "Olá Bob! Tudo bem?",
            "type": "text",
        }, headers=headers(alice["token"]))
        check("Mensagem enviada (201)", r.status_code == 201)
        msg = r.json()["data"]
        check("Conteúdo correto", msg["content"] == "Olá Bob! Tudo bem?")
        check("senderId é Alice", msg["senderId"] == alice["id"])
        check("Status 'sent'", msg["status"] == "sent")

        # ── Passo 7: Bob lê o histórico ───────────────────────────────────────
        section("Passo 7 · Bob acessa o histórico da conversa")
        r = c.get(f"{CHAT}/conversations/{conv_id}/messages", headers=headers(bob["token"]))
        check("Histórico acessível por Bob (200)", r.status_code == 200)
        msgs = r.json()["data"]
        check("Mensagem da Alice no histórico", any(m["content"] == "Olá Bob! Tudo bem?" for m in msgs))

        # Bob responde
        r = c.post(f"{CHAT}/messages", json={
            "conversationId": conv_id,
            "content": "Oi Alice! Tudo ótimo!",
            "type": "text",
        }, headers=headers(bob["token"]))
        check("Bob responde (201)", r.status_code == 201)

        # ── Passo 8: Token Alice válido em /verify ────────────────────────────
        section("Passo 8 · Verificação de token e sessão")
        r = c.get(f"{AUTH}/verify", headers=headers(alice["token"]))
        check("Token de Alice válido no Auth Service", r.status_code == 200)
        r = c.get(f"{AUTH}/verify", headers=headers(bob["token"]))
        check("Token de Bob válido no Auth Service", r.status_code == 200)

        # ── Passo 9: Grupo com Alice e Bob ────────────────────────────────────
        section("Passo 9 · Alice cria grupo com Bob")
        r = c.post(f"{CHAT}/conversations", json={
            "type": "group",
            "name": "Smoke Test Group",
            "participantIds": [bob["id"]],
        }, headers=headers(alice["token"]))
        check("Grupo criado (201)", r.status_code == 201)
        group = r.json()["data"]
        check("Tipo 'group'", group["type"] == "group")
        check("Nome correto", group["name"] == "Smoke Test Group")

        r = c.post(f"{CHAT}/messages", json={
            "conversationId": group["id"],
            "content": "Mensagem no grupo!",
            "type": "text",
        }, headers=headers(alice["token"]))
        check("Mensagem no grupo enviada (201)", r.status_code == 201)

        # ── Passo 10: Reload — histórico preservado ───────────────────────────
        section("Passo 10 · Reload — histórico de mensagens preservado")
        r = c.get(f"{CHAT}/conversations/{conv_id}/messages", headers=headers(alice["token"]))
        check("Histórico acessível após 'reload'", r.status_code == 200)
        msgs_after = r.json()["data"]
        check("Ambas as mensagens persistidas", len(msgs_after) >= 2)

        # ── Passo 11: Segurança — token inválido rejeitado ────────────────────
        section("Passo 11 · Segurança — token inválido rejeitado pelo Chat Service")
        r = c.get(f"{CHAT}/conversations", headers={"Authorization": "Bearer token_invalido"})
        check("Chat Service rejeita token inválido (401)", r.status_code == 401)
        r = c.post(f"{CHAT}/messages", json={
            "conversationId": conv_id,
            "content": "Intruso",
        }, headers={"Authorization": "Bearer token_invalido"})
        check("Envio de mensagem com token inválido rejeitado (401)", r.status_code == 401)

        # ── Passo 12: Load balancer — segunda instância ───────────────────────
        section("Passo 12 · Load balancer — segunda instância do Chat Service")
        instances = set()
        for _ in range(6):
            r = c.get("http://localhost/api/chat/health")
            if r.status_code == 200:
                instances.add(r.json().get("instance", "?"))
        check(
            f"Nginx distribuiu entre instâncias: {sorted(instances)}",
            len(instances) >= 2,
            f"apenas {instances} detectada(s)",
        )

        # ── Resultado final ───────────────────────────────────────────────────
        section("Resultado Final")
        total = 20  # número esperado de checks
        if _errors == 0:
            print(f"  {OK} TODOS OS PASSOS PASSARAM — sistema operacional\n")
        else:
            print(f"  {FAIL} {_errors} check(s) falharam\n")

    sys.exit(_errors)


if __name__ == "__main__":
    main()
