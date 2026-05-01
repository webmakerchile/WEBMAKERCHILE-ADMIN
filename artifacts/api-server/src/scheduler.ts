import { db } from "@workspace/db";
import { videos, users } from "@workspace/db/schema";
import { eq, and, lte, or, isNull } from "drizzle-orm";
import { google } from "googleapis";
import { Readable } from "stream";
import { randomBytes } from "crypto";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { registerTempFile, unregisterTempFile } from "./routes/instagram/temp-serve";
import { publishLinkedInPost, publishLinkedInVideo } from "./routes/linkedin";
import { publishXPost, publishXTweetWithVideo } from "./routes/x";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const TIKTOK_CLIENT_KEY = (process.env.TIKTOK_CLIENT_KEY || "").trim();
const TIKTOK_CLIENT_SECRET = (process.env.TIKTOK_CLIENT_SECRET || "").trim();
const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID || "";
const IG_API_BASE = "https://graph.instagram.com/v21.0";
const TEMP_DIR = path.join(process.cwd(), "tmp-ig-videos");

let schedulerRunning = false;

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
        console.log("[Scheduler] Google tokens refreshed for user", user.id);
      }
    } catch (err: any) {
      console.error("[Scheduler] Failed to persist Google tokens:", err.message);
    }
  });
  return oauth2Client;
}

async function getValidTikTokToken(user: any): Promise<string | null> {
  if (!user.tiktokAccessToken) return null;
  if (user.tiktokTokenExpiresAt && new Date(user.tiktokTokenExpiresAt) > new Date()) {
    return user.tiktokAccessToken;
  }
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
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
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
    console.error("[Scheduler] TikTok token refresh failed:", data);
    return null;
  } catch (err: any) {
    console.error("[Scheduler] TikTok token refresh error:", err.message);
    return null;
  }
}

function getPublicBaseUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT_URL) return process.env.REPLIT_DEPLOYMENT_URL;
  return "https://admin.webmakerchile.com";
}

