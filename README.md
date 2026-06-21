# Sistema de Chat Distribuído

Trabalho prático da disciplina **Sistemas Distribuídos** — CEFET-MG 2026/1

## Visão Geral

Sistema de chat em tempo real com arquitetura de microsserviços, demonstrando:

- Comunicação entre serviços independentes (Auth Service + Chat Service)
- WebSocket com escala horizontal via Redis Pub/Sub
- Load balancing com Nginx (round-robin entre duas instâncias)
- Persistência distribuída em dois bancos PostgreSQL independentes

```
Browser
  └── Nginx :80
        ├── /api/auth/*  →  Auth Service (FastAPI + PostgreSQL)
        ├── /api/chat/*  →  Chat Service 1 ou 2 (round-robin)
        └── /ws          →  Chat Service 1 ou 2 (WebSocket)
                              └── Redis Pub/Sub (broadcast cross-instância)
```

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) >= 24
- `docker compose` plugin (incluído no Docker Desktop)
- Python 3.8+ (apenas para rodar o smoke test e o teste de carga localmente)

## Subir o ambiente

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` se quiser trocar as senhas. Os valores padrão funcionam para desenvolvimento local.

### 2. Subir todos os serviços

```bash
docker compose up --build -d
```

O primeiro build leva alguns minutos. Aguarde todos os serviços ficarem `healthy`:

```bash
docker compose ps
```

### 3. Verificar que tudo subiu

```bash
curl http://localhost/api/auth/health   # {"status":"ok","service":"auth"}
curl http://localhost/api/chat/health   # {"status":"ok","service":"chat","instance":"chat-service-1"}
```

O frontend está disponível em: **http://localhost**

## Executar os testes

### Testes unitários — Auth Service

```bash
docker compose exec auth-service python -m pytest tests/ -v
```

### Testes unitários — Chat Service

```bash
docker compose exec chat-service-1 python -m pytest tests/ -v
```

### Testes de integração — Auth Service

```bash
docker compose exec auth-service python -m pytest tests/test_integration.py -v
```

### Testes de integração — Chat Service

```bash
docker compose exec chat-service-1 python -m pytest tests/test_integration.py -v
```

### Smoke test end-to-end

Valida os 12 passos do roteiro completo (registro, busca, conversa, mensagens, grupo, segurança, load balancer):

```bash
pip install httpx
python backend/tests/smoke/smoke_test.py
```

### Teste de carga (Locust)

Simula 10 usuários simultâneos por 60 segundos:

```bash
pip install locust
cd backend/tests/load
locust -f locustfile.py --headless -u 10 -r 2 --run-time 60s --host http://localhost --html results.html
```

Relatório HTML gerado em `backend/tests/load/results.html`.

## Resultados dos testes

| Suite | Testes | Resultado |
|---|---|---|
| Unitários — Auth Service | 19 | 100% passou |
| Unitários — Chat Service | 24 | 100% passou |
| Integração — Auth Service | 16 | 100% passou |
| Integração — Chat Service | 15 | 100% passou |
| Smoke test E2E | 12 passos | 100% passou |
| Carga (Locust 10 users / 60s) | 389 reqs | 0% erro, P95 < 100ms |

## Arquitetura dos serviços

| Serviço | Tecnologia | Porta interna |
|---|---|---|
| Auth Service | FastAPI + asyncpg + bcrypt + JWT | 8000 |
| Chat Service (x2) | FastAPI + asyncpg + Redis Pub/Sub + WebSocket | 8000 |
| PostgreSQL (auth) | postgres:16-alpine | 5432 |
| PostgreSQL (chat) | postgres:16-alpine | 5432 |
| Redis | redis:7-alpine | 6379 |
| Nginx | nginx:1.25-alpine | 80 (exposto) |
| Frontend | React + TypeScript + Vite | 80 (via Nginx) |

## Endpoints principais

### Auth Service (`/api/auth`)

| Método | Path | Descrição |
|---|---|---|
| POST | `/register` | Registrar novo usuário |
| POST | `/login` | Autenticar e receber JWT |
| GET | `/verify` | Verificar token |
| POST | `/logout` | Encerrar sessão |
| GET | `/users/search?query=` | Buscar usuários |
| GET | `/users/{id}` | Obter usuário por ID |

### Chat Service (`/api/chat`)

| Método | Path | Descrição |
|---|---|---|
| GET | `/conversations` | Listar conversas do usuário |
| POST | `/conversations` | Criar conversa privada ou grupo |
| GET | `/conversations/{id}` | Obter conversa |
| GET | `/conversations/{id}/messages` | Histórico paginado |
| POST | `/messages` | Enviar mensagem |
| PUT | `/messages/{id}/read` | Marcar como lida |
| GET | `/users/search?query=` | Buscar usuários (proxy para Auth) |

### WebSocket (`ws://localhost/ws?token=<jwt>`)

Eventos recebidos: `message`, `typing`, `status`, `read`  
Eventos enviados: `typing`, `read`

## Parar o ambiente

```bash
docker compose down          # para os containers
docker compose down -v       # para e remove os volumes (apaga dados)
```

## Estrutura do projeto

```
.
├── backend/
│   ├── auth-service/        # FastAPI — autenticacao e usuarios
│   ├── chat-service/        # FastAPI — conversas, mensagens e WebSocket
│   ├── nginx/               # nginx.conf — proxy reverso e load balancer
│   ├── redis/               # redis.conf
│   └── tests/
│       ├── load/            # Locust — teste de carga
│       └── smoke/           # Smoke test end-to-end
├── frontend/                # React + TypeScript + Vite
├── docs/                    # Documentacao tecnica e historias
├── docker-compose.yml
├── docker-compose.override.yml
└── .env.example
```
