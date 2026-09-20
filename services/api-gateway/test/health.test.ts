import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("retorna status ok com o formato esperado", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "api-gateway",
    });
    expect(typeof res.body.version).toBe("string");
    expect(typeof res.body.timestamp).toBe("string");
  });
});
