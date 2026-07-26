import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })),
    })),
  },
}));
vi.mock("@workspace/db/schema", () => ({ hubState: { userId: "userId" } }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class {} }, drive: vi.fn() } }));
vi.mock("pdf-parse", () => ({ PDFParse: class {} }));

const createMock = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

function aiReplies(content: string) {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content } }] });
}

async function startApp() {
  const router = (await import("./index")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: number } }).user = { id: 42 };
    next();
  });
  app.use("/api", router);
  return await new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
}

const CONTRACT = { title: "Landing", client: "ACME", value: "$119.000", status: "borrador", signedAt: "2026-01-10", expiresAt: "", notes: "Landing de captación" };
const DOC = {
  client: "ACME", project: "Landing", scope: "One-page", date: "2026-01-10", advisor: "WebMaker",
  modules: [{ id: "m1", name: "Landing", desc: "One-page", price: 100000 }],
  downPct: 50, notes: "", monthly: "", monthlyPrice: "", validityDays: 15,
};

describe("POST /api/hub/contracts/ai-chat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an empty instruction", async () => {
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hub/contracts/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONTRACT, instruction: "  " }),
    });
    expect(r.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("applies the AI changes to the document and merges over the original", async () => {
    aiReplies(JSON.stringify({
      contract: { ...CONTRACT, value: "$297.500" },
      // La IA sólo devuelve los módulos: el resto del documento debe conservarse.
      doc: { modules: [{ id: "m1", name: "Landing", desc: "One-page", price: 150000 }, { name: "SEO", desc: "On-page", price: 100000 }] },
      summary: "Agregué el módulo SEO",
    }));
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hub/contracts/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONTRACT, doc: DOC, instruction: "agrega SEO por 100.000 y sube la landing a 150.000" }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { contract: Record<string, string>; doc: Record<string, unknown>; summary: string };
    expect(body.contract.value).toBe("$297.500");
    expect(body.doc.modules).toEqual([
      { id: "m1", name: "Landing", desc: "One-page", price: 150000 },
      { name: "SEO", desc: "On-page", price: 100000 },
    ]);
    // Campos no tocados por la IA sobreviven al merge.
    expect(body.doc.advisor).toBe("WebMaker");
    expect(body.doc.downPct).toBe(50);
    expect(body.summary).toBe("Agregué el módulo SEO");
  });

  it("returns doc: null when the contract has no structured document", async () => {
    aiReplies(JSON.stringify({ contract: { ...CONTRACT, status: "activo" }, doc: null, summary: "Marqué el contrato como activo" }));
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hub/contracts/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONTRACT, doc: null, instruction: "márcalo como activo" }),
    });
    const body = await r.json() as { contract: Record<string, string>; doc: unknown };
    expect(body.contract.status).toBe("activo");
    expect(body.doc).toBeNull();
  });

  it("accepts the ficha at the root when the model skips the 'contract' wrapper", async () => {
    aiReplies(JSON.stringify({ ...CONTRACT, notes: "Incluye soporte 30 días" }));
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hub/contracts/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONTRACT, instruction: "agrega nota de soporte" }),
    });
    const body = await r.json() as { contract: Record<string, string> };
    expect(body.contract.notes).toBe("Incluye soporte 30 días");
  });

  it("drops an invalid document instead of corrupting the contract", async () => {
    aiReplies(JSON.stringify({ contract: CONTRACT, doc: { modules: "no-es-un-array" }, summary: "" }));
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hub/contracts/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONTRACT, doc: DOC, instruction: "cambia algo" }),
    });
    const body = await r.json() as { doc: unknown };
    expect(body.doc).toBeNull();
  });

  it("survives a non-JSON answer from the model", async () => {
    aiReplies("lo siento, no puedo");
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hub/contracts/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONTRACT, doc: DOC, instruction: "cambia el precio" }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { contract: Record<string, string>; doc: unknown; summary: string };
    expect(body.contract).toEqual({});
    expect(body.doc).toBeNull();
    expect(body.summary).toBe("");
  });
});
