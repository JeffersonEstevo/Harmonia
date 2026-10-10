import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "../authStore";

/** monta um JWT "de mentira" (assinatura inválida) só com o payload que a store decodifica */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.assinatura`;
}

describe("authStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it("adoptToken decodifica o payload, guarda o usuário e persiste no localStorage", () => {
    const token = fakeJwt({ sub: "user-123", email: "ana@exemplo.com" });

    useAuthStore.getState().adoptToken(token);

    const state = useAuthStore.getState();
    expect(state.token).toBe(token);
    expect(state.user).toEqual({
      id: "user-123",
      email: "ana@exemplo.com",
      displayName: "ana",
    });
    expect(localStorage.getItem("harmonia.token")).toBe(token);
  });

  it("adoptToken ignora um token malformado sem quebrar nem logar ninguém", () => {
    useAuthStore.getState().adoptToken("isso-nao-e-um-jwt");

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem("harmonia.token")).toBeNull();
  });

  it("logout limpa o estado e o localStorage", () => {
    useAuthStore.getState().adoptToken(fakeJwt({ sub: "u1", email: "b@exemplo.com" }));
    expect(useAuthStore.getState().token).not.toBeNull();

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem("harmonia.token")).toBeNull();
    expect(localStorage.getItem("harmonia.user")).toBeNull();
  });
});
