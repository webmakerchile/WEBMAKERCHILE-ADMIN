import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubServices, type HubServiceTier } from "@workspace/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeRole } from "@workspace/roles";

/**
 * Catálogo de servicios del Hub Ejecutivo.
 * Lectura: cualquier usuario con acceso al área /hub (gate en routes/index.ts).
 * Gestión (crear/editar/duplicar/reordenar/archivar): solo CEO/Ejecutivo (+superadmin).
 */
const router: IRouter = Router();

type AuthUser = { id: number; role?: string; teamRole?: string };
function me(req: Request): AuthUser {
  return req.user as AuthUser;
}
function canManage(req: Request): boolean {
  const u = me(req);
  return u.role === "superadmin" || u.teamRole === "ceo" || u.teamRole === "ejecutivo";
}
function forbid(res: Response): void {
  res.status(403).json({ error: "Solo CEO o Ejecutivo pueden gestionar el catálogo de servicios" });
}

const tierSchema = z.object({
  plan: z.string().trim().min(1, "Cada plan necesita nombre").max(40),
  price: z.string().trim().max(40).default(""),
  detail: z.string().trim().max(300).default(""),
});

const serviceBodySchema = z.object({
  name: z.string({ required_error: "Nombre requerido" }).trim().min(1, "Nombre requerido").max(120),
  category: z.string({ required_error: "Categoría requerida" }).trim().min(1, "Categoría requerida").max(60),
  description: z.string().trim().max(600).default(""),
  includes: z.string().trim().max(1500).default(""),
  note: z.string().trim().max(400).default(""),
  tiers: z.array(tierSchema).max(6).default([]),
});

const servicePatchSchema = serviceBodySchema.partial().extend({
  archived: z.boolean().optional(),
});

