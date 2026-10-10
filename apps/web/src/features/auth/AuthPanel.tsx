import { useState, type FormEvent } from "react";
import { useAuthStore } from "../../stores/authStore";
import { googleLoginUrl } from "../../lib/apiClient";
import "./AuthPanel.css";

interface Props {
  onOpenLibrary: () => void;
  libraryOpen: boolean;
}

export function AuthPanel({ onOpenLibrary, libraryOpen }: Props) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const errorMessage = useAuthStore((s) => s.errorMessage);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);

  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok =
      mode === "login"
        ? await login(email, password)
        : await register(email, password, displayName);
    if (ok) {
      setFormOpen(false);
      setPassword("");
    }
  };

  if (user) {
    return (
      <div className="auth-panel auth-panel--logged-in">
        <span className="auth-panel__name">{user.displayName}</span>
        <button
          type="button"
          className={`auth-panel__button ${libraryOpen ? "auth-panel__button--active" : ""}`}
          onClick={onOpenLibrary}
        >
          Minha biblioteca
        </button>
        <button type="button" className="auth-panel__button" onClick={logout}>
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      {!formOpen && (
        <button type="button" className="auth-panel__button" onClick={() => setFormOpen(true)}>
          Entrar
        </button>
      )}

      {formOpen && (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "auth-form__tab--active" : ""}
              onClick={() => setMode("login")}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "auth-form__tab--active" : ""}
              onClick={() => setMode("register")}
            >
              Criar conta
            </button>
          </div>

          {mode === "register" && (
            <input
              type="text"
              placeholder="Seu nome"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Senha (mín. 8 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {errorMessage && (
            <p className="auth-form__error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="auth-form__actions">
            <button type="submit" className="auth-panel__button" disabled={status === "loading"}>
              {status === "loading" ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
            <a className="auth-form__google" href={googleLoginUrl()}>
              Entrar com Google
            </a>
            <button
              type="button"
              className="auth-form__cancel"
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
