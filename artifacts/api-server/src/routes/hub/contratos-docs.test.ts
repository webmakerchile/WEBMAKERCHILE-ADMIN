import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/**
 * Rutas de PDFs de contrato. Se prueba lo que importa:
 * - permisos por rol contra la base (scope contracts + ver montos para el doc cliente)
 * - el 409 honesto cuando Google no está conectado
 * - la subida a Drive con hashes de frescura
 * - el 502 con `parcial` cuando Drive falla a medias
 */

let usuarioDb: { id: number; role: string; teamRole: string | null } | null = null;

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => (usuarioDb ? [usuarioDb] : [])) })),
      })),
    })),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: { id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})) }));

const htmlToPdfMock = vi.fn(async (html: string) => Buffer.from("PDF:" + html.length));
vi.mock("../cotizaciones/pdf", () => ({
  htmlToPdf: (html: string) => htmlToPdfMock(html),
  SinChromiumError: class SinChromiumError extends Error {
    readonly code = "sin_chromium";
  },
}));

const driveCreateMock = vi.fn();
let driveConectado = true;
vi.mock("../drive", () => ({
  driveDe: vi.fn(() => (driveConectado ? { files: { create: driveCreateMock } } : null)),
  resolverCarpeta: vi.fn(async () => "carpeta-hub"),
  sinGoogle: (res: Response) => {
    res.status(409).json({ error: "Google no conectado", code: "google_no_conectado", conectar: "/api/auth/google" });
  },
}));
vi.mock("../../lib/google-auth", () => ({
  mensajeErrorGoogle: (e: unknown) => (e instanceof Error ? e.message : "Error de Google"),
}));

const DOC = {
  client: "ACME",
  project: "Landing ACME",
  scope: "One-page",
  date: "2026-01-10",
  advisor: "Lucas",
  modules: [{ id: "m1", name: "Landing", desc: "One-page", price: 100000 }],
  downPct: 50,
  notes: "",
  monthly: "",
  monthlyPrice: "",
  validityDays: 15,
};

const BRIEF = {
  objetivo: "Captar leads",
  contexto: "",
  alcance: [{ modulo: "Landing", descripcion: "Hero", entregables: ["Página"], requisitos: [] }],
  criteriosAceptacion: ["Form funciona"],
  fueraDeAlcance: [],
  stackSugerido: ["React"],
  hitos: [],
};

async function startApp(): Promise<number> {
  const router = (await import("./contratos-docs")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (usuarioDb) (req as Request & { user?: { id: number } }).user = { id: usuarioDb.id };
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

const post = (port: number, path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  driveConectado = true;
  usuarioDb = { id: 42, role: "user", teamRole: "ventas" };
  driveCreateMock.mockImplementation(async ({ requestBody }: { requestBody: { name: string } }) => ({
    data: { id: "f1", name: requestBody.name, webViewLink: `https://drive.google.com/${requestBody.name}` },
  }));
});

describe("POST /api/hub/contracts/docs/pdf", () => {
  it("401 sin sesión", async () => {
    usuarioDb = null;
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/pdf", { tipo: "cliente", doc: DOC });
    expect(r.status).toBe(401);
  });

  it("403 si el rol no tiene scope de contratos", async () => {
    usuarioDb = { id: 42, role: "user", teamRole: "editora" };
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/pdf", { tipo: "tecnico", brief: BRIEF });
    expect(r.status).toBe(403);
  });

  it("el documento CLIENTE exige poder ver montos (dev no puede)", async () => {
    usuarioDb = { id: 42, role: "user", teamRole: "dev" };
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/pdf", { tipo: "cliente", doc: DOC });
    expect(r.status).toBe(403);
    const j = (await r.json()) as { error: string };
    expect(j.error).toMatch(/montos/);
  });

  it("el documento TÉCNICO sí sale para un rol sin montos", async () => {
    usuarioDb = { id: 42, role: "user", teamRole: "dev" };
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/pdf", { tipo: "tecnico", brief: BRIEF, doc: DOC });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/pdf");
    expect(r.headers.get("content-disposition")).toContain("Documento-Tecnico-ACME");
  });

  it("ventas descarga el documento cliente como PDF adjunto", async () => {
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/pdf", { tipo: "cliente", doc: DOC });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toContain("Cotizacion-ACME");
    expect((await r.text()).startsWith("PDF:")).toBe(true);
  });

  it("400 con tipo inválido o documento incompleto", async () => {
    const port = await startApp();
    expect((await post(port, "/api/hub/contracts/docs/pdf", { tipo: "otro" })).status).toBe(400);
    expect((await post(port, "/api/hub/contracts/docs/pdf", { tipo: "cliente" })).status).toBe(400);
    const sinModulos = await post(port, "/api/hub/contracts/docs/pdf", {
      tipo: "cliente",
      doc: { ...DOC, modules: [] },
    });
    expect(sinModulos.status).toBe(400);
  });
});

