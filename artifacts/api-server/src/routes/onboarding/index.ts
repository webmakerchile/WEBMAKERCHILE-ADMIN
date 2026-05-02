import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { videos, users } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const SERVER_FB_PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
const SERVER_IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";

router.get("/onboarding/checklist", async (req: Request, res: Response) => {
  const sessionUser = req.user as any;
  if (!sessionUser?.id) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  const drive = Boolean(user.googleAccessToken && user.googleRefreshToken);

  const networkFlags = {
    youtube: drive,
    tiktok: Boolean(user.tiktokAccessToken),
    linkedin: Boolean(user.linkedinAccessToken),
    x: Boolean(user.xAccessToken),
    facebook: Boolean(SERVER_FB_PAGE_TOKEN || user.facebookPageAccessToken || user.facebookUserAccessToken),
    instagram: Boolean(SERVER_IG_TOKEN),
  };

  const networksConnectedCount = Object.values(networkFlags).filter(Boolean).length;
  const networks = networksConnectedCount > 0;

  // NOTE: WebMakerLatam es single-tenant (un panel administrativo compartido por
  // el equipo de WebMakerChile). La tabla `videos` no tiene `userId`: todos los
  // miembros ven y gestionan el mismo catálogo. Por eso los conteos de
  // "primer video" y "primera publicación programada" son globales a propósito.
  // Si en el futuro se vuelve multi-tenant, agregar columna `userId` en videos
  // y filtrar aquí por sessionUser.id.
  const [videoRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      scheduledOrPublished: sql<number>`count(*) filter (where ${videos.scheduledAt} is not null or ${videos.publishedAt} is not null)::int`,
    })
    .from(videos);
  const firstVideo = (videoRow?.total || 0) > 0;
  const firstScheduled = (videoRow?.scheduledOrPublished || 0) > 0;

  const steps = [
    { id: "drive", done: drive, label: "Conectar Google Drive", description: "Sube y guarda tus videos en tu carpeta de Drive.", href: "/cuentas" },
    { id: "networks", done: networks, label: "Conectar al menos una red social", description: "Vincula TikTok, Instagram, YouTube, LinkedIn, X o Facebook.", href: "/cuentas" },
    { id: "firstVideo", done: firstVideo, label: "Crear tu primer video", description: "Define título, descripción y portada en el gestor.", href: "/videos" },
    { id: "firstScheduled", done: firstScheduled, label: "Programar tu primera publicación", description: "Elige día y hora en el calendario de publicaciones.", href: "/schedule" },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const completed = completedCount === totalCount;

  res.json({
    drive,
    networks,
    networkFlags,
    networksConnectedCount,
    firstVideo,
    firstScheduled,
    completed,
    completedCount,
    totalCount,
    steps,
  });
});

export default router;
