import { db } from "@workspace/db";
import { videos, users, publishAttempts } from "@workspace/db/schema";
import { eq, and, lte, or, isNull, sql } from "drizzle-orm";
import { google } from "googleapis";
import { Readable } from "stream";
import { randomBytes } from "crypto";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { registerTempFile, unregisterTempFile } from "./routes/instagram/temp-serve";
import { publishLinkedInPost, publishLinkedInVideo } from "./routes/linkedin";
import { publishXPost, publishXTweetWithVideo } from "./routes/x";
import { publishToFacebook } from "./routes/facebook";
import { createNotification } from "./lib/notifications";
import { checkConnectionsForAdmin } from "./lib/connections";

type PublishPlatform = "youtube" | "tiktok" | "instagram" | "linkedin" | "x" | "facebook";

const ALL_PLATFORMS: readonly PublishPlatform[] = [
  "youtube", "tiktok", "instagram", "linkedin", "x", "facebook",
] as const;

/**
 * Typed map from a platform name to its column accessors on the `videos`
 * row. Avoids ad-hoc `(video as any)["xNextRetryAt"]` lookups in the
 * retry-critical scheduling code.
 */
type PlatformVideoFields = {
  status: keyof typeof videos.$inferSelect;
  retries: keyof typeof videos.$inferSelect;
  error: keyof typeof videos.$inferSelect;
  nextRetryAt: keyof typeof videos.$inferSelect;
};
const PLATFORM_FIELDS: Record<PublishPlatform, PlatformVideoFields> = {
  youtube:   { status: "youtubeStatus",   retries: "youtubeRetries",   error: "youtubeError",   nextRetryAt: "youtubeNextRetryAt" },
  tiktok:    { status: "tiktokStatus",    retries: "tiktokRetries",    error: "tiktokError",    nextRetryAt: "tiktokNextRetryAt" },
  instagram: { status: "instagramStatus", retries: "instagramRetries", error: "instagramError", nextRetryAt: "instagramNextRetryAt" },
  linkedin:  { status: "linkedinStatus",  retries: "linkedinRetries",  error: "linkedinError",  nextRetryAt: "linkedinNextRetryAt" },
  x:         { status: "xStatus",         retries: "xRetries",         error: "xError",         nextRetryAt: "xNextRetryAt" },
  facebook:  { status: "facebookStatus",  retries: "facebookRetries",  error: "facebookError",  nextRetryAt: "facebookNextRetryAt" },
};

/** Read a typed field off a video row without unsafe `any` casts. */
function readField<T = unknown>(video: typeof videos.$inferSelect, key: keyof typeof videos.$inferSelect): T {
  return (video as Record<string, unknown>)[key as string] as T;
}

/** Max number of post-initial retries before marking a platform as failed for good. */
const MAX_RETRIES = 3;
/** Backoff schedule, indexed by current retry attempt (0-based). 1m, 5m, 30m. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];

/**
 * Append-only audit entry for an individual publish attempt. Survives the
 * mutation of the video's per-platform status/error columns, so the UI can
 * show the full retry timeline (attempt #, outcome, error reason, next retry).
 */
async function logAttempt(input: {
  videoId: number;
  platform: PublishPlatform;
  attemptNumber: number;
  outcome: "success" | "transient_failure" | "permanent_failure" | "skipped";
  errorKind?: "transient" | "permanent" | null;
  errorMessage?: string | null;
  nextRetryAt?: Date | null;
}): Promise<void> {
  try {
    await db.insert(publishAttempts).values({
      videoId: input.videoId,
      platform: input.platform,
      attemptNumber: input.attemptNumber,
      outcome: input.outcome,
      errorKind: input.errorKind ?? null,
      errorMessage: input.errorMessage ? input.errorMessage.slice(0, 1000) : null,
      nextRetryAt: input.nextRetryAt ?? null,
    });
  } catch (err: any) {
    console.error("[Scheduler] Failed to log publish attempt:", err?.message || err);
  }
}

