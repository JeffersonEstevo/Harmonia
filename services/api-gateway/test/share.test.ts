/**
 * Links de compartilhamento + endurecimento de upload/download.
 * Exigem Postgres real (pulados automaticamente se indisponível — mesmo
 * mecanismo de auth-and-tracks.test.ts).
 */
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tinyMp3 = readFileSync(join(__dirname, "fixtures", "tiny.mp3"));

let databaseAvailable = false;
try {
  await pool.query("SELECT 1");
  databaseAvailable = true;
  await runMigrations();
} catch {
  console.warn("[test] Postgres indisponível — pulando testes de share/hardening.");
}

afterAll(async () => {
  if (databaseAvailable) {
    await pool.query("DELETE FROM users WHERE email LIKE 'vitest-share-%@example.com'");
  }
  await pool.end();
});

async function makeApp() {
  const { createApp } = await import("../src/app.js");
  return createApp();
}

let counter = 0;
async function registerUser(app: Awaited<ReturnType<typeof makeApp>>) {
  const email = `vitest-share-${Date.now()}-${counter++}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "senhaDeTeste123", displayName: "Share Tester" });
  return res.body.token as string;
}

async function saveTrack(app: Awaited<ReturnType<typeof makeApp>>, token: string, title = "Faixa") {
  const res = await request(app)
    .post("/api/tracks")
    .set("Authorization", `Bearer ${token}`)
    .field("title", title)
    .field("durationSec", "8.0")
    .field(
      "chordSegments",
      JSON.stringify([
        { chord: "Bm", onset: 0, offset: 4, confidence: 0.9 },
        { chord: "G", onset: 4, offset: 8, confidence: 0.8 },
      ]),
    )
    .field("key", "D")
    .field("keyScale", "major")
    .field("bpm", "120")
    .field("beatGrid", "[0.5,1.0,1.5]")
    .attach("file", tinyMp3, { filename: "tiny.mp3", contentType: "audio/mpeg" });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const validPeaks = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? -0.5 : 0.5));

describe.runIf(databaseAvailable)("upload: validação pelo conteúdo", () => {
  it("rejeita (415) um HTML enviado como se fosse áudio", async () => {
    const app = await makeApp();
    const token = await registerUser(app);

    const res = await request(app)
      .post("/api/tracks")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Malicioso")
      .field("durationSec", "5")
      .attach("file", Buffer.from("<html><script>alert(document.domain)</script></html>"), {
        filename: "musica.mp3",
        contentType: "audio/mpeg",
      });

    expect(res.status).toBe(415);
  });

  it("serve o áudio com Content-Type canônico, nosniff e attachment", async () => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token);

    const res = await request(app)
      .get(`/api/tracks/${trackId}/audio`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/mpeg");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-disposition"]).toBe("attachment");
  });

  it("rotas desconhecidas sob /api não respondem 401 (auth só vale pra /tracks)", async () => {
    const app = await makeApp();
    const res = await request(app).get("/api/shared/token-que-nao-existe");
    expect(res.status).toBe(404);
  });
});

describe.runIf(databaseAvailable)("links de compartilhamento", () => {
  it("cria link (padrão: sem áudio), e a visualização pública funciona SEM login", async () => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token, "Minha Música");

    const create = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ peaks: validPeaks });

    expect(create.status).toBe(201);
    expect(create.body.allowAudio).toBe(false);
    expect(create.body.token).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 bytes em base64url

    const pub = await request(app).get(`/api/shared/${create.body.token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.title).toBe("Minha Música");
    expect(pub.body.allowAudio).toBe(false);
    expect(pub.body.peaks).toHaveLength(200);
    expect(pub.body.analysis.chordSegments).toHaveLength(2);
    expect(pub.body.analysis.key).toBe("D");
    expect(pub.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("a resposta pública NÃO vaza dados internos (caminho em disco, dono, e-mail)", async () => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token);
    const { body: link } = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const pub = await request(app).get(`/api/shared/${link.token}`);
    const raw = JSON.stringify(pub.body);

    expect(raw).not.toContain("storage");
    expect(raw).not.toContain("owner");
    expect(raw).not.toContain("@example.com");
    expect(raw).not.toContain("harmonia-storage");
    expect(Object.keys(pub.body).sort()).toEqual(
      ["allowAudio", "analysis", "durationSec", "expiresAt", "peaks", "title"].sort(),
    );
  });

  it("áudio do link: 403 por padrão; 200 e idêntico ao original quando permitido", async () => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token);

    const closed = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const denied = await request(app).get(`/api/shared/${closed.body.token}/audio`);
    expect(denied.status).toBe(403);

    const open = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ allowAudio: true });
    const audio = await request(app)
      .get(`/api/shared/${open.body.token}/audio`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(audio.status).toBe(200);
    expect(audio.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(audio.body as Buffer, tinyMp3)).toBe(0);
  });

  it("token desconhecido → 404", async () => {
    const app = await makeApp();
    const res = await request(app).get("/api/shared/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(res.status).toBe(404);
  });

  it("link expirado → 404 (indistinguível de inexistente), inclusive o áudio", async () => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token);
    const { body: link } = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ allowAudio: true, expiresInDays: 7 });

    expect((await request(app).get(`/api/shared/${link.token}`)).status).toBe(200);

    await pool.query("UPDATE share_links SET expires_at = now() - interval '1 minute' WHERE id = $1", [
      link.id,
    ]);

    expect((await request(app).get(`/api/shared/${link.token}`)).status).toBe(404);
    expect((await request(app).get(`/api/shared/${link.token}/audio`)).status).toBe(404);
  });

  it("revogar apaga o link; depois disso a URL pública dá 404", async () => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token);
    const { body: link } = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const list = await request(app)
      .get(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/tracks/${trackId}/shares/${link.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    expect((await request(app).get(`/api/shared/${link.token}`)).status).toBe(404);
  });

  it("outro usuário não consegue criar, listar nem revogar links da faixa alheia", async () => {
    const app = await makeApp();
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const trackId = await saveTrack(app, owner);
    const { body: link } = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${owner}`)
      .send({});

    const auth = { Authorization: `Bearer ${intruder}` };
    expect((await request(app).post(`/api/tracks/${trackId}/shares`).set(auth).send({})).status).toBe(404);
    expect((await request(app).get(`/api/tracks/${trackId}/shares`).set(auth)).status).toBe(404);
    expect(
      (await request(app).delete(`/api/tracks/${trackId}/shares/${link.id}`).set(auth)).status,
    ).toBe(404);

    // e o link do dono segue funcionando
    expect((await request(app).get(`/api/shared/${link.token}`)).status).toBe(200);
  });

  it("endpoints do dono exigem login", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/tracks/00000000-0000-0000-0000-000000000000/shares")
      .send({});
    expect(res.status).toBe(401);
  });

  it("apagar a faixa derruba os links dela (cascade)", async () => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token);
    const { body: link } = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    await request(app).delete(`/api/tracks/${trackId}`).set("Authorization", `Bearer ${token}`);

    expect((await request(app).get(`/api/shared/${link.token}`)).status).toBe(404);
  });

  it.each([
    ["allowAudio não booleano", { allowAudio: "sim" }],
    ["expiresInDays negativo", { expiresInDays: -1 }],
    ["expiresInDays absurdo", { expiresInDays: 99999 }],
    ["expiresInDays não numérico", { expiresInDays: "7" }],
    ["peaks fora de [-1,1]", { peaks: [0, 5] }],
    ["peaks com tamanho ímpar", { peaks: [0, 0.1, 0.2] }],
    ["peaks não numéricos", { peaks: ["a", "b"] }],
    ["peaks grande demais", { peaks: new Array(4002).fill(0.1) }],
    ["peaks vazio", { peaks: [] }],
  ])("rejeita entrada inválida: %s", async (_label, payload) => {
    const app = await makeApp();
    const token = await registerUser(app);
    const trackId = await saveTrack(app, token);

    const res = await request(app)
      .post(`/api/tracks/${trackId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(400);
  });
});
