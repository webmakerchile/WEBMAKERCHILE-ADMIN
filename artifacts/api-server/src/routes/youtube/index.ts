import { Router, type IRouter, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { videos, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Readable } from "stream";
import multer from "multer";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024 } });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getOAuth2Client(user: any) {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
  );
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
        console.log("[YouTube] Tokens refreshed and persisted for user", user.id);
      }
    } catch (err: any) {
      console.error("[YouTube] Failed to persist refreshed tokens:", err.message);
    }
  });

  return oauth2Client;
}

router.get("/youtube/channel", async (req: Request, res: Response) => {
  const user = req.user as any;

  if (!user.googleAccessToken || !user.googleRefreshToken) {
    res.json({ connected: false, message: "Necesitas reconectarte con Google para otorgar permisos de YouTube" });
    return;
  }

  try {
    const auth = getOAuth2Client(user);
    const youtube = google.youtube({ version: "v3", auth });

    const response = await youtube.channels.list({
      part: ["snippet", "statistics"],
      mine: true,
    });

    const channel = response.data.items?.[0];
    if (!channel) {
      res.json({ connected: false, message: "No se encontró un canal de YouTube asociado" });
      return;
    }

    res.json({
      connected: true,
      channel: {
        id: channel.id,
        title: channel.snippet?.title,
        description: channel.snippet?.description,
        thumbnail: channel.snippet?.thumbnails?.default?.url,
        subscriberCount: channel.statistics?.subscriberCount,
        videoCount: channel.statistics?.videoCount,
      },
    });
  } catch (error: any) {
    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      res.json({ connected: false, message: "Token expirado. Cierra sesión y vuelve a iniciar para renovar permisos." });
      return;
    }
    res.status(500).json({ error: error.message || "Error al conectar con YouTube" });
  }
});

router.post("/youtube/upload/:videoId", upload.single("video"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  if (!user.googleAccessToken || !user.googleRefreshToken) {
    res.status(400).json({ error: "Necesitas reconectarte con Google para otorgar permisos de YouTube" });
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
    const auth = getOAuth2Client(user);
    const youtube = google.youtube({ version: "v3", auth });

    const title = video.youtubeTitle || video.title;
    const description = video.youtubeDescription || video.description;

    const videoStream = Readable.from(videoFile.buffer);

    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title.substring(0, 100),
          description,
          tags: ["webmakerchile", "shorts", "emprendimiento", "chile"],
          categoryId: "22",
          defaultLanguage: "es",
        },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: videoFile.mimetype || "video/mp4",
        body: videoStream,
      },
    });

    const ytVideoId = uploadResponse.data.id;
    let thumbnailSet = false;
    let thumbnailError = "";

    if (video.coverImageBase64 && ytVideoId) {
      try {
        const thumbnailBuffer = Buffer.from(video.coverImageBase64, "base64");
        const thumbStream = Readable.from(thumbnailBuffer);
        console.log(`[YouTube] Setting thumbnail for ${ytVideoId}, size: ${thumbnailBuffer.length} bytes, mime: ${video.coverMimeType || "image/png"}`);
        await youtube.thumbnails.set({
          videoId: ytVideoId,
          media: {
            mimeType: video.coverMimeType || "image/png",
            body: thumbStream,
          },
        });
        thumbnailSet = true;
        console.log(`[YouTube] Thumbnail set successfully for ${ytVideoId}`);
      } catch (thumbErr: any) {
        thumbnailError = thumbErr.message || "Error desconocido";
        console.error("[YouTube] Thumbnail upload failed:", thumbErr.message, thumbErr.code, JSON.stringify(thumbErr.errors || []));
      }
    }

    await db
      .update(videos)
      .set({
        youtubeVideoId: ytVideoId,
        youtubeStatus: "uploaded",
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId));

    res.json({
      success: true,
      youtubeVideoId: ytVideoId,
      youtubeUrl: `https://youtube.com/shorts/${ytVideoId}`,
      thumbnailSet,
      thumbnailError: thumbnailError || undefined,
      message: thumbnailSet
        ? `Video subido a YouTube con portada. ID: ${ytVideoId}`
        : `Video subido a YouTube (sin portada${thumbnailError ? `: ${thumbnailError}` : ""}). ID: ${ytVideoId}`,
    });
  } catch (error: any) {
    console.error("[YouTube] Upload error:", error.message);

    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      res.status(401).json({ error: "Token expirado. Cierra sesión y vuelve a iniciar para renovar permisos." });
      return;
    }

    res.status(500).json({ error: error.message || "Error al subir a YouTube" });
  }
});