/**
 * Classify a publish-step error message as either transient (worth retrying)
 * or permanent (auth, bad request, etc — retrying won't help).
 */
function classifyError(err: string | undefined | null): "transient" | "permanent" {
  if (!err) return "permanent";
  const e = err.toLowerCase();
  if (/\b5\d{2}\b/.test(e)) return "transient";
  if (/\b429\b|rate.?limit|too many requests|quota/.test(e)) return "transient";
  if (/timeout|timed out|etimedout|econnreset|econnrefused|enetunreach|socket hang up|fetch failed|network|temporar|service unavailable/.test(e)) return "transient";
  return "permanent";
}

/**
 * Record a publish failure: classifies the error and either schedules a retry
 * (status = "retrying", bumps retry counter, sets nextRetryAt) or marks the
 * platform as permanently failed (status = "error").
 */
async function recordFailure(videoId: number, platform: PublishPlatform, errorMsg: string): Promise<void> {
  const [v] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!v) return;
  const fields = PLATFORM_FIELDS[platform];
  const current = (readField<number | null>(v, fields.retries)) ?? 0;
  const kind = classifyError(errorMsg);
  const update: Record<string, unknown> = {
    [fields.error]: errorMsg.slice(0, 1000),
    updatedAt: new Date(),
  };
  if (kind === "transient" && current < MAX_RETRIES) {
    const idx = Math.min(current, BACKOFF_MS.length - 1);
    const nextAt = new Date(Date.now() + BACKOFF_MS[idx]);
    update[fields.status as string] = "retrying";
    update[fields.retries as string] = current + 1;
    update[fields.nextRetryAt as string] = nextAt;
    // Recompute video-level nextRetryAt as MIN of all per-platform deadlines.
    const deadlines: number[] = [nextAt.getTime()];
    for (const p of ALL_PLATFORMS) {
      if (p === platform) continue;
      const f = PLATFORM_FIELDS[p];
      const d = readField<Date | string | null>(v, f.nextRetryAt);
      const status = readField<string | null>(v, f.status);
      if (d && status === "retrying") {
        const ts = new Date(d).getTime();
        if (ts > Date.now()) deadlines.push(ts);
      }
    }
    update.nextRetryAt = new Date(Math.min(...deadlines));
    await db.update(videos).set(update).where(eq(videos.id, videoId));
    await logAttempt({
      videoId, platform, attemptNumber: current + 1,
      outcome: "transient_failure", errorKind: "transient",
      errorMessage: errorMsg, nextRetryAt: nextAt,
    });
    console.log(`[Scheduler] ${platform} retry scheduled #${current + 1}/${MAX_RETRIES} at ${nextAt.toISOString()} (transient: ${errorMsg})`);
  } else {
    update[fields.status as string] = "error";
    update[fields.nextRetryAt as string] = null;
    await db.update(videos).set(update).where(eq(videos.id, videoId));
    await logAttempt({
      videoId, platform, attemptNumber: current + 1,
      outcome: "permanent_failure", errorKind: kind,
      errorMessage: errorMsg, nextRetryAt: null,
    });
    console.log(`[Scheduler] ${platform} marked error (${kind}, retries=${current}): ${errorMsg}`);
  }
}

/** True if a platform is in a terminal failure state and should not be re-attempted. */
function isTerminalError(video: typeof videos.$inferSelect, platform: PublishPlatform): boolean {
  return readField<string | null>(video, PLATFORM_FIELDS[platform].status) === "error";
}

/**
 * True when a platform is currently in a retry cooldown window — i.e. it failed
 * recently with a transient error and its per-platform backoff hasn't elapsed.
 * Callers should treat this as "skip silently" (do NOT mark the video as
 * failed, do NOT increment any counter).
 */
function isRetryCooldown(video: typeof videos.$inferSelect, platform: PublishPlatform): boolean {
  const fields = PLATFORM_FIELDS[platform];
  if (readField<string | null>(video, fields.status) !== "retrying") return false;
  const d = readField<Date | string | null>(video, fields.nextRetryAt);
  if (!d) return false;
  return new Date(d).getTime() > Date.now();
}

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
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.REPLIT_DEPLOYMENT_URL) return process.env.REPLIT_DEPLOYMENT_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "https://admin.webmakerlatam.com";
}

