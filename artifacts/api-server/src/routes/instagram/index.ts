import { Router, type IRouter, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { videos, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID || "";
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const IG_API_BASE = "https://graph.instagram.com/v21.0";

function getOAuth2Client(user: any) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  oauth2Client.on("tokens", async (tokens) => {
    try {
      const updateData: Record<string, any> = {};
      if (tokens.access_token) updateData.googleAccessToken = tokens.access_token;
      if (tokens.refresh_token) updateData.googleRefreshToken = tokens.refresh_token;
      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, user.id));
      }
    } catch (err: any) {
      console.error("[Instagram] Failed to persist refreshed tokens:", err.message);
    }
  });
  return oauth2Client;
}

async function makeDriveFilePublic(auth: any, fileId: string): Promise<string> {
  const drive = google.drive({ version: "v3", auth });

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  const fileInfo = await drive.files.get({
    fileId,
    fields: "webContentLink",
  });

  const downloadLink = fileInfo.data.webContentLink;
  if (!downloadLink) {
    throw new Error("No se pudo obtener el link de descarga del archivo en Drive");
  }

  return downloadLink;
}

async function removeDrivePublicAccess(auth: any, fileId: string) {
  try {
    const drive = google.drive({ version: "v3", auth });
    const perms = await drive.permissions.list({ fileId });
    const anyonePerms = perms.data.permissions?.filter((p) => p.type === "anyone") || [];
    for (const perm of anyonePerms) {
      if (perm.id) {
        await drive.permissions.delete({ fileId, permissionId: perm.id });
      }
    }
  } catch (err: any) {
    console.warn("[Instagram] Could not remove public access from Drive file:", err.message);
  }
}

async function waitForContainer(containerId: string, maxAttempts = 30): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${IG_API_BASE}/${containerId}?fields=status_code,status&access_token=${INSTAGRAM_ACCESS_TOKEN}`
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error al verificar estado del contenedor (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json() as any;

    if (data.error) {
      throw new Error(`Error de Instagram: ${data.error.message || JSON.stringify(data.error)}`);
    }

    console.log(`[Instagram] Container ${containerId} status: ${data.status_code} (attempt ${i + 1})`);

    if (data.status_code === "FINISHED") {
      return "FINISHED";
    }
    if (data.status_code === "ERROR") {
      throw new Error(`Error procesando video: ${data.status || "Error desconocido de Instagram"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Timeout: el video tardó demasiado en procesarse en Instagram");
}

router.get("/instagram/status", async (_req: Request, res: Response) => {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
    res.json({
      connected: false,
      message: "Credenciales de Instagram no configuradas",
    });
    return;
  }

  try {
    const response = await fetch(
      `${IG_API_BASE}/${INSTAGRAM_USER_ID}?fields=user_id,username,name,profile_picture_url,followers_count,media_count&access_token=${INSTAGRAM_ACCESS_TOKEN}`
    );
    const data = await response.json() as any;

    if (data.error) {
      res.json({
        connected: false,
        message: data.error.message || "Error al conectar con Instagram",
      });
      return;
    }

    res.json({
      connected: true,
      account: {
        id: data.user_id || data.id,
        username: data.username,
        name: data.name,
        profilePicture: data.profile_picture_url,
        followersCount: data.followers_count,
        mediaCount: data.media_count,
      },
    });
  } catch (error: any) {
    console.error("[Instagram] Status check error:", error.message);
    res.json({ connected: false, message: error.message });
  }
});

router.post("/instagram/upload-from-drive/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  if (!videoId || isNaN(videoId) || videoId < 1) {
    res.status(400).json({ error: "ID de video inválido" });
    return;
  }

  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
    res.status(400).json({ error: "Credenciales de Instagram no configuradas" });
    return;
  }

  if (!user.googleAccessToken || !user.googleRefreshToken) {
    res.status(400).json({ error: "Necesitas reconectarte con Google para acceder a Drive" });
    return;
  }

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  if (!video.videoFileDriveId) {
    res.status(400).json({ error: "Este video no tiene archivo en Drive. Sube un video primero." });
    return;
  }

  const auth = getOAuth2Client(user);
  let madePublic = false;

  try {
    console.log(`[Instagram] Making Drive file ${video.videoFileDriveId} temporarily public...`);
    const videoUrl = await makeDriveFilePublic(auth, video.videoFileDriveId);
    madePublic = true;
    console.log(`[Instagram] Public URL obtained: ${videoUrl.substring(0, 80)}...`);

    const caption = video.instagramDescription || video.description || "";

    console.log(`[Instagram] Creating Reel container for user ${INSTAGRAM_USER_ID}...`);
    const containerRes = await fetch(`${IG_API_BASE}/${INSTAGRAM_USER_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        access_token: INSTAGRAM_ACCESS_TOKEN,
      }),
    });

    const containerData = await containerRes.json() as any;

    if (containerData.error) {
      throw new Error(containerData.error.message || "Error al crear contenedor de Reel");
    }

    const containerId = containerData.id;
    console.log(`[Instagram] Container created: ${containerId}. Waiting for processing...`);

    await waitForContainer(containerId);

    console.log(`[Instagram] Container ready. Publishing...`);
    const publishRes = await fetch(`${IG_API_BASE}/${INSTAGRAM_USER_ID}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: INSTAGRAM_ACCESS_TOKEN,
      }),
    });

    const publishData = await publishRes.json() as any;

    if (publishData.error) {
      throw new Error(publishData.error.message || "Error al publicar el Reel");
    }

    const mediaId = publishData.id;
    console.log(`[Instagram] Reel published! Media ID: ${mediaId}`);

    await db
      .update(videos)
      .set({
        instagramMediaId: mediaId,
        instagramStatus: "uploaded",
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId));

    await removeDrivePublicAccess(auth, video.videoFileDriveId);

    res.json({
      success: true,
      mediaId,
      message: `Reel publicado en Instagram. ID: ${mediaId}`,
    });
  } catch (error: any) {
    console.error("[Instagram] Upload error:", error.message);

    if (madePublic && video.videoFileDriveId) {
      await removeDrivePublicAccess(auth, video.videoFileDriveId);
    }

    res.status(500).json({ error: error.message || "Error al subir a Instagram" });
  }
});

router.get("/instagram/media-status/:videoId", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!video || !video.instagramMediaId) {
    res.status(404).json({ error: "Video no encontrado o no subido a Instagram" });
    return;
  }

  try {
    const response = await fetch(
      `${IG_API_BASE}/${video.instagramMediaId}?fields=id,caption,media_type,media_url,permalink,timestamp&access_token=${INSTAGRAM_ACCESS_TOKEN}`
    );
    const data = await response.json() as any;

    if (data.error) {
      res.status(500).json({ error: data.error.message });
      return;
    }

    res.json({
      id: data.id,
      caption: data.caption,
      mediaType: data.media_type,
      permalink: data.permalink,
      timestamp: data.timestamp,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
