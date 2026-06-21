import type {
  User,
  LoginCredentials,
  RegisterCredentials,
  AuthResponse,
  ApiResponse
} from '../types';
import { apiFetch, AUTH_TOKEN_KEY, AUTH_USER_KEY } from './api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(raw: any): User {
  return {
    id: raw.id,
    username: raw.username,
    email: raw.email,
    avatar: raw.avatar ?? undefined,
    status: raw.status as 'online' | 'offline' | 'away',
    createdAt: new Date(raw.created_at),
    lastSeen: raw.last_seen ? new Date(raw.last_seen) : undefined,
  };
}

class AuthService {
  private readonly tokenKey = AUTH_TOKEN_KEY;
  private readonly userKey = AUTH_USER_KEY;

  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, false); // não redireciona no 401 — credenciais inválidas é erro esperado

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Credenciais inválidas');
      throw new Error(body.detail ?? 'Erro ao fazer login');
    }

    const body = await res.json();
    const user = mapUser(body.data.user);
    this.setToken(body.data.token);
    this.setUser(user);

    return { data: { user, token: body.data.token }, success: true, message: body.message };
  }

  async register(credentials: RegisterCredentials): Promise<ApiResponse<AuthResponse>> {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) throw new Error('Email já cadastrado');
      if (res.status === 422) throw new Error('Dados inválidos');
      throw new Error(body.detail ?? 'Erro ao criar conta');
    }

    const body = await res.json();
    const user = mapUser(body.data.user);
    this.setToken(body.data.token);
    this.setUser(user);

    return { data: { user, token: body.data.token }, success: true, message: body.message };
  }

  async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }, false).catch(() => {});
    }
    this.clearAuth();
  }

  async verifyToken(): Promise<ApiResponse<User>> {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    // redirectOn401=true: token expirado redireciona para /login automaticamente
    const res = await apiFetch('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    }, true);

    if (!res.ok) {
      this.clearAuth();
      throw new Error('Token inválido ou expirado');
    }

    const body = await res.json();
    const user = mapUser(body.data.user);
    this.setUser(user);
    return { data: user, success: true };
  }

  getCurrentUser(): User | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        lastSeen: parsed.lastSeen ? new Date(parsed.lastSeen) : undefined,
      };
    } catch {
      return null;
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // ==================== PRIVATE METHODS ====================

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  private setUser(user: User): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  private clearAuth(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }
}

export const authService = new AuthService();
