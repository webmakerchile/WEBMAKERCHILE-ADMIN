import { describe, it, expect } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { requireArea } from "./require-area";

function buildApp(user: Record<string, unknown>, areas: string[]) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: unknown }).user = user;
    next();
  });
  app.get("/test", requireArea(...(areas as import("@workspace/areas").Area[])), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("requireArea middleware", () => {
  it("allows superadmin regardless of area", async () => {
    const app = buildApp({ role: "superadmin", teamRole: "edicion" }, ["ejecutivo"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows CEO regardless of area list", async () => {
    const app = buildApp({ role: "admin", teamRole: "ceo" }, ["marketing"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows a user whose area matches", async () => {
    const app = buildApp({ role: "admin", teamRole: "marketing" }, ["ceo", "marketing"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("blocks a user whose area does not match", async () => {
    const app = buildApp({ role: "admin", teamRole: "marketing" }, ["ejecutivo"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/acceso/i);
  });

  it("blocks edicion from hub (ejecutivo-only) routes", async () => {
    const app = buildApp({ role: "admin", teamRole: "edicion" }, ["ceo", "ejecutivo"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(403);
  });

  it("blocks marketing from studio (edicion) routes", async () => {
    const app = buildApp({ role: "admin", teamRole: "marketing" }, ["ceo", "edicion"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(403);
  });

  it("allows ejecutivo for hub routes", async () => {
    const app = buildApp({ role: "admin", teamRole: "ejecutivo" }, ["ceo", "ejecutivo"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("blocks a user with an unknown/legacy teamRole", async () => {
    const app = buildApp({ role: "admin", teamRole: "editora" }, ["ejecutivo"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(403);
  });

  it("blocks a user with no teamRole", async () => {
    const app = buildApp({ role: "admin" }, ["ejecutivo"]);
    const res = await request(app).get("/test");
    expect(res.status).toBe(403);
  });
});

describe("requireArea con los roles del equipo (@workspace/roles)", () => {
  it("la editora entra al estudio: su rol 'editora' es el área 'edicion'", async () => {
    const app = buildApp({ role: "admin", teamRole: "editora" }, ["ceo", "edicion"]);
    expect((await request(app).get("/test")).status).toBe(200);
  });

  it("ventas, programación y contabilidad entran al Hub", async () => {
    for (const rol of ["ventas", "dev", "contador"]) {
      const app = buildApp({ role: "admin", teamRole: rol }, ["ceo", "ejecutivo", "rrhh"]);
      expect((await request(app).get("/test")).status, `${rol} debería entrar`).toBe(200);
    }
  });

  it("redes entra a comunidad y analíticas junto con marketing", async () => {
    const app = buildApp({ role: "admin", teamRole: "social" }, ["ceo", "marketing"]);
    expect((await request(app).get("/test")).status).toBe(200);
  });

  it("los roles antiguos siguen resolviéndose", async () => {
    const editor = buildApp({ role: "admin", teamRole: "editor" }, ["ceo", "edicion"]);
    expect((await request(editor).get("/test")).status).toBe(200);
    const reviewer = buildApp({ role: "admin", teamRole: "reviewer" }, ["marketing"]);
    expect((await request(reviewer).get("/test")).status).toBe(200);
  });

  it("un rol inventado sigue sin pasar", async () => {
    const app = buildApp({ role: "admin", teamRole: "pasante" }, ["ceo", "edicion"]);
    expect((await request(app).get("/test")).status).toBe(403);
  });
});
