/**
 * Testes de integração de auth + tracks — exigem um Postgres real
 * acessível via DATABASE_URL (ver .env.example). Se não houver um
 * disponível, a suíte inteira é pulada (não falha) — assim `npm test` no
 * monorepo continua funcionando pra quem não tem Postgres configurado
 * localmente; CI/ambientes com Postgres rodam a validação de verdade.
 */
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Precisa ser determinado ANTES de describe.runIf ser avaliado (na coleta
// dos testes) — por isso top-level await, não um beforeAll (que só roda
// depois da coleta já ter decidido se a suíte existe ou não).
let databaseAvailable = false;
try {
  await pool.query("SELECT 1");
  databaseAvailable = true;
  await runMigrations();
} catch {
  console.warn(
    "[test] Postgres indisponível (DATABASE_URL) — pulando testes de integração de auth/tracks.",
  );
}

afterAll(async () => {
  if (databaseAvailable) {
    await pool.query("DELETE FROM users WHERE email LIKE 'vitest-%@example.com'");
  }
  await pool.end();
});

describe.runIf(databaseAvailable)("auth + tracks (integração real com Postgres)", () => {
  const email = `vitest-${Date.now()}@example.com`;
  const password = "senhaDeTeste123";
  let token: string;
  let trackId: string;

  it("registra um novo usuário", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password, displayName: "Vitest User" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    token = res.body.token;
  });

  it("rejeita registro duplicado", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password, displayName: "Duplicado" });

    expect(res.status).toBe(409);
  });

  it("faz login com a senha correta", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app).post("/api/auth/login").send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("rejeita login com senha errada", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "senhaErrada" });

    expect(res.status).toBe(401);
  });

  it("rejeita /me sem token", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("salva uma faixa com análise e lista de volta", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const audioPath = join(__dirname, "fixtures", "tiny.mp3");
    const audioBuffer = readFileSync(audioPath);
    const chordSegments = JSON.stringify([
      { chord: "Bm", onset: 0, offset: 2, confidence: 0.9 },
      { chord: "G", onset: 2, offset: 4, confidence: 0.85 },
    ]);

    const res = await request(app)
      .post("/api/tracks")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Faixa de teste")
      .field("durationSec", "4.0")
      .field("chordSegments", chordSegments)
      .field("key", "D")
      .field("keyScale", "major")
      .field("bpm", "120")
      .field("beatGrid", "[0.5,1.0]")
      .attach("file", audioBuffer, { filename: "tiny.mp3", contentType: "audio/mpeg" });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Faixa de teste");
    trackId = res.body.id;

    const listRes = await request(app).get("/api/tracks").set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((t: { id: string }) => t.id === trackId)).toBe(true);
  });

  it("busca a faixa com a análise completa", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app)
      .get(`/api/tracks/${trackId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.analysis.chordSegments).toHaveLength(2);
    expect(res.body.analysis.key).toBe("D");
    expect(res.body.analysis.bpm).toBe(120);
  });

  it("outro usuário não consegue ver a faixa (404, não 403 — não revela existência)", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const otherEmail = `vitest-other-${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: otherEmail, password: "outraSenha123", displayName: "Outro" });
    const otherToken = registerRes.body.token;

    const res = await request(app)
      .get(`/api/tracks/${trackId}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  it("renomeia a faixa", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app)
      .patch(`/api/tracks/${trackId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Nome novo" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Nome novo");
  });

  it("deleta a faixa", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const deleteRes = await request(app)
      .delete(`/api/tracks/${trackId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/tracks/${trackId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });
});
