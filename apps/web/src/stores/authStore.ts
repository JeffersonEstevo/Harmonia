import { create } from "zustand";
import { loginUser, registerUser, type AuthUser } from "../lib/apiClient";

const TOKEN_KEY = "harmonia.token";
const USER_KEY = "harmonia.user";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: "idle" | "loading" | "error";
  errorMessage: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, displayName: string) => Promise<boolean>;
  logout: () => void;
  /** Aceita um token vindo do redirect do Google OAuth (?token=...) */
  adoptToken: (token: string) => void;
}

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** Decodifica o payload do JWT (sem validar assinatura — quem valida é o servidor) */
function decodeJwtPayload(token: string): { sub: string; email: string } | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: readStoredUser(),
  status: "idle",
  errorMessage: null,

  async login(email, password) {
    set({ status: "loading", errorMessage: null });
    try {
      const { token, user } = await loginUser(email, password);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ token, user, status: "idle" });
      return true;
    } catch (err) {
      set({ status: "error", errorMessage: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async register(email, password, displayName) {
    set({ status: "loading", errorMessage: null });
    try {
      const { token, user } = await registerUser(email, password, displayName);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ token, user, status: "idle" });
      return true;
    } catch (err) {
      set({ status: "error", errorMessage: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, status: "idle", errorMessage: null });
  },

  adoptToken(token) {
    const payload = decodeJwtPayload(token);
    if (!payload) return;
    // o callback do Google só devolve o token — o nome de exibição vem do
    // e-mail por ora (um GET /api/auth/me mais completo pode vir depois)
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      displayName: payload.email.split("@")[0],
    };
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, status: "idle", errorMessage: null });
  },
}));
