import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import crypto from "crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024 } });

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_API_BASE = "https://open.tiktokapis.com";

function getTikTokRedirectUri(): string {
  return process.env.TIKTOK_REDIRECT_URI || "https://admin.webmakerchile.com/api/tiktok/callback";
}

async function refreshTikTokToken(user: any): Promise<string | null> {
  if (!user.tiktokRefreshToken) return null;

  try {
    const params = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.tiktokRefreshToken,
    });

    const res = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (data.access_token) {
      await db.update(users).set({
        tiktokAccessToken: data.access_token,
        tiktokRefreshToken: data.refresh_token || user.tiktokRefreshToken,
        tiktokTokenExpiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000),
      }).where(eq(users.id, user.id));

      return data.access_token;
    }
    console.error("[TikTok] Token refresh failed:", data);
    return null;
  } catch (err: any) {
    console.error("[TikTok] Token refresh error:", err.message);
    return null;
  }
}

async function getValidTikTokToken(user: any): Promise<string | null> {
  if (!user.tiktokAccessToken) return null;

  if (user.tiktokTokenExpiresAt && new Date(user.tiktokTokenExpiresAt) > new Date()) {
    return user.tiktokAccessToken;
  }

  return refreshTikTokToken(user);
}

router.get("/tiktok/auth", (req: Request, res: Response) => {
  const csrfState = crypto.randomBytes(16).toString("hex");

  res.cookie("tiktok_csrf", csrfState, {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  const redirectUri = getTikTokRedirectUri();

  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: "user.info.basic,video.upload",
    response_type: "code",
    redirect_uri: redirectUri,
    state: csrfState,
  });

  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
});

router.get("/tiktok/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    console.error("[TikTok] Auth error:", error);
    res.redirect("/?tiktok=error&msg=" + encodeURIComponent(error));
    return;
  }

  const csrfCookie = req.cookies?.tiktok_csrf;
  if (!state || state !== csrfCookie) {
    console.error("[TikTok] CSRF mismatch");
    res.redirect("/?tiktok=error&msg=csrf_mismatch");
    return;
  }

  res.clearCookie("tiktok_csrf");

  if (!code) {
    res.redirect("/?tiktok=error&msg=no_code");
    return;
  }

  try {
    const redirectUri = getTikTokRedirectUri();

    const params = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[TikTok] Token exchange failed:", tokenData);
      res.redirect("/?tiktok=error&msg=token_failed");
      return;
    }

    const currentUser = req.user as any;
    if (!currentUser) {
      res.redirect("/?tiktok=error&msg=not_logged_in");
      return;
    }

    await db.update(users).set({
      tiktokOpenId: tokenData.open_id,
      tiktokAccessToken: tokenData.access_token,
      tiktokRefreshToken: tokenData.refresh_token,
      tiktokTokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 86400) * 1000),
    }).where(eq(users.id, currentUser.id));

    console.log(`[TikTok] Connected for user ${currentUser.id}, open_id: ${tokenData.open_id}`);
    res.redirect("/?tiktok=connected");
  } catch (err: any) {
    console.error("[TikTok] Callback error:", err.message);
    res.redirect("/?tiktok=error&msg=" + encodeURIComponent(err.message));
  }
});

