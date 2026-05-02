import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { google } from "googleapis";

const router: IRouter = Router();

const FACEBOOK_APP_ID = (process.env.FACEBOOK_APP_ID || "").trim();
const FACEBOOK_APP_SECRET = (process.env.FACEBOOK_APP_SECRET || "").trim();
const FACEBOOK_GRAPH_VERSION = "v21.0";
const FB_GRAPH_BASE = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
const FB_VIDEO_BASE = `https://graph-video.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
const FB_AUTH_BASE = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`;

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

function getFacebookRedirectUri(): string {
  if (process.env.FACEBOOK_REDIRECT_URI) return process.env.FACEBOOK_REDIRECT_URI;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}/api/facebook/callback`;
  return "https://admin.webmakerlatam.com/api/facebook/callback";
}

function isImageMime(mime?: string | null): boolean {
  if (!mime) return false;
  return mime.startsWith("image/");
}

function isVideoMime(mime?: string | null): boolean {
  if (!mime) return false;
  return mime.startsWith("video/");
}

function guessIsImageFromName(name?: string | null): boolean {
  if (!name) return false;
  return /\.(jpe?g|png|webp|gif)$/i.test(name);
}

router.get("/facebook/auth", (req: Request, res: Response) => {
  if (!FACEBOOK_APP_ID) {
    res.status(500).json({ error: "Facebook no está configurado en el servidor" });
    return;
  }
  const csrfState = crypto.randomBytes(16).toString("hex");
  res.cookie("facebook_csrf", csrfState, {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  const redirectUri = getFacebookRedirectUri();
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: redirectUri,
    state: csrfState,
    response_type: "code",
    scope: "public_profile,email",
  });

  const authUrl = `${FB_AUTH_BASE}?${params.toString()}`;
  console.log(`[Facebook] Redirecting to: ${authUrl}`);
  res.redirect(authUrl);
});

router.get("/facebook/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    console.error("[Facebook] Auth error:", error, error_description);
    res.redirect("/?facebook=error&msg=" + encodeURIComponent(error));
    return;
  }

  const csrfCookie = req.cookies?.facebook_csrf;
  if (!state || state !== csrfCookie) {
    console.error("[Facebook] CSRF mismatch");
    res.redirect("/?facebook=error&msg=csrf_mismatch");
    return;
  }
  res.clearCookie("facebook_csrf");

  if (!code) {
    res.redirect("/?facebook=error&msg=no_code");
    return;
  }

  try {
    const redirectUri = getFacebookRedirectUri();

    // 1. Exchange code for short-lived user token
    const tokenParams = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch(`${FB_GRAPH_BASE}/oauth/access_token?${tokenParams.toString()}`);
    const tokenData: any = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[Facebook] Token exchange failed:", tokenData);
      res.redirect("/?facebook=error&msg=token_failed");
      return;
    }

    // 2. Exchange short-lived for long-lived user token
    const longParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      fb_exchange_token: tokenData.access_token,
    });
    const longRes = await fetch(`${FB_GRAPH_BASE}/oauth/access_token?${longParams.toString()}`);
    const longData: any = await longRes.json();
    const longLivedUserToken: string = longData.access_token || tokenData.access_token;
    const expiresIn: number = longData.expires_in || tokenData.expires_in || 60 * 24 * 60 * 60;

    // 3. List pages the user manages
    const pagesRes = await fetch(
      `${FB_GRAPH_BASE}/me/accounts?fields=id,name,access_token,picture{url}&access_token=${encodeURIComponent(longLivedUserToken)}`,
    );
    const pagesData: any = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      console.error("[Facebook] No pages returned for user:", pagesData);
      res.redirect("/?facebook=error&msg=no_pages");
      return;
    }

    // Pick first page (selection UI lives in the redesign task)
    const page = pagesData.data[0];
    const pageId: string = page.id;
    const pageName: string = page.name;
    const pageAccessToken: string = page.access_token;
    const pagePicture: string | null = page.picture?.data?.url || null;

    const currentUser = req.user as any;
    if (!currentUser) {
      res.redirect("/?facebook=error&msg=not_logged_in");
      return;
    }

    await db.update(users).set({
      facebookPageId: pageId,
      facebookPageName: pageName,
      facebookPagePicture: pagePicture,
      facebookPageAccessToken: pageAccessToken,
      facebookUserAccessToken: longLivedUserToken,
      facebookTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    }).where(eq(users.id, currentUser.id));

    console.log(`[Facebook] Connected page "${pageName}" (${pageId}) for user ${currentUser.id}`);
    res.redirect("/?facebook=connected");
  } catch (err: any) {
    console.error("[Facebook] Callback error:", err.message);
    res.redirect("/?facebook=error&msg=" + encodeURIComponent(err.message));
  }
});

router.get("/facebook/status", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user.facebookPageAccessToken || !user.facebookPageId) {
    res.json({ connected: false, message: "Facebook no conectado. Usa el botón para conectar tu página." });
    return;
  }
  res.json({
    connected: true,
    pageName: user.facebookPageName,
    pagePicture: user.facebookPagePicture,
  });
});

router.post("/facebook/disconnect", async (req: Request, res: Response) => {
  const user = req.user as any;
  await db.update(users).set({
    facebookPageId: null,
    facebookPageName: null,
    facebookPagePicture: null,
    facebookPageAccessToken: null,
    facebookUserAccessToken: null,
    facebookTokenExpiresAt: null,
  }).where(eq(users.id, user.id));
  res.json({ success: true });
});

/**
 * Publishes a photo to a Facebook Page using multipart/form-data:
 *   POST /{page-id}/photos with `source` (binary), `caption`, `access_token`.
 */
async function publishFacebookPhoto(
  pageId: string,
  pageAccessToken: string,
  caption: string,
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append("caption", caption);
    form.append("access_token", pageAccessToken);
    form.append("published", "true");
    form.append("source", new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), "photo");

    const res = await fetch(`${FB_GRAPH_BASE}/${pageId}/photos`, {
      method: "POST",
      body: form,
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      const msg = data.error?.message || `HTTP ${res.status}`;
      console.error("[Facebook] photo publish failed:", res.status, data);
      return { success: false, error: msg };
    }
    return { success: true, postId: data.post_id || data.id };
  } catch (err: any) {
    console.error("[Facebook] photo publish error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Publishes a video to a Facebook Page via the non-resumable upload:
 *   POST graph-video.facebook.com/{page-id}/videos with multipart `source` (binary),
 *   `description`, `access_token`.
 *
 * For files larger than ~1GB the resumable upload would be required, but the
 * panel's source videos are well under that limit. The upload is created as
 * published=true so it appears immediately on the page feed.
 */
async function publishFacebookVideo(
  pageId: string,
  pageAccessToken: string,
  description: string,
  videoBuffer: Buffer,
  mimeType: string,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append("description", description);
    form.append("access_token", pageAccessToken);
    form.append("published", "true");
    form.append("source", new Blob([new Uint8Array(videoBuffer)], { type: mimeType || "video/mp4" }), "video.mp4");

    const res = await fetch(`${FB_VIDEO_BASE}/${pageId}/videos`, {
      method: "POST",
      body: form,
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      const msg = data.error?.message || `HTTP ${res.status}`;
      console.error("[Facebook] video publish failed:", res.status, data);
      return { success: false, error: msg };
    }
    return { success: true, postId: data.id };
  } catch (err: any) {
    console.error("[Facebook] video publish error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Top-level helper used by both the manual publish endpoint and the scheduler.
 * Decides between video and photo publication based on the file's MIME type
 * (or its name as a fallback) and posts the appropriate Graph endpoint.
 *
 * Caption falls back through facebookDescription → description → title to
 * mirror how the other social integrations resolve copy.
 */
export async function publishToFacebook(
  user: any,
  video: any,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  if (!user.facebookPageId || !user.facebookPageAccessToken) {
    return { success: false, error: "Facebook no conectado" };
  }
  if (!video.videoFileDriveId) {
    return { success: false, error: "El video no tiene archivo en Drive" };
  }

  const caption = video.facebookDescription || video.description || video.title;
  if (!caption || !caption.trim()) {
    return { success: false, error: "Sin texto para publicar en Facebook" };
  }

  try {
    const auth = getGoogleOAuth2Client(user);
    const drive = google.drive({ version: "v3", auth });

    let mimeType: string | null = null;
    try {
      const meta = await drive.files.get({ fileId: video.videoFileDriveId, fields: "mimeType,name" });
      mimeType = (meta.data as any).mimeType || null;
    } catch (err: any) {
      console.warn("[Facebook] could not read drive mimetype:", err.message);
    }

    const driveRes = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const buffer = Buffer.from(driveRes.data as ArrayBuffer);

    const treatAsImage =
      isImageMime(mimeType) ||
      (!isVideoMime(mimeType) && guessIsImageFromName(video.videoFileName));

    if (treatAsImage) {
      return publishFacebookPhoto(user.facebookPageId, user.facebookPageAccessToken, caption, buffer, mimeType || "image/jpeg");
    }
    return publishFacebookVideo(user.facebookPageId, user.facebookPageAccessToken, caption, buffer, mimeType || "video/mp4");
  } catch (err: any) {
    console.error("[Facebook] publish helper error:", err.message);
    return { success: false, error: err.message };
  }
}

router.post("/facebook/publish/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  const result = await publishToFacebook(user, video);

  if (result.success) {
    await db.update(videos).set({
      facebookPostId: result.postId || "ok",
      facebookStatus: "published",
      facebookError: null,
      updatedAt: new Date(),
    }).where(eq(videos.id, videoId));
    res.json({ success: true, postId: result.postId, message: "Publicado en Facebook" });
  } else {
    await db.update(videos).set({
      facebookStatus: "error",
      facebookError: result.error || "unknown",
      updatedAt: new Date(),
    }).where(eq(videos.id, videoId));
    res.status(500).json({ success: false, error: result.error });
  }
});

export default router;