async function uploadToYouTube(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (!user.googleAccessToken || !user.googleRefreshToken) {
    return { success: false, error: "No Google tokens" };
  }
  if (!video.videoFileDriveId) {
    return { success: false, error: "No video file in Drive" };
  }
  if (video.youtubeVideoId) {
    return { success: true };
  }

  try {
    const auth = getOAuth2Client(user);
    const drive = google.drive({ version: "v3", auth });
    const driveRes = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const videoBuffer = Buffer.from(driveRes.data as ArrayBuffer);
    const youtube = google.youtube({ version: "v3", auth });
    const title = video.youtubeTitle || video.title;
    const description = video.youtubeDescription || video.description;

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
        status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
      },
      media: { mimeType: "video/mp4", body: Readable.from(videoBuffer) },
    });

    const ytVideoId = uploadResponse.data.id;

    if (video.coverImageBase64 && ytVideoId) {
      try {
        const thumbBuffer = Buffer.from(video.coverImageBase64, "base64");
        await youtube.thumbnails.set({
          videoId: ytVideoId,
          media: { mimeType: video.coverMimeType || "image/png", body: Readable.from(thumbBuffer) },
        });
        console.log(`[Scheduler] YouTube thumbnail set for ${ytVideoId}`);
      } catch (thumbErr: any) {
        console.error(`[Scheduler] YouTube thumbnail failed: ${thumbErr.message}`);
      }
    }

    await db.update(videos).set({
      youtubeVideoId: ytVideoId,
      youtubeStatus: "uploaded",
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));

    console.log(`[Scheduler] YouTube upload success: ${ytVideoId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Scheduler] YouTube upload error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function uploadToTikTok(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.tiktokPublishId) {
    return { success: true };
  }

  const token = await getValidTikTokToken(user);
  if (!token) {
    return { success: false, error: "No TikTok token" };
  }
  if (!video.videoFileDriveId) {
    return { success: false, error: "No video file in Drive" };
  }

  try {
    const auth = getOAuth2Client(user);
    const drive = google.drive({ version: "v3", auth });
    const driveRes = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const videoBuffer = Buffer.from(driveRes.data as ArrayBuffer);
    const videoSize = videoBuffer.length;
    const chunkSize = Math.min(64 * 1024 * 1024, videoSize);
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    const initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
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
      return { success: false, error: `TikTok init failed: ${initData.error?.message || JSON.stringify(initData.error)}` };
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;

    if (!uploadUrl) {
      return { success: false, error: "No TikTok upload URL" };
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
        return { success: false, error: `TikTok chunk ${i} upload failed` };
      }
    }

    await db.update(videos).set({
      tiktokPublishId: publishId,
      tiktokStatus: "uploaded",
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));

    console.log(`[Scheduler] TikTok upload success: ${publishId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Scheduler] TikTok upload error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function downloadDriveVideo(video: any, user: any): Promise<Buffer | null> {
  if (!video.videoFileDriveId) return null;
  try {
    const auth = getOAuth2Client(user);
    const drive = google.drive({ version: "v3", auth });
    const driveRes = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(driveRes.data as ArrayBuffer);
  } catch (err: any) {
    console.error(`[Scheduler] Drive download failed: ${err.message}`);
    return null;
  }
}

async function publishToLinkedIn(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.linkedinPostId) return { success: true };
  if (!user.linkedinAccessToken || !user.linkedinPersonUrn) {
    const error = "LinkedIn not connected";
    await db.update(videos).set({ linkedinStatus: "error", linkedinError: error, updatedAt: new Date() }).where(eq(videos.id, video.id));
    return { success: false, error };
  }
  const content = video.linkedinDescription || video.description || video.title;
  if (!content || !content.trim()) {
    const error = "Empty LinkedIn content";
    await db.update(videos).set({ linkedinStatus: "error", linkedinError: error, updatedAt: new Date() }).where(eq(videos.id, video.id));
    return { success: false, error };
  }

  let result: { success: boolean; postId?: string; error?: string };
  if (video.videoFileDriveId) {
    const buf = await downloadDriveVideo(video, user);
    if (!buf) {
      result = await publishLinkedInPost(user, content);
    } else {
      result = await publishLinkedInVideo(user, content, buf);
    }
  } else {
    result = await publishLinkedInPost(user, content);
  }

  if (result.success) {
    await db.update(videos).set({
      linkedinPostId: result.postId || "ok",
      linkedinStatus: "published",
      linkedinError: null,
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));
    console.log(`[Scheduler] LinkedIn publish success: ${result.postId}`);
  } else {
    await db.update(videos).set({
      linkedinStatus: "error",
      linkedinError: result.error || "unknown",
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));
  }
  return result;
}

async function publishToX(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.xPostId) return { success: true };
  if (!user.xAccessToken || !user.xUserId) {
    const error = "X not connected";
    await db.update(videos).set({ xStatus: "error", xError: error, updatedAt: new Date() }).where(eq(videos.id, video.id));
    return { success: false, error };
  }
  const content = video.xDescription || video.description || video.title;
  if (!content || !content.trim()) {
    const error = "Empty X content";
    await db.update(videos).set({ xStatus: "error", xError: error, updatedAt: new Date() }).where(eq(videos.id, video.id));
    return { success: false, error };
  }

  let result: { success: boolean; postId?: string; error?: string };
  if (video.videoFileDriveId) {
    const buf = await downloadDriveVideo(video, user);
    if (!buf) {
      result = await publishXPost(user, content);
    } else {
      result = await publishXTweetWithVideo(user, content, buf);
    }
  } else {
    result = await publishXPost(user, content);
  }

  if (result.success) {
    await db.update(videos).set({
      xPostId: result.postId || "ok",
      xStatus: "published",
      xError: null,
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));
    console.log(`[Scheduler] X publish success: ${result.postId}`);
  } else {
    await db.update(videos).set({
      xStatus: "error",
      xError: result.error || "unknown",
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));
  }
  return result;
}

