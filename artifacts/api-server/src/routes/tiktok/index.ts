import type { TikTokTokenResponse, TikTokUserInfoResponse, TikTokInitResponse } from "../../lib/tiktok-types";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { clearNetworkRevoked } from "../../lib/connections";
import multer from "multer";
import crypto from "crypto";
import { google } from "googleapis";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024 } });

import { getCredential } from "../../lib/credentials";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getGoogleOAuth2Client(user: any) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  return oauth2Client;
}

/**
 * Streams a Node.js readable (Drive response) into TikTok FILE_UPLOAD chunks.
 * Accumulates incoming data into a pending buffer; once the buffer reaches
 * chunkSize it is flushed to TikTok via PUT with Content-Range.
 * At most one chunk of data is held in memory at a time.
 */
async function uploadDriveStreamInChunks(
  stream: NodeJS.ReadableStream,
  totalSize: number,
  chunkSize: number,
  totalChunks: number,
  uploadUrl: string,
): Promise<void> {
  let byteOffset = 0;
  let chunkIdx = 0;
  let pending = Buffer.alloc(0);

  const flush = async (buf: Buffer): Promise<void> => {
    const start = byteOffset;
    const end = start + buf.length - 1;
    byteOffset += buf.length;
    chunkIdx++;
    const chunkRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Content-Type": "video/mp4",
      },
      body: buf,
    });
    if (!chunkRes.ok) {
      throw new Error(`Error subiendo chunk ${chunkIdx}/${totalChunks}: ${await chunkRes.text()}`);
    }
    console.log(`[TikTok] Chunk ${chunkIdx}/${totalChunks} OK (${buf.length} bytes, offset=${start})`);
  };

  for await (const data of stream as AsyncIterable<Buffer | string>) {
    pending = Buffer.concat([pending, Buffer.isBuffer(data) ? data : Buffer.from(data as string)]);
    // Flush complete chunks; keep the last incomplete chunk in pending
    while (pending.length >= chunkSize && chunkIdx < totalChunks - 1) {
      await flush(pending.slice(0, chunkSize));
      pending = pending.slice(chunkSize);
    }
  }
  // Flush remaining bytes as the last (possibly partial) chunk
  if (pending.length > 0) {
    await flush(pending);
  }
}