describe("POST /api/hub/contracts/docs/regenerar", () => {
  it("409 google_no_conectado cuando falta Drive (sin tocar Puppeteer a medias)", async () => {
    driveConectado = false;
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/regenerar", { doc: DOC, brief: BRIEF });
    expect(r.status).toBe(409);
    const j = (await r.json()) as { code: string };
    expect(j.code).toBe("google_no_conectado");
    expect(driveCreateMock).not.toHaveBeenCalled();
  });

  it("sube ambos PDFs al Hub y devuelve enlaces + hashes de frescura", async () => {
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/regenerar", { doc: DOC, brief: BRIEF });
    expect(r.status).toBe(200);
    const j = (await r.json()) as {
      pdf: { url: string; title: string; uploadedAt: number };
      brief: { url: string; title: string };
      docHash: string;
      briefHash: string;
    };
    expect(j.pdf.url).toContain("drive.google.com");
    expect(j.pdf.title).toContain("Cotizacion-ACME");
    expect(j.brief.title).toContain("Documento-Tecnico-ACME");
    expect(j.docHash).toMatch(/^v1:/);
    expect(j.briefHash).toMatch(/^v1:/);
    expect(driveCreateMock).toHaveBeenCalledTimes(2);
    const llamada = driveCreateMock.mock.calls[0][0] as { requestBody: { parents?: string[] } };
    expect(llamada.requestBody.parents).toEqual(["carpeta-hub"]);
  });

  it("solo brief: no exige ver montos y sube únicamente el técnico (meta da nombre, no montos)", async () => {
    usuarioDb = { id: 42, role: "user", teamRole: "dev" };
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/regenerar", {
      brief: BRIEF,
      meta: { client: "ACME", project: "Landing ACME", date: "2026-01-10" },
    });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { pdf?: unknown; brief: { title: string }; briefHash: string; docHash?: string };
    expect(j.pdf).toBeUndefined();
    expect(j.docHash).toBeUndefined();
    expect(j.brief.title).toContain("Documento-Tecnico");
    expect(driveCreateMock).toHaveBeenCalledTimes(1);
  });

  it("con doc y sin montos → 403 (la censura de dinero no se salta por PDF)", async () => {
    usuarioDb = { id: 42, role: "user", teamRole: "dev" };
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/regenerar", { doc: DOC, brief: BRIEF });
    expect(r.status).toBe(403);
    expect(driveCreateMock).not.toHaveBeenCalled();
  });

  it("si Drive falla responde 502 drive_fallo con lo parcial (hashes incluidos)", async () => {
    driveCreateMock
      .mockImplementationOnce(async ({ requestBody }: { requestBody: { name: string } }) => ({
        data: { id: "f1", name: requestBody.name, webViewLink: "https://drive.google.com/ok" },
      }))
      .mockRejectedValueOnce(new Error("quota"));
    const port = await startApp();
    const r = await post(port, "/api/hub/contracts/docs/regenerar", { doc: DOC, brief: BRIEF });
    expect(r.status).toBe(502);
    const j = (await r.json()) as { code: string; parcial: { pdf?: { url: string }; docHash?: string; briefHash?: string } };
    expect(j.code).toBe("drive_fallo");
    expect(j.parcial.pdf?.url).toContain("/ok");
    expect(j.parcial.docHash).toMatch(/^v1:/);
  });

  it("400 si no viene ni doc ni brief", async () => {
    const port = await startApp();
    expect((await post(port, "/api/hub/contracts/docs/regenerar", {})).status).toBe(400);
  });
});