async function uploadToInstagram(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.instagramMediaId) {
    return { success: true };
  }
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
    return { success: false, error: "Instagram not configured" };
  }
  if (!video.videoFileDriveId) {
    return { success: false, error: "No video file in Drive" };
  }
  if (!user.googleAccessToken || !user.googleRefreshToken) {
    return { success: false, error: "No Google tokens for Drive access" };
  }

  let tempToken: string | null = null;

  try {
    const auth = getOAuth2Client(user);
    const drive = google.drive({ version: "v3", auth });
    const driveRes = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const videoBuffer = Buffer.from(driveRes.data as ArrayBuffer);

    await mkdir(TEMP_DIR, { recursive: true });
    tempToken = randomBytes(32).toString("hex");
    const filePath = path.join(TEMP_DIR, `${tempToken}.mp4`);
    await writeFile(filePath, videoBuffer);
    registerTempFile(tempToken, filePath);

    const baseUrl = getPublicBaseUrl();
    const publicVideoUrl = `${baseUrl}/api/instagram/temp-video/${tempToken}`;

    const caption = video.instagramDescription || video.description || "";

    const containerRes = await fetch(`${IG_API_BASE}/${INSTAGRAM_USER_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: publicVideoUrl,
        caption,
        access_token: INSTAGRAM_ACCESS_TOKEN,
      }),
    });

    const containerData = await containerRes.json() as any;
    if (containerData.error) {
      throw new Error(containerData.error.message || "Container creation failed");
    }

    const containerId = containerData.id;
    console.log(`[Scheduler] Instagram container created: ${containerId}`);

    for (let i = 0; i < 60; i++) {
      const statusRes = await fetch(
        `${IG_API_BASE}/${containerId}?fields=status_code,status&access_token=${INSTAGRAM_ACCESS_TOKEN}`
      );
      const statusData = await statusRes.json() as any;
      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") {
        throw new Error(`Instagram processing error: ${statusData.status || "Unknown"}`);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

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
      throw new Error(publishData.error.message || "Publish failed");
    }

    const mediaId = publishData.id;

    await db.update(videos).set({
      instagramMediaId: mediaId,
      instagramStatus: "uploaded",
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));

    console.log(`[Scheduler] Instagram upload success: ${mediaId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Scheduler] Instagram upload error: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (tempToken) {
      unregisterTempFile(tempToken);
      try { await unlink(path.join(TEMP_DIR, `${tempToken}.mp4`)); } catch {}
    }
  }
}