async function persistPlatformError(videoId: number, platform: "youtube" | "tiktok" | "instagram", error: string) {
  await recordFailure(videoId, platform, error);
}

async function uploadToYouTube(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (!user.googleAccessToken || !user.googleRefreshToken) {
    const error = "No Google tokens";
    await persistPlatformError(video.id, "youtube", error);
    return { success: false, error };
  }
  if (!video.videoFileDriveId) {
    const error = "No video file in Drive";
    await persistPlatformError(video.id, "youtube", error);
    return { success: false, error };
  }
  if (video.youtubeVideoId) {
    return { success: true };
  }
  if (isTerminalError(video, "youtube")) return { success: false, error: video.youtubeError || "previously failed" };

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
      youtubeError: null,
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));

    console.log(`[Scheduler] YouTube upload success: ${ytVideoId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Scheduler] YouTube upload error: ${err.message}`);
    await recordFailure(video.id, "youtube", err.message);
    return { success: false, error: err.message };
  }
}

async function uploadToTikTok(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.tiktokPublishId) {
    return { success: true };
  }
  if (isTerminalError(video, "tiktok")) return { success: false, error: video.tiktokError || "previously failed" };

  const token = await getValidTikTokToken(user);
  if (!token) {
    const error = "No TikTok token";
    await persistPlatformError(video.id, "tiktok", error);
    return { success: false, error };
  }
  if (!video.videoFileDriveId) {
    const error = "No video file in Drive";
    await persistPlatformError(video.id, "tiktok", error);
    return { success: false, error };
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
      const error = `TikTok init failed: ${initData.error?.message || JSON.stringify(initData.error)}`;
      await persistPlatformError(video.id, "tiktok", error);
      return { success: false, error };
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;

    if (!uploadUrl) {
      const error = "No TikTok upload URL";
      await persistPlatformError(video.id, "tiktok", error);
      return { success: false, error };
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
        const error = `TikTok chunk ${i} upload failed`;
        await persistPlatformError(video.id, "tiktok", error);
        return { success: false, error };
      }
    }

    await db.update(videos).set({
      tiktokPublishId: publishId,
      tiktokStatus: "uploaded",
      tiktokError: null,
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));

    console.log(`[Scheduler] TikTok upload success: ${publishId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Scheduler] TikTok upload error: ${err.message}`);
    await recordFailure(video.id, "tiktok", err.message);
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
  if (isTerminalError(video, "linkedin")) return { success: false, error: video.linkedinError || "previously failed" };
  if (!user.linkedinAccessToken || !user.linkedinPersonUrn) {
    const error = "LinkedIn not connected";
    await recordFailure(video.id, "linkedin", error);
    return { success: false, error };
  }
  const content = video.linkedinDescription || video.description || video.title;
  if (!content || !content.trim()) {
    const error = "Empty LinkedIn content";
    await recordFailure(video.id, "linkedin", error);
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
    await recordFailure(video.id, "linkedin", result.error || "unknown");
  }
  return result;
}

async function publishToX(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.xPostId) return { success: true };
  if (isTerminalError(video, "x")) return { success: false, error: video.xError || "previously failed" };
  if (!user.xAccessToken || !user.xUserId) {
    const error = "X not connected";
    await recordFailure(video.id, "x", error);
    return { success: false, error };
  }
  const content = video.xDescription || video.description || video.title;
  if (!content || !content.trim()) {
    const error = "Empty X content";
    await recordFailure(video.id, "x", error);
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
    await recordFailure(video.id, "x", result.error || "unknown");
  }
  return result;
}

const SERVER_FB_PAGE_ID = (process.env.FACEBOOK_PAGE_ID || "").trim();
const SERVER_FB_PAGE_TOKEN = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();

