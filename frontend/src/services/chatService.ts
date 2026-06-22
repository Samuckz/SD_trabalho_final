import type {
  Conversation,
  Message,
  CreateConversationDTO,
  SendMessageDTO,
  ApiResponse,
  PaginatedResponse,
  User
} from '../types';
import { apiFetch, AUTH_TOKEN_KEY } from './api';

// Cache de usuários para evitar chamadas repetidas ao Auth Service
const userCache = new Map<string, User>();

function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessage(raw: any): Message {
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    senderId: raw.senderId,
    content: raw.content,
    type: (raw.type ?? 'text') as 'text' | 'image' | 'file',
    timestamp: new Date(raw.timestamp),
    status: (raw.status ?? 'sent') as 'sent' | 'delivered' | 'read',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUserRaw(raw: any): User {
  return {
    id: raw.id,
    username: raw.username,
    email: raw.email,
    avatar: raw.avatar ?? undefined,
    status: (raw.status ?? 'offline') as 'online' | 'offline' | 'away',
    createdAt: new Date(raw.createdAt),
    lastSeen: raw.lastSeen ? new Date(raw.lastSeen) : undefined,
  };
}

async function fetchUserById(userId: string): Promise<User> {
  if (userCache.has(userId)) return userCache.get(userId)!;

  try {
    const res = await apiFetch(`/auth/users/${userId}`, {
      headers: authHeader(),
    }, false);

    if (res.ok) {
      const body = await res.json();
      const user = mapUserRaw(body.data);
      userCache.set(userId, user);
      return user;
    }
  } catch { /* ignora erros de rede */ }

  // Fallback se usuário não encontrado
  return { id: userId, username: 'Usuário', email: '', status: 'offline', createdAt: new Date() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapConversation(raw: any): Promise<Conversation> {
  const participants = await Promise.all(
    (raw.participants ?? []).map((p: { id: string }) => fetchUserById(p.id))
  );

  return {
    id: raw.id,
    type: raw.type as 'private' | 'group',
    name: raw.name ?? undefined,
    avatar: raw.avatar ?? undefined,
    createdAt: new Date(raw.createdAt),
    participants,
    lastMessage: raw.lastMessage ? mapMessage(raw.lastMessage) : undefined,
    unreadCount: raw.unreadCount ?? 0,
  };
}

class ChatService {
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    const res = await apiFetch('/chat/conversations', { headers: authHeader() });

    if (!res.ok) throw new Error('Erro ao carregar conversas');

    const body = await res.json();
    const conversations = await Promise.all(
      (body.data ?? []).map(mapConversation)
    );

    return { data: conversations, success: true };
  }

  async getConversation(id: string): Promise<ApiResponse<Conversation>> {
    const res = await apiFetch(`/chat/conversations/${id}`, { headers: authHeader() });

    if (!res.ok) throw new Error('Conversa não encontrada');

    const body = await res.json();
    const conversation = await mapConversation(body.data);
    return { data: conversation, success: true };
  }

  async createConversation(dto: CreateConversationDTO): Promise<ApiResponse<Conversation>> {
    const res = await apiFetch('/chat/conversations', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({
        type: dto.type,
        name: dto.name,
        participantIds: dto.participantIds,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? 'Erro ao criar conversa');
    }

    const body = await res.json();
    const conversation = await mapConversation(body.data);
    return { data: conversation, success: true, message: body.message };
  }

  async getMessages(
    conversationId: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<Message>> {
    const res = await apiFetch(
      `/chat/conversations/${conversationId}/messages?page=${page}&pageSize=${pageSize}`,
      { headers: authHeader() }
    );

    if (!res.ok) throw new Error('Erro ao carregar mensagens');

    const body = await res.json();
    const messages: Message[] = (body.data ?? []).map(mapMessage).reverse();

    return {
      data: messages,
      total: body.total ?? messages.length,
      page: body.page ?? page,
      pageSize: body.pageSize ?? pageSize,
    };
  }

  async sendMessage(dto: SendMessageDTO): Promise<ApiResponse<Message>> {
    const res = await apiFetch('/chat/messages', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({
        conversationId: dto.conversationId,
        content: dto.content,
        type: dto.type ?? 'text',
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? 'Erro ao enviar mensagem');
    }

    const body = await res.json();
    return { data: mapMessage(body.data), success: true };
  }

  async markAsRead(messageId: string): Promise<ApiResponse<void>> {
    await apiFetch(`/chat/messages/${messageId}/read`, {
      method: 'PUT',
      headers: authHeader(),
    }, false).catch(() => {});

    return { data: undefined, success: true };
  }

  async markConversationAsRead(conversationId: string): Promise<ApiResponse<void>> {
    await apiFetch(`/chat/conversations/${conversationId}/read`, {
      method: 'PUT',
      headers: authHeader(),
    }, false).catch(() => {});

    return { data: undefined, success: true };
  }

  async renameGroup(id: string, name: string): Promise<ApiResponse<Conversation>> {
    const res = await apiFetch(`/chat/conversations/${id}/name`, {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Erro ao renomear grupo');
    const body = await res.json();
    return { data: await mapConversation(body.data), success: true };
  }

  async addParticipants(id: string, participantIds: string[]): Promise<ApiResponse<Conversation>> {
    const res = await apiFetch(`/chat/conversations/${id}/participants`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ participantIds }),
    });
    if (!res.ok) throw new Error('Erro ao adicionar participantes');
    const body = await res.json();
    return { data: await mapConversation(body.data), success: true };
  }

  async removeParticipant(id: string, userId: string): Promise<ApiResponse<Conversation | null>> {
    const res = await apiFetch(`/chat/conversations/${id}/participants/${userId}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    if (!res.ok) throw new Error('Erro ao remover participante');
    const body = await res.json();
    const data = body.data ? await mapConversation(body.data) : null;
    return { data, success: true };
  }

  async leaveGroup(id: string): Promise<ApiResponse<void>> {
    const res = await apiFetch(`/chat/conversations/${id}/leave`, {
      method: 'POST',
      headers: authHeader(),
    });
    if (!res.ok) throw new Error('Erro ao sair do grupo');
    return { data: undefined, success: true };
  }

  async searchUsers(query: string): Promise<ApiResponse<User[]>> {
    if (!query.trim()) return { data: [], success: true };

    const res = await apiFetch(
      `/chat/users/search?query=${encodeURIComponent(query)}`,
      { headers: authHeader() }
    );

    if (!res.ok) return { data: [], success: false };

    const body = await res.json();
    const users: User[] = (body.data ?? []).map(mapUserRaw);

    // Preenche o cache com os resultados da busca
    users.forEach(u => userCache.set(u.id, u));

    return { data: users, success: true };
  }
}

export const chatService = new ChatService();