router.get("/tiktok/status", async (req: Request, res: Response) => {
  const user = req.user as any;

  if (!user.tiktokAccessToken || !user.tiktokOpenId) {
    res.json({ connected: false, message: "TikTok no conectado. Usa el botón de conectar." });
    return;
  }

  const token = await getValidTikTokToken(user);
  if (!token) {
    res.json({ connected: false, message: "Token de TikTok expirado. Reconecta tu cuenta." });
    return;
  }

  try {
    const userInfoRes = await fetch(`${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,display_name,avatar_url`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const userInfo = await userInfoRes.json();

    if (userInfo.data?.user) {
      res.json({
        connected: true,
        user: {
          openId: userInfo.data.user.open_id,
          displayName: userInfo.data.user.display_name,
          avatar: userInfo.data.user.avatar_url,
        },
      });
    } else {
      res.json({ connected: false, message: "No se pudo obtener información del perfil de TikTok" });
    }
  } catch (err: any) {
    console.error("[TikTok] Status check error:", err.message);
    res.json({ connected: false, message: err.message });
  }
});

router.post("/tiktok/disconnect", async (req: Request, res: Response) => {
  const user = req.user as any;

  await db.update(users).set({
    tiktokOpenId: null,
    tiktokAccessToken: null,
    tiktokRefreshToken: null,
    tiktokTokenExpiresAt: null,
  }).where(eq(users.id, user.id));

  res.json({ success: true });
});

router.post("/tiktok/upload/:videoId", upload.single("video"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  const token = await getValidTikTokToken(user);
  if (!token) {
    res.status(400).json({ error: "TikTok no conectado o token expirado. Reconecta tu cuenta." });
    return;
  }

  const videoFile = (req as any).file;
  if (!videoFile) {
    res.status(400).json({ error: "Debes adjuntar el archivo de video" });
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

  try {
    const caption = video.tiktokDescription || `${video.title} #webmakerchile`;
    const videoSize = videoFile.size;

    const chunkSize = Math.min(64 * 1024 * 1024, videoSize);
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    const initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 150),
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      }),
    });

    const initData = await initRes.json();

    if (initData.error?.code !== "ok") {
      console.error("[TikTok] Init upload failed:", initData);
      res.status(500).json({
        error: `Error al iniciar subida: ${initData.error?.message || JSON.stringify(initData.error)}`,
      });
      return;
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;

    if (!uploadUrl) {
      res.status(500).json({ error: "No se recibió URL de subida de TikTok" });
      return;
    }

    for (let i = 0; i < totalChunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, videoSize);
      const chunk = videoFile.buffer.slice(start, end);

      const chunkRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${videoSize}`,
          "Content-Type": "video/mp4",
        },
        body: chunk,
      });

      if (!chunkRes.ok) {
        const errText = await chunkRes.text();
        console.error(`[TikTok] Chunk ${i} upload failed:`, errText);
        res.status(500).json({ error: `Error subiendo chunk ${i + 1}/${totalChunkCount}` });
        return;
      }
    }

    await db.update(videos).set({
      tiktokPublishId: publishId,
      tiktokStatus: "uploaded",
      updatedAt: new Date(),
    }).where(eq(videos.id, videoId));

    res.json({
      success: true,
      publishId,
      message: `Video subido a TikTok (privado). Publish ID: ${publishId}`,
    });
  } catch (err: any) {
    console.error("[TikTok] Upload error:", err.message);
    res.status(500).json({ error: err.message || "Error al subir a TikTok" });
  }
});

router.post("/tiktok/upload-from-drive/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  const token = await getValidTikTokToken(user);
  if (!token) {
    res.status(400).json({ error: "TikTok no conectado o token expirado. Reconecta tu cuenta." });
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
    res.status(400).json({ error: "Este video no tiene archivo adjunto. Sube un video primero." });
    return;
  }

  try {
    const connectors = new ReplitConnectors();
    const fileData = await connectors.googleDrive.getFileContent(video.videoFileDriveId);
    const videoBuffer = Buffer.from(fileData);

    const caption = video.tiktokDescription || `${video.title} #webmakerchile`;
    const videoSize = videoBuffer.length;
    const chunkSize = Math.min(64 * 1024 * 1024, videoSize);
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    const initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 150),
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      }),
    });

    const initData = await initRes.json();

    if (initData.error?.code !== "ok") {
      console.error("[TikTok] Init upload failed:", initData);
      res.status(500).json({
        error: `Error al iniciar subida: ${initData.error?.message || JSON.stringify(initData.error)}`,
      });
      return;
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;

    if (!uploadUrl) {
      res.status(500).json({ error: "No se recibió URL de subida de TikTok" });
      return;
    }

    for (let i = 0; i < totalChunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, videoSize);
      const chunk = videoBuffer.slice(start, end);

      const chunkRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${videoSize}`,
          "Content-Type": "video/mp4",
        },
        body: chunk,
      });

      if (!chunkRes.ok) {
        const errText = await chunkRes.text();
        console.error(`[TikTok] Chunk ${i} upload failed:`, errText);
        res.status(500).json({ error: `Error subiendo chunk ${i + 1}/${totalChunkCount}` });
        return;
      }
    }

    await db.update(videos).set({
      tiktokPublishId: publishId,
      tiktokStatus: "uploaded",
      updatedAt: new Date(),
    }).where(eq(videos.id, videoId));

    res.json({
      success: true,
      publishId,
      message: `Video subido a TikTok (privado). Publish ID: ${publishId}`,
    });
  } catch (err: any) {
    console.error("[TikTok] Upload from Drive error:", err.message);
    res.status(500).json({ error: err.message || "Error al subir a TikTok" });
  }
});

router.post("/tiktok/publish-status/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  const token = await getValidTikTokToken(user);
  if (!token) {
    res.status(400).json({ error: "TikTok no conectado" });
    return;
  }

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!video || !video.tiktokPublishId) {
    res.status(404).json({ error: "Video no encontrado o no subido a TikTok" });
    return;
  }

  try {
    const statusRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        publish_id: video.tiktokPublishId,
      }),
    });

    const statusData = await statusRes.json();
    res.json(statusData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