async function processScheduledVideos() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  try {
    const now = new Date();
    const dueVideos = await db
      .select()
      .from(videos)
      .where(and(
        eq(videos.status, "scheduled"),
        or(lte(videos.scheduledAt, now), isNull(videos.scheduledAt))
      ));

    if (dueVideos.length === 0) {
      schedulerRunning = false;
      return;
    }

    console.log(`[Scheduler] Found ${dueVideos.length} due video(s) at ${now.toISOString()}`);

    const [adminUser] = await db.select().from(users).limit(1);
    if (!adminUser) {
      console.error("[Scheduler] No admin user found in DB");
      schedulerRunning = false;
      return;
    }

    for (const video of dueVideos) {
      console.log(`[Scheduler] Processing video #${video.id}: "${video.title}" (driveId: ${video.videoFileDriveId || "NONE"})`);

      if (!video.videoFileDriveId) {
        console.log(`[Scheduler] Video #${video.id} has no video file in Drive — only LinkedIn/X (text-only) will be attempted`);
      }

      const freshUser = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
      if (!freshUser) continue;

      type StepResult = { success: boolean; error?: string };
      const results: {
        youtube: StepResult;
        tiktok: StepResult;
        instagram: StepResult;
        linkedin: StepResult;
        x: StepResult;
      } = {
        youtube: { success: false },
        tiktok: { success: false },
        instagram: { success: false },
        linkedin: { success: false },
        x: { success: false },
      };

      if (!video.videoFileDriveId) {
        results.youtube = { success: true };
        results.tiktok = { success: true };
        results.instagram = { success: true };
        console.log(`[Scheduler] YT/TT/IG skipped (no video file in Drive)`);
      } else {
        if (video.youtubeTitle || video.youtubeDescription) {
          results.youtube = await uploadToYouTube(video, freshUser);
        } else {
          results.youtube = { success: true };
          console.log(`[Scheduler] YouTube skipped (no title/desc configured)`);
        }

        const freshUser2 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
        if (freshUser2) {
          if (video.tiktokDescription || video.description) {
            results.tiktok = await uploadToTikTok(video, freshUser2);
          } else {
            results.tiktok = { success: true };
            console.log(`[Scheduler] TikTok skipped (no description)`);
          }
        }

        const freshUser3 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
        if (freshUser3) {
          if (video.instagramDescription || video.description) {
            results.instagram = await uploadToInstagram(video, freshUser3);
          } else {
            results.instagram = { success: true };
            console.log(`[Scheduler] Instagram skipped (no description)`);
          }
        }
      }

      const freshUser4 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
      if (freshUser4) {
        if (video.linkedinDescription) {
          results.linkedin = await publishToLinkedIn(video, freshUser4);
        } else {
          results.linkedin = { success: true };
          console.log(`[Scheduler] LinkedIn skipped (no description)`);
        }
      }

      const freshUser5 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
      if (freshUser5) {
        if (video.xDescription) {
          results.x = await publishToX(video, freshUser5);
        } else {
          results.x = { success: true };
          console.log(`[Scheduler] X skipped (no description)`);
        }
      }

      const allSuccess =
        results.youtube.success &&
        results.tiktok.success &&
        results.instagram.success &&
        results.linkedin.success &&
        results.x.success;
      const errors = [
        !results.youtube.success && results.youtube.error ? `YT: ${results.youtube.error}` : "",
        !results.tiktok.success && results.tiktok.error ? `TT: ${results.tiktok.error}` : "",
        !results.instagram.success && results.instagram.error ? `IG: ${results.instagram.error}` : "",
        !results.linkedin.success && results.linkedin.error ? `LI: ${results.linkedin.error}` : "",
        !results.x.success && results.x.error ? `X: ${results.x.error}` : "",
      ].filter(Boolean).join("; ");

      const anyAttempted =
        (video.youtubeTitle || video.youtubeDescription) ||
        video.tiktokDescription || video.description ||
        video.instagramDescription ||
        video.linkedinDescription ||
        video.xDescription;
      const anyRealSuccess =
        (results.youtube.success && (video.youtubeTitle || video.youtubeDescription)) ||
        (results.tiktok.success && (video.tiktokDescription || video.description)) ||
        (results.instagram.success && (video.instagramDescription || video.description)) ||
        (results.linkedin.success && video.linkedinDescription) ||
        (results.x.success && video.xDescription);

      let nextStatus: string;
      if (allSuccess && anyAttempted) nextStatus = "published";
      else if (anyRealSuccess) nextStatus = "partial";
      else nextStatus = "error";

      await db.update(videos).set({
        status: nextStatus,
        publishedAt: nextStatus === "published" || nextStatus === "partial" ? new Date() : undefined,
        updatedAt: new Date(),
      }).where(eq(videos.id, video.id));

      if (nextStatus === "published") {
        console.log(`[Scheduler] Video #${video.id} published to all platforms!`);
      } else if (nextStatus === "partial") {
        console.warn(`[Scheduler] Video #${video.id} published partially. Errors: ${errors}`);
      } else {
        console.error(`[Scheduler] Video #${video.id} had errors: ${errors}`);
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Fatal error:", err.message);
  } finally {
    schedulerRunning = false;
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startScheduler() {
  if (intervalId) return;
  console.log("[Scheduler] Started - checking every 60 seconds");
  processScheduledVideos();
  intervalId = setInterval(processScheduledVideos, 60 * 1000);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Scheduler] Stopped");
  }
}