function getTikTokRedirectUri(): string {
  if (process.env.TIKTOK_REDIRECT_URI) return process.env.TIKTOK_REDIRECT_URI;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}/api/tiktok/callback`;
  return "https://admin.webmakerlatam.com/api/tiktok/callback";
}

async function refreshTikTokToken(user: any): Promise<string | null> {
  if (!user.tiktokRefreshToken) return null;

  try {
    const [clientKey, clientSecret] = await Promise.all([
      getCredential("TIKTOK_CLIENT_KEY"),
      getCredential("TIKTOK_CLIENT_SECRET"),
    ]);
    const params = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
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

    const data = (await res.json()) as TikTokTokenResponse;
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

router.get("/tiktok/auth", async (req: Request, res: Response) => {
  const clientKey = await getCredential("TIKTOK_CLIENT_KEY");
  const csrfState = crypto.randomBytes(16).toString("hex");

  res.cookie("tiktok_csrf", csrfState, {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  const redirectUri = getTikTokRedirectUri();

  console.log(`[TikTok] Auth: client_key="${clientKey}" (len=${clientKey.length}), redirect_uri="${redirectUri}"`);

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: "user.info.basic,video.upload",
    response_type: "code",
    redirect_uri: redirectUri,
    state: csrfState,
  });

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  console.log(`[TikTok] Redirecting to: ${authUrl}`);
  res.redirect(authUrl);
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

    const [clientKey, clientSecret] = await Promise.all([
      getCredential("TIKTOK_CLIENT_KEY"),
      getCredential("TIKTOK_CLIENT_SECRET"),
    ]);
    const params = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
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

    const tokenData = (await tokenRes.json()) as TikTokTokenResponse;

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
    // Fresh token → drop any stale "revoked" flag so the UI stops nagging.
    try { await clearNetworkRevoked(currentUser.id, "tiktok"); } catch {}

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

    const userInfo = (await userInfoRes.json()) as TikTokUserInfoResponse;

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
    const caption = (video.tiktokDescription || `${video.title} #webmakerchile`).slice(0, 2200);
    const videoSize = videoFile.size;

    const MIN_CHUNK = 5 * 1024 * 1024;
    const MAX_CHUNK = 64 * 1024 * 1024;
    const chunkSize = videoSize <= MAX_CHUNK ? videoSize : MIN_CHUNK;
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    console.log(`[TikTok] upload: size=${videoSize}, chunkSize=${chunkSize}, chunks=${totalChunkCount}`);

    const initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      }),
    });

    const initData = (await initRes.json()) as TikTokInitResponse;
    console.log("[TikTok] Init response:", JSON.stringify(initData));

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
      message: `Video subido a TikTok como privado. Ábrelo en TikTok para publicarlo. Publish ID: ${publishId}`,
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
    const gAuth = getGoogleOAuth2Client(user);
    const drive = google.drive({ version: "v3", auth: gAuth });

    // Step 1: get file size from metadata — no download yet
    const TIKTOK_MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB TikTok limit
    const metaRes = await drive.files.get({ fileId: video.videoFileDriveId, fields: "id,size,name" });
    const videoSize = Number(metaRes.data.size ?? 0);
    if (!videoSize) {
      res.status(400).json({ error: "No se pudo obtener el tamaño del archivo de Drive" });
      return;
    }
    if (videoSize > TIKTOK_MAX_FILE_SIZE) {
      res.status(400).json({ error: `El archivo (${(videoSize / 1e9).toFixed(1)} GB) supera el límite de 4 GB de TikTok` });
      return;
    }

    // Step 2: compute chunk params
    const MIN_CHUNK = 5 * 1024 * 1024;
    const MAX_CHUNK = 64 * 1024 * 1024;
    const chunkSize = videoSize <= MAX_CHUNK ? videoSize : MIN_CHUNK;
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    console.log(`[TikTok] upload-from-drive: "${metaRes.data.name}" size=${videoSize}, chunkSize=${chunkSize}, chunks=${totalChunkCount}`);

    const caption = (video.tiktokDescription || `${video.title} #webmakerchile`).slice(0, 2200);

    // Step 3: init TikTok upload
    const initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      }),
    });

    const initData = (await initRes.json()) as TikTokInitResponse;
    console.log("[TikTok] Init response:", JSON.stringify(initData));

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

    // Step 4: stream Drive file → upload chunks to TikTok (no full buffer in memory)
    const streamResponse = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "stream" }
    );
    await uploadDriveStreamInChunks(
      streamResponse.data as NodeJS.ReadableStream,
      videoSize,
      chunkSize,
      totalChunkCount,
      uploadUrl,
    );

    await db.update(videos).set({
      tiktokPublishId: publishId,
      tiktokStatus: "uploaded",
      updatedAt: new Date(),
    }).where(eq(videos.id, videoId));

    res.json({
      success: true,
      publishId,
      message: `Video subido a TikTok como privado. Ábrelo en TikTok para publicarlo. Publish ID: ${publishId}`,
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

export async function publishVideoFileToTikTok(
  filePath: string,
  user: any,
  caption: string
): Promise<{ success: boolean; publishId?: string; error?: string }> {
  const token = await getValidTikTokToken(user);
  if (!token) {
    return { success: false, error: "TikTok no conectado o token expirado" };
  }

  try {
    const { createReadStream: createRS } = await import("fs");
    const { stat } = await import("fs/promises");
    const stats = await stat(filePath);
    const videoSize = stats.size;
    const MIN_CHUNK = 5 * 1024 * 1024;
    const MAX_CHUNK = 64 * 1024 * 1024;
    const chunkSize = videoSize <= MAX_CHUNK ? videoSize : MIN_CHUNK;
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    console.log(`[TikTok] publishVideoFileToTikTok: size=${videoSize}, chunkSize=${chunkSize}, chunks=${totalChunkCount}`);

    const captionTrimmed = caption.slice(0, 2200);

    const initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: captionTrimmed,
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      }),
    });

    const initData = (await initRes.json()) as TikTokInitResponse;
    if (initData.error?.code !== "ok") {
      return { success: false, error: `Init failed: ${initData.error?.message || JSON.stringify(initData.error)}` };
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;
    if (!uploadUrl) {
      return { success: false, error: "No upload URL from TikTok" };
    }

    // Read each chunk directly from disk via file handle — no full-file buffer
    const { open: openFile } = await import("fs/promises");
    const fh = await openFile(filePath, "r");
    try {
      for (let i = 0; i < totalChunkCount; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, videoSize);
        const chunkLen = end - start;
        const buf = Buffer.allocUnsafe(chunkLen);
        const { bytesRead } = await fh.read(buf, 0, chunkLen, start);
        const chunk = buf.slice(0, bytesRead);

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
          return { success: false, error: `Chunk ${i + 1}/${totalChunkCount} failed: ${errText}` };
        }
        console.log(`[TikTok] publishVideoFileToTikTok chunk ${i + 1}/${totalChunkCount} OK`);
      }
    } finally {
      await fh.close();
    }

    console.log(`[TikTok] publishVideoFileToTikTok succeeded: publishId=${publishId}`);
    return { success: true, publishId };
  } catch (err: any) {
    return { success: false, error: err.message || "TikTok upload error" };
  }
}

export default router;