async function publishToFacebookStep(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.facebookPostId) return { success: true };
  if (isTerminalError(video, "facebook")) return { success: false, error: video.facebookError || "previously failed" };

  // Accept either server-side permanent tokens or user OAuth tokens
  const hasServerTokens = !!(SERVER_FB_PAGE_ID && SERVER_FB_PAGE_TOKEN);
  const hasUserTokens = !!(user.facebookPageId && user.facebookPageAccessToken);
  if (!hasServerTokens && !hasUserTokens) {
    const error = "Facebook not connected";
    await recordFailure(video.id, "facebook", error);
    return { success: false, error };
  }

  const result = await publishToFacebook(user, video);

  if (result.success) {
    await db.update(videos).set({
      facebookPostId: result.postId || "ok",
      facebookStatus: "published",
      facebookError: null,
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));
    console.log(`[Scheduler] Facebook publish success: ${result.postId}`);
  } else {
    await recordFailure(video.id, "facebook", result.error || "unknown");
  }
  return result;
}

async function uploadToInstagram(video: any, user: any): Promise<{ success: boolean; error?: string }> {
  if (video.instagramMediaId) {
    return { success: true };
  }
  if (isTerminalError(video, "instagram")) return { success: false, error: video.instagramError || "previously failed" };
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
    const error = "Instagram not configured";
    await persistPlatformError(video.id, "instagram", error);
    return { success: false, error };
  }
  if (!video.videoFileDriveId) {
    const error = "No video file in Drive";
    await persistPlatformError(video.id, "instagram", error);
    return { success: false, error };
  }
  if (!user.googleAccessToken || !user.googleRefreshToken) {
    const error = "No Google tokens for Drive access";
    await persistPlatformError(video.id, "instagram", error);
    return { success: false, error };
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
      instagramError: null,
      updatedAt: new Date(),
    }).where(eq(videos.id, video.id));

    console.log(`[Scheduler] Instagram upload success: ${mediaId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Scheduler] Instagram upload error: ${err.message}`);
    await recordFailure(video.id, "instagram", err.message);
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
    // Pick up: (a) videos due to publish for the first time, AND
    //          (b) videos with a pending retry whose backoff window elapsed.
    //              Restricted to retry-eligible statuses so legacy/dirty rows
    //              with stale nextRetryAt values can't trigger reprocessing.
    const dueVideos = await db
      .select()
      .from(videos)
      .where(or(
        and(
          eq(videos.status, "scheduled"),
          or(lte(videos.scheduledAt, now), isNull(videos.scheduledAt)),
        ),
        and(
          sql`${videos.nextRetryAt} IS NOT NULL`,
          lte(videos.nextRetryAt, now),
          or(
            eq(videos.status, "scheduled"),
            eq(videos.status, "partial"),
          ),
        ),
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
        facebook: StepResult;
      } = {
        youtube: { success: false },
        tiktok: { success: false },
        instagram: { success: false },
        linkedin: { success: false },
        x: { success: false },
        facebook: { success: false },
      };
      // Per-platform cooldown bookkeeping: set when a platform is in "retrying"
      // status but its individual backoff window has not elapsed. Cooldown
      // platforms are NOT attempted this tick and do NOT contribute to
      // success/failure tallies — the video stays scheduled for the next tick.
      const cooldown: Record<PublishPlatform, boolean> = {
        youtube: false, tiktok: false, instagram: false,
        linkedin: false, x: false, facebook: false,
      };
      function logCooldown(p: PublishPlatform) {
        const at = (video as any)[`${p}NextRetryAt`];
        console.log(`[Scheduler] ${p} on cooldown until ${at ? new Date(at).toISOString() : "?"} — skipping this tick`);
      }

      if (!video.videoFileDriveId) {
        results.youtube = { success: true };
        results.tiktok = { success: true };
        results.instagram = { success: true };
        console.log(`[Scheduler] YT/TT/IG skipped (no video file in Drive)`);
      } else {
        if (isRetryCooldown(video, "youtube")) {
          cooldown.youtube = true; logCooldown("youtube");
          results.youtube = { success: false };
        } else if (video.youtubeTitle || video.youtubeDescription) {
          results.youtube = await uploadToYouTube(video, freshUser);
        } else {
          results.youtube = { success: true };
          console.log(`[Scheduler] YouTube skipped (no title/desc configured)`);
        }

        const freshUser2 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
        if (freshUser2) {
          if (isRetryCooldown(video, "tiktok")) {
            cooldown.tiktok = true; logCooldown("tiktok");
            results.tiktok = { success: false };
          } else if (video.tiktokDescription || video.description) {
            results.tiktok = await uploadToTikTok(video, freshUser2);
          } else {
            results.tiktok = { success: true };
            console.log(`[Scheduler] TikTok skipped (no description)`);
          }
        }

        const freshUser3 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
        if (freshUser3) {
          if (isRetryCooldown(video, "instagram")) {
            cooldown.instagram = true; logCooldown("instagram");
            results.instagram = { success: false };
          } else if (video.instagramDescription || video.description) {
            results.instagram = await uploadToInstagram(video, freshUser3);
          } else {
            results.instagram = { success: true };
            console.log(`[Scheduler] Instagram skipped (no description)`);
          }
        }
      }

      const freshUser4 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
      if (freshUser4) {
        if (isRetryCooldown(video, "linkedin")) {
          cooldown.linkedin = true; logCooldown("linkedin");
          results.linkedin = { success: false };
        } else if (video.linkedinDescription) {
          results.linkedin = await publishToLinkedIn(video, freshUser4);
        } else {
          results.linkedin = { success: true };
          console.log(`[Scheduler] LinkedIn skipped (no description)`);
        }
      }

      const freshUser5 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
      if (freshUser5) {
        if (isRetryCooldown(video, "x")) {
          cooldown.x = true; logCooldown("x");
          results.x = { success: false };
        } else if (video.xDescription) {
          results.x = await publishToX(video, freshUser5);
        } else {
          results.x = { success: true };
          console.log(`[Scheduler] X skipped (no description)`);
        }
      }

      // Facebook is opt-in: only publish when the wizard explicitly set facebookStatus="pending"
      // AND facebookDescription is present (double-guard against schema default="pending")
      const facebookIncluded = (video.facebookStatus === "pending" || video.facebookStatus === "retrying") && !!video.facebookDescription;
      const freshUser6 = await db.select().from(users).where(eq(users.id, adminUser.id)).limit(1).then(r => r[0]);
      if (freshUser6) {
        if (isRetryCooldown(video, "facebook")) {
          cooldown.facebook = true; logCooldown("facebook");
          results.facebook = { success: false };
        } else if (facebookIncluded) {
          results.facebook = await publishToFacebookStep(video, freshUser6);
        } else {
          results.facebook = { success: true };
          console.log(`[Scheduler] Facebook skipped (not included by user)`);
        }
      }
      const anyCooldown = Object.values(cooldown).some(Boolean);

      const allSuccess =
        results.youtube.success &&
        results.tiktok.success &&
        results.instagram.success &&
        results.linkedin.success &&
        results.x.success &&
        results.facebook.success;
      const errors = [
        !results.youtube.success && results.youtube.error ? `YT: ${results.youtube.error}` : "",
        !results.tiktok.success && results.tiktok.error ? `TT: ${results.tiktok.error}` : "",
        !results.instagram.success && results.instagram.error ? `IG: ${results.instagram.error}` : "",
        !results.linkedin.success && results.linkedin.error ? `LI: ${results.linkedin.error}` : "",
        !results.x.success && results.x.error ? `X: ${results.x.error}` : "",
        !results.facebook.success && results.facebook.error ? `FB: ${results.facebook.error}` : "",
      ].filter(Boolean).join("; ");

      const anyAttempted =
        (video.youtubeTitle || video.youtubeDescription) ||
        video.tiktokDescription || video.description ||
        video.instagramDescription ||
        video.linkedinDescription ||
        video.xDescription ||
        facebookIncluded;
      const anyRealSuccess =
        (results.youtube.success && (video.youtubeTitle || video.youtubeDescription)) ||
        (results.tiktok.success && (video.tiktokDescription || video.description)) ||
        (results.instagram.success && (video.instagramDescription || video.description)) ||
        (results.linkedin.success && video.linkedinDescription) ||
        (results.x.success && video.xDescription) ||
        (results.facebook.success && facebookIncluded);

      // Reload AFTER all platform attempts so we observe the side-effects of
      // recordFailure() (status="retrying", *NextRetryAt, etc).
      const [postRun] = await db.select({
        youtubeStatus: videos.youtubeStatus,
        tiktokStatus: videos.tiktokStatus,
        instagramStatus: videos.instagramStatus,
        linkedinStatus: videos.linkedinStatus,
        xStatus: videos.xStatus,
        facebookStatus: videos.facebookStatus,
        nextRetryAt: videos.nextRetryAt,
        youtubeNextRetryAt: videos.youtubeNextRetryAt,
        tiktokNextRetryAt: videos.tiktokNextRetryAt,
        instagramNextRetryAt: videos.instagramNextRetryAt,
        linkedinNextRetryAt: videos.linkedinNextRetryAt,
        xNextRetryAt: videos.xNextRetryAt,
        facebookNextRetryAt: videos.facebookNextRetryAt,
      }).from(videos).where(eq(videos.id, video.id)).limit(1);
      const stillRetrying = postRun
        ? ALL_PLATFORMS.some((p) => (postRun as Record<string, unknown>)[PLATFORM_FIELDS[p].status as string] === "retrying")
        : false;
      // Recompute the video-level wake-up time as MIN of all live per-platform deadlines.
      let videoNextRetryAt: Date | null | undefined = null;
      if (stillRetrying && postRun) {
        const candidates: number[] = [];
        for (const p of ALL_PLATFORMS) {
          const f = PLATFORM_FIELDS[p];
          if ((postRun as Record<string, unknown>)[f.status as string] !== "retrying") continue;
          const d = (postRun as Record<string, unknown>)[f.nextRetryAt as string] as Date | string | null;
          if (d) candidates.push(new Date(d).getTime());
        }
        if (candidates.length) videoNextRetryAt = new Date(Math.min(...candidates));
        // If statuses are "retrying" but no deadlines are set (shouldn't normally
        // happen), leave existing nextRetryAt untouched.
        else videoNextRetryAt = undefined;
      }

      // Append-only success logging: only log a success when this run actually
      // attempted the platform (skipped/cooldown platforms don't get an entry).
      const successResults: Array<[PublishPlatform, boolean]> = [
        ["youtube",   results.youtube.success   && !cooldown.youtube   && !!(video.youtubeTitle || video.youtubeDescription)],
        ["tiktok",    results.tiktok.success    && !cooldown.tiktok    && !!(video.tiktokDescription || video.description)],
        ["instagram", results.instagram.success && !cooldown.instagram && !!(video.instagramDescription || video.description)],
        ["linkedin",  results.linkedin.success  && !cooldown.linkedin  && !!video.linkedinDescription],
        ["x",         results.x.success         && !cooldown.x         && !!video.xDescription],
        ["facebook",  results.facebook.success  && !cooldown.facebook  && facebookIncluded],
      ];
      for (const [p, ok] of successResults) {
        if (!ok) continue;
        const fields = PLATFORM_FIELDS[p];
        const attemptNumber = (readField<number | null>(video, fields.retries) ?? 0) + 1;
        await logAttempt({ videoId: video.id, platform: p, attemptNumber, outcome: "success" });
      }

      // Compute next status AFTER reading post-run state so any platform that
      // got scheduled for a retry (anyCooldown OR stillRetrying) keeps the
      // video in a retry-eligible status — the scheduler must be able to
      // re-pick it via nextRetryAt. Only mark "error" once the retry budget
      // is exhausted on every failing platform.
      let nextStatus: string;
      if (anyCooldown || stillRetrying) {
        // If any real success already happened keep "partial" so the user sees
        // partial progress; otherwise stay in "scheduled" for the retry pass.
        nextStatus = anyRealSuccess ? "partial" : (video.status === "scheduled" || video.status === "partial" ? video.status : "scheduled");
      } else if (allSuccess && anyAttempted) nextStatus = "published";
      else if (anyRealSuccess) nextStatus = "partial";
      else nextStatus = "error";

      await db.update(videos).set({
        status: nextStatus,
        workflowStatus: nextStatus === "published" ? "publicado" : undefined,
        publishedAt: nextStatus === "published" || nextStatus === "partial" ? new Date() : undefined,
        nextRetryAt: videoNextRetryAt,
        updatedAt: new Date(),
      }).where(eq(videos.id, video.id));

      if (nextStatus === "published") {
        console.log(`[Scheduler] Video #${video.id} published to all platforms!`);
      } else if (nextStatus === "partial") {
        console.warn(`[Scheduler] Video #${video.id} published partially. Errors: ${errors}`);
      } else {
        console.error(`[Scheduler] Video #${video.id} had errors: ${errors}`);
      }

      // Notify the admin user (single-tenant) about the outcome. We always pick
      // the first admin user — same logic the scheduler uses for credentials.
      // Skip notifications while retries are still pending so the user only
      // hears about a definitive failure once the retry budget is exhausted.
      try {
        if (stillRetrying || anyCooldown) {
          const nextAtStr = videoNextRetryAt ? new Date(videoNextRetryAt).toISOString() : "pronto";
          console.log(`[Scheduler] Video #${video.id} retries pending; next attempt ~${nextAtStr}. Skipping outcome notification.`);
        } else if (nextStatus === "published") {
          await createNotification({
            userId: adminUser.id,
            type: "publish_success",
            title: "Publicación exitosa",
            body: `"${video.title}" se publicó correctamente.`,
            link: `/videos?select=${video.id}`,
          });
        } else if (nextStatus === "partial") {
          await createNotification({
            userId: adminUser.id,
            type: "publish_partial",
            title: "Publicación parcial",
            body: `"${video.title}" tuvo errores en algunas redes: ${errors}`,
            link: `/videos?select=${video.id}`,
          });
        } else {
          await createNotification({
            userId: adminUser.id,
            type: "publish_error",
            title: "Error al publicar",
            body: `"${video.title}" falló tras agotar reintentos: ${errors || "error desconocido"}`,
            link: `/videos?select=${video.id}`,
          });
        }
      } catch (notifErr: any) {
        console.error("[Scheduler] Failed to create notification:", notifErr?.message || notifErr);
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Fatal error:", err.message);
  } finally {
    schedulerRunning = false;
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function retryPlatformForVideo(
  videoId: number,
  platform: string,
  user: any,
): Promise<{ success: boolean; error?: string }> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return { success: false, error: "Video not found" };

  switch (platform) {
    case "youtube":
      return uploadToYouTube(video, user);
    case "tiktok":
      return uploadToTikTok(video, user);
    case "instagram":
      return uploadToInstagram(video, user);
    case "linkedin":
      return publishToLinkedIn(video, user);
    case "x":
      return publishToX(video, user);
    case "facebook":
      return publishToFacebookStep(video, user);
    default:
      return { success: false, error: `Unknown platform: ${platform}` };
  }
}

async function tick() {
  await processScheduledVideos();
  // Daily-debounced inside checkConnectionsForAdmin, safe to call every minute.
  try {
    await checkConnectionsForAdmin();
  } catch (err: any) {
    console.error("[Scheduler] checkConnectionsForAdmin failed:", err?.message || err);
  }
}

export function startScheduler() {
  if (intervalId) return;
  console.log("[Scheduler] Started - checking every 60 seconds");
  tick();
  intervalId = setInterval(tick, 60 * 1000);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Scheduler] Stopped");
  }
}