router.post("/youtube/upload-from-drive/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  if (!user.googleAccessToken || !user.googleRefreshToken) {
    res.status(400).json({ error: "Necesitas reconectarte con Google para otorgar permisos de YouTube" });
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
    const auth = getOAuth2Client(user);
    const drive = google.drive({ version: "v3", auth });
    const driveResponse = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const videoBuffer = Buffer.from(driveResponse.data as ArrayBuffer);

    const youtube = google.youtube({ version: "v3", auth });

    const title = video.youtubeTitle || video.title;
    const description = video.youtubeDescription || video.description;

    const videoStream = Readable.from(videoBuffer);

    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title.substring(0, 100),
          description,
          tags: ["webmakerchile", "shorts", "emprendimiento", "chile"],
          categoryId: "22",
          defaultLanguage: "es",
        },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: videoStream,
      },
    });

    const ytVideoId = uploadResponse.data.id;
    let thumbnailSet = false;
    let thumbnailError = "";

    if (video.coverImageBase64 && ytVideoId) {
      try {
        const thumbnailBuffer = Buffer.from(video.coverImageBase64, "base64");
        const thumbStream = Readable.from(thumbnailBuffer);
        console.log(`[YouTube] Setting thumbnail for ${ytVideoId}, size: ${thumbnailBuffer.length} bytes, mime: ${video.coverMimeType || "image/png"}`);
        await youtube.thumbnails.set({
          videoId: ytVideoId,
          media: { mimeType: video.coverMimeType || "image/png", body: thumbStream },
        });
        thumbnailSet = true;
        console.log(`[YouTube] Thumbnail set successfully for ${ytVideoId}`);
      } catch (thumbErr: any) {
        thumbnailError = thumbErr.message || "Error desconocido";
        console.error("[YouTube] Thumbnail upload failed:", thumbErr.message, thumbErr.code, JSON.stringify(thumbErr.errors || []));
      }
    }

    await db
      .update(videos)
      .set({ youtubeVideoId: ytVideoId, youtubeStatus: "uploaded", updatedAt: new Date() })
      .where(eq(videos.id, videoId));

    res.json({
      success: true,
      youtubeVideoId: ytVideoId,
      youtubeUrl: `https://youtube.com/shorts/${ytVideoId}`,
      thumbnailSet,
      thumbnailError: thumbnailError || undefined,
      message: thumbnailSet
        ? `Video subido a YouTube con portada. ID: ${ytVideoId}`
        : `Video subido a YouTube (sin portada${thumbnailError ? `: ${thumbnailError}` : ""}). ID: ${ytVideoId}`,
    });
  } catch (error: any) {
    console.error("[YouTube] Upload from Drive error:", error.message);
    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      res.status(401).json({ error: "Token expirado. Cierra sesión y vuelve a iniciar." });
      return;
    }
    res.status(500).json({ error: error.message || "Error al subir a YouTube" });
  }
});

router.get("/youtube/status/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!video || !video.youtubeVideoId) {
    res.status(404).json({ error: "Video no encontrado o no subido a YouTube" });
    return;
  }

  try {
    const auth = getOAuth2Client(user);
    const youtube = google.youtube({ version: "v3", auth });

    const response = await youtube.videos.list({
      part: ["status", "snippet", "statistics"],
      id: [video.youtubeVideoId],
    });

    const ytVideo = response.data.items?.[0];
    if (!ytVideo) {
      res.status(404).json({ error: "Video no encontrado en YouTube" });
      return;
    }

    res.json({
      id: ytVideo.id,
      title: ytVideo.snippet?.title,
      status: ytVideo.status?.uploadStatus,
      privacyStatus: ytVideo.status?.privacyStatus,
      viewCount: ytVideo.statistics?.viewCount,
      likeCount: ytVideo.statistics?.likeCount,
      url: `https://youtube.com/shorts/${ytVideo.id}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