/** Catálogo inicial: migración 1:1 del catálogo que vivía hardcodeado en el frontend. */
const SEED_SERVICES: Array<{
  category: string;
  name: string;
  description: string;
  includes: string;
  note: string;
  tiers: HubServiceTier[];
}> = [
  {
    category: "🌐 Sitios Web",
    name: "Landing Page",
    description: "Landing pages que convierten visitantes en pipeline.",
    includes: "UI/UX en Figma, frontend React + Next.js, hosting Vercel/Cloudflare, SEO técnico on-page, GA4 + Meta Pixel, formularios con notificación al CRM, Lighthouse 95+ mobile.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$100.000", detail: "o $25.000/mes · one-page brandeada, formulario + WhatsApp, hosting+dominio, entrega 5 días." },
      { plan: "Escala", price: "$290.000", detail: "Diseño 100% custom, copy persuasivo, Lighthouse 95+, píxel Meta/TikTok, entrega 7 días." },
      { plan: "Domina", price: "$490.000", detail: "Animaciones cinemáticas, A/B testing, multi-idioma, integración CRM." },
    ],
  },
  {
    category: "🌐 Sitios Web",
    name: "Sitio Web Corporativo",
    description: "Presencia digital multipágina para empresas.",
    includes: "Arquitectura multipágina, CMS headless opcional, diseño responsive, SEO técnico avanzado, blog integrado, multidioma, Core Web Vitals.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$290.000", detail: "5 secciones, formulario + blog básico, CMS simple." },
      { plan: "Escala", price: "$690.000", detail: "8+ secciones a medida, CMS autoadministrable, blog con SEO." },
      { plan: "Domina", price: "$1.290.000", detail: "Diseño 100% custom, multi-idioma, integración CRM/ERP, soporte premium 90 días." },
    ],
  },
  {
    category: "🌐 Sitios Web",
    name: "E-Commerce",
    description: "Tiendas online que procesan pedidos sin fricción.",
    includes: "Catálogo con variantes, checkout optimizado, pasarelas LATAM (Webpay, Mercado Pago, Khipu, Stripe), envíos, panel admin, cupones, SEO de productos.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$390.000", detail: "Hasta 50 productos, MercadoPago+transferencia, panel básico." },
      { plan: "Escala", price: "$990.000", detail: "Catálogo ilimitado, stock en vivo, cupones/promos, PWA." },
      { plan: "Domina", price: "$1.990.000", detail: "Multi-bodega y multi-moneda, integración ERP, app móvil opcional." },
    ],
  },
  {
    category: "🌐 Sitios Web",
    name: "Rediseño Web",
    description: "Recupera credibilidad y rendimiento migrando a stack moderno.",
    includes: "Auditoría inicial, preservación SEO, diseño UI nuevo, migración a Next.js, performance mobile-first.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$190.000", detail: "Refresh visual, hosting moderno." },
      { plan: "Escala", price: "$590.000", detail: "Rediseño completo UI/UX, Core Web Vitals." },
      { plan: "Domina", price: "$990.000", detail: "Diseño premium 100% nuevo, Lighthouse 100." },
    ],
  },
  {
    category: "💻 Software",
    name: "Software a Medida",
    description: "Apps web internas, automatizaciones y plataformas custom.",
    includes: "Arquitectura limpia, API REST/GraphQL, PostgreSQL, autenticación y permisos, tests automatizados, CI/CD.",
    note: "Se cotiza según alcance. Stack: Node.js, TypeScript, React, Next.js, PostgreSQL, Railway/Render/AWS.",
    tiers: [],
  },
  {
    category: "💻 Software",
    name: "Sistema ERP",
    description: "ERP a medida que refleja tus procesos reales.",
    includes: "Inventario multi-bodega, facturación electrónica, finanzas, RRHH, compras, reportes en tiempo real.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "—", detail: "No aplica en este nivel." },
      { plan: "Escala", price: "$2.490.000", detail: "Inventario + ventas + compras, hasta 10 usuarios." },
      { plan: "Domina", price: "$4.990.000", detail: "Módulos completos a medida, multi-empresa, usuarios ilimitados." },
    ],
  },
  {
    category: "💻 Software",
    name: "Sistema CRM",
    description: "CRM a medida con el pipeline real de tu equipo comercial.",
    includes: "Pipeline kanban, captación multicanal, automatizaciones, email integrado, click-to-call y WhatsApp.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$390.000", detail: "Hasta 500 contactos, pipeline visual básico." },
      { plan: "Escala", price: "$1.490.000", detail: "Contactos ilimitados, automatizaciones, integraciones." },
      { plan: "Domina", price: "—", detail: "Nivel premium superior, a cotizar según alcance." },
    ],
  },
  {
    category: "🎨 Diseño",
    name: "Diseño de Logo",
    description: "Logos diseñados para durar y funcionar en todos los tamaños.",
    includes: "3 propuestas únicas, exploración tipográfica, formatos vectoriales, paleta HEX/RGB/CMYK/Pantone, mini-manual.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$90.000", detail: "1 logo en 3 versiones, paleta básica." },
      { plan: "Escala", price: "$290.000", detail: "Logo + isotipo + variantes, manual corto." },
      { plan: "Domina", price: "$590.000", detail: "Investigación + naming, manual completo + animación." },
    ],
  },
  {
    category: "🎨 Diseño",
    name: "Branding & Marca",
    description: "Sistemas de branding que todo tu equipo puede aplicar correctamente.",
    includes: "Brand strategy, sistema de logo extendido, paleta extendida, tono y voz, aplicaciones, manual PDF.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$390.000", detail: "Logo + paleta + tipografía, manual básico." },
      { plan: "Escala", price: "$890.000", detail: "Estrategia de marca completa, manual extendido." },
      { plan: "Domina", price: "$1.890.000", detail: "Naming + storytelling, manual premium, lanzamiento y rollout." },
    ],
  },
  {
    category: "🎨 Diseño",
    name: "Redes Sociales",
    description: "Diseño de RRSS con sistema visual coherente.",
    includes: "Sistema visual, plantillas de posts/stories/reels, calendario visual 30 días.",
    note: "",
    tiers: [
      { plan: "Inicia", price: "$90.000", detail: "o $19.000/mes · 10 plantillas Canva." },
      { plan: "Escala", price: "$290.000", detail: "30+ plantillas custom, sistema visual coherente." },
      { plan: "Domina", price: "$590.000", detail: "Sistema visual completo, animaciones para reels, soporte mensual." },
    ],
  },
];

/** Lock id arbitrario pero fijo para serializar el seed del catálogo. */
const SEED_LOCK_ID = 730551001;

