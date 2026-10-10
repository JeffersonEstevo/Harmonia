/**
 * Google OAuth sem credenciais configuradas: as rotas devem responder 501
 * com uma mensagem clara em vez de quebrar ou redirecionar pra um client_id
 * vazio. Não depende de Postgres. O fluxo COMPLETO com o Google de verdade
 * precisa de GOOGLE_CLIENT_ID/SECRET reais — ver .env.example.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Google OAuth sem credenciais", () => {
  it("GET /api/auth/google responde 501 com mensagem explicativa", async () => {
    const res = await request(createApp()).get("/api/auth/google");

    expect(res.status).toBe(501);
    expect(res.body.error).toContain("GOOGLE_CLIENT_ID");
  });

  it("GET /api/auth/google/callback responde 501 (não tenta falar com o Google)", async () => {
    const res = await request(createApp()).get("/api/auth/google/callback?code=qualquer");

    expect(res.status).toBe(501);
  });
});
