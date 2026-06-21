const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost/api';

const AUTH_TOKEN_KEY = 'chat_auth_token';
const AUTH_USER_KEY = 'chat_user';

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  redirectOn401 = true
): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Interceptor: sessão expirada → limpa localStorage e redireciona
  if (response.status === 401 && redirectOn401) {
    clearSession();
    window.location.href = '/login';
  }

  return response;
}

export { AUTH_TOKEN_KEY, AUTH_USER_KEY };