/** Siembra el catálogo inicial una sola vez (tabla vacía = nunca sembrado; no hay DELETE, solo archivado). */
async function seedIfEmpty(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(hubServices);
  if ((row?.n ?? 0) > 0) return;
  await db.transaction(async (tx) => {
    // Advisory lock transaccional: si dos peticiones llegan a la vez a una tabla
    // vacía, solo una siembra; la otra espera el lock y re-verifica el count.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_LOCK_ID})`);
    const [again] = await tx.select({ n: sql<number>`count(*)::int` }).from(hubServices);
    if ((again?.n ?? 0) > 0) return;
    await tx.insert(hubServices).values(
      SEED_SERVICES.map((s, i) => ({ ...s, sortOrder: (i + 1) * 10 })),
    );
  });
}

router.get("/hub/services", async (_req: Request, res: Response) => {
  await seedIfEmpty();
  const rows = await db
    .select()
    .from(hubServices)
    .orderBy(asc(hubServices.sortOrder), asc(hubServices.id));
  res.json({ services: rows });
});

router.post("/hub/services", async (req: Request, res: Response) => {
  if (!canManage(req)) { forbid(res); return; }
  const parsed = serviceBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const [row] = await db.select({ maxOrder: sql<number>`coalesce(max(${hubServices.sortOrder}), 0)::int` }).from(hubServices);
  const [created] = await db
    .insert(hubServices)
    .values({ ...parsed.data, sortOrder: (row?.maxOrder ?? 0) + 10 })
    .returning();
  res.status(201).json({ service: created });
});

router.post("/hub/services/reorder", async (req: Request, res: Response) => {
  if (!canManage(req)) { forbid(res); return; }
  const parsed = z
    .object({ ids: z.array(z.number().int().positive()).min(1).max(500) })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Se requiere 'ids': array de IDs en el nuevo orden" });
    return;
  }
  const { ids } = parsed.data;
  if (new Set(ids).size !== ids.length) {
    res.status(400).json({ error: "IDs duplicados en el orden" });
    return;
  }
  // Atómico y validado: los ids enviados deben cubrir exactamente el catálogo
  // actual (activos + archivados); si no coinciden, el cliente está desfasado.
  const applied = await db.transaction(async (tx) => {
    const existing = await tx.select({ id: hubServices.id }).from(hubServices);
    if (existing.length !== ids.length) return false;
    const existingIds = new Set(existing.map((r) => r.id));
    if (ids.some((id) => !existingIds.has(id))) return false;
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(hubServices)
        .set({ sortOrder: (i + 1) * 10, updatedAt: new Date() })
        .where(eq(hubServices.id, ids[i]!));
    }
    return true;
  });
  if (!applied) {
    res.status(409).json({ error: "El orden enviado no coincide con el catálogo actual. Recarga e intenta de nuevo." });
    return;
  }
  const rows = await db
    .select()
    .from(hubServices)
    .orderBy(asc(hubServices.sortOrder), asc(hubServices.id));
  res.json({ services: rows });
});

router.post("/hub/services/:id/duplicate", async (req: Request, res: Response) => {
  if (!canManage(req)) { forbid(res); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }
  const [orig] = await db.select().from(hubServices).where(eq(hubServices.id, id)).limit(1);
  if (!orig) { res.status(404).json({ error: "Servicio no encontrado" }); return; }
  const [copy] = await db
    .insert(hubServices)
    .values({
      category: orig.category,
      name: `${orig.name} (copia)`.slice(0, 120),
      description: orig.description,
      includes: orig.includes,
      note: orig.note,
      tiers: orig.tiers,
      archived: false,
      // Queda justo después del original (orden estable por (sortOrder, id)).
      sortOrder: orig.sortOrder + 1,
    })
    .returning();
  res.status(201).json({ service: copy });
});

router.patch("/hub/services/:id", async (req: Request, res: Response) => {
  if (!canManage(req)) { forbid(res); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = servicePatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Nada que actualizar" });
    return;
  }
  const [updated] = await db
    .update(hubServices)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(hubServices.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Servicio no encontrado" }); return; }
  res.json({ service: updated });
});

export default router;
