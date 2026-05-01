import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

const X_CLIENT_ID = (process.env.X_CLIENT_ID || "").trim();
const X_CLIENT_SECRET = (process.env.X_CLIENT_SECRET || "").trim();
const X_AUTH_BASE = "https://twitter.com/i/oauth2";
const X_API_BASE = "https://api.twitter.com/2";

function getXRedirectUri(): string {
  return process.env.X_REDIRECT_URI || "https://admin.webmakerchile.com/api/x/callback";
}

function generatePkce() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function basicAuthHeader() {
  return "Basic " + Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64");
}

async function refreshXToken(user: any): Promise<string | null> {
  if (!user.xRefreshToken) return null;
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: user.xRefreshToken,
      client_id: X_CLIENT_ID,
    });
    const res = await fetch(`${X_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: params.toString(),
    });
    const data: any = await res.json();
    if (data.access_token) {
      await db.update(users).set({
        xAccessToken: data.access_token,
        xRefreshToken: data.refresh_token || user.xRefreshToken,
        xTokenExpiresAt: new Date(Date.now() + (data.expires_in || 7200) * 1000),
      }).where(eq(users.id, user.id));
      return data.access_token;
    }
    console.error("[X] Token refresh failed:", data);
    return null;
  } catch (err: any) {
    console.error("[X] Token refresh error:", err.message);
    return null;
  }
}

export async function getValidXToken(user: any): Promise<string | null> {
  if (!user.xAccessToken) return null;
  if (user.xTokenExpiresAt && new Date(user.xTokenExpiresAt) > new Date()) {
    return user.xAccessToken;
  }
  return refreshXToken(user);
}

router.get("/x/auth", (req: Request, res: Response) => {
  if (!X_CLIENT_ID) {
    res.status(500).json({ error: "X no está configurado en el servidor" });
    return;
  }
  const csrfState = crypto.randomBytes(16).toString("hex");
  const { verifier, challenge } = generatePkce();

  res.cookie("x_csrf", csrfState, {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  res.cookie("x_pkce", verifier, {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  const redirectUri = getXRedirectUri();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: X_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "tweet.read tweet.write users.read media.write offline.access",
    state: csrfState,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  console.log(`[X] Redirecting to: ${authUrl}`);
  res.redirect(authUrl);
});

router.get("/x/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    console.error("[X] Auth error:", error, error_description);
    res.redirect("/?x=error&msg=" + encodeURIComponent(error));
    return;
  }

  const csrfCookie = req.cookies?.x_csrf;
  const verifier = req.cookies?.x_pkce;

  if (!state || state !== csrfCookie) {
    console.error("[X] CSRF mismatch");
    res.redirect("/?x=error&msg=csrf_mismatch");
    return;
  }
  if (!verifier) {
    console.error("[X] Missing PKCE verifier");
    res.redirect("/?x=error&msg=missing_pkce");
    return;
  }

  res.clearCookie("x_csrf");
  res.clearCookie("x_pkce");

  if (!code) {
    res.redirect("/?x=error&msg=no_code");
    return;
  }

  try {
    const redirectUri = getXRedirectUri();
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: X_CLIENT_ID,
      code_verifier: verifier,
    });

    const tokenRes = await fetch(`${X_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: params.toString(),
    });

    const tokenData: any = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[X] Token exchange failed:", tokenData);
      res.redirect("/?x=error&msg=token_failed");
      return;
    }

    const currentUser = req.user as any;
    if (!currentUser) {
      res.redirect("/?x=error&msg=not_logged_in");
      return;
    }

    let xUserId: string | null = null;
    let xUsername: string | null = null;
    try {
      const meRes = await fetch(`${X_API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const meData: any = await meRes.json();
      if (meData.data) {
        xUserId = meData.data.id;
        xUsername = meData.data.username;
      }
    } catch (err: any) {
      console.error("[X] users/me fetch failed:", err.message);
    }

    await db.update(users).set({
      xAccessToken: tokenData.access_token,
      xRefreshToken: tokenData.refresh_token || null,
      xTokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 7200) * 1000),
      xUserId,
      xUsername,
    }).where(eq(users.id, currentUser.id));

    console.log(`[X] Connected for user ${currentUser.id}, x user: @${xUsername}`);
    res.redirect("/?x=connected");
  } catch (err: any) {
    console.error("[X] Callback error:", err.message);
    res.redirect("/?x=error&msg=" + encodeURIComponent(err.message));
  }
});

router.get("/x/status", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user.xAccessToken || !user.xUserId) {
    res.json({ connected: false, message: "X no conectado. Usa el botón para conectar tu cuenta." });
    return;
  }
  const token = await getValidXToken(user);
  if (!token) {
    res.json({ connected: false, message: "Token de X expirado. Reconecta tu cuenta." });
    return;
  }
  res.json({
    connected: true,
    user: {
      id: user.xUserId,
      username: user.xUsername,
    },
  });
});

router.post("/x/disconnect", async (req: Request, res: Response) => {
  const user = req.user as any;
  await db.update(users).set({
    xAccessToken: null,
    xRefreshToken: null,
    xTokenExpiresAt: null,
    xUserId: null,
    xUsername: null,
  }).where(eq(users.id, user.id));
  res.json({ success: true });
});

/**
 * Posts a text-only tweet via the X v2 API. Truncates to 280 chars to respect X limits.
 * Free tier media uploads require v1.1 endpoints we don't currently support.
 */
export async function publishXPost(
  user: any,
  content: string,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = await getValidXToken(user);
  if (!token) return { success: false, error: "No X token" };

  const text = (content || "").slice(0, 280);
  if (!text.trim()) return { success: false, error: "Empty tweet" };

  try {
    const res = await fetch(`${X_API_BASE}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const data: any = await res.json();

    if (!res.ok || data.errors) {
      const msg = data.errors?.[0]?.message || data.detail || data.title || `HTTP ${res.status}`;
      console.error("[X] Publish failed:", res.status, data);
      return { success: false, error: msg };
    }

    return { success: true, postId: data.data?.id };
  } catch (err: any) {
    console.error("[X] Publish error:", err.message);
    return { success: false, error: err.message };
  }
}

const X_MEDIA_UPLOAD_URL_V2 = "https://api.x.com/2/media/upload";
const X_MEDIA_UPLOAD_URL_V1 = "https://upload.twitter.com/1.1/media/upload.json";

async function uploadVideoChunked(
  baseUrl: string,
  token: string,
  videoBuffer: Buffer,
): Promise<{ mediaId: string } | { error: string; status: number }> {
  const totalBytes = videoBuffer.length;
  const initParams = new URLSearchParams({
    command: "INIT",
    total_bytes: String(totalBytes),
    media_type: "video/mp4",
    media_category: "tweet_video",
  });
  const initRes = await fetch(`${baseUrl}?${initParams.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    console.error(`[X] media INIT failed (${baseUrl}):`, initRes.status, t);
    return { error: `media INIT ${initRes.status}`, status: initRes.status };
  }
  const initData: any = await initRes.json();
  const mediaId: string | undefined = initData?.data?.id || initData?.media_id_string || initData?.media_id;
  if (!mediaId) return { error: "media INIT no id", status: 0 };

  const chunkSize = 4 * 1024 * 1024;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize));
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalBytes);
    const chunk = videoBuffer.subarray(start, end);
    const form = new FormData();
    form.append("command", "APPEND");
    form.append("media_id", mediaId);
    form.append("segment_index", String(i));
    form.append("media", new Blob([new Uint8Array(chunk)], { type: "application/octet-stream" }));
    const appRes = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!appRes.ok) {
      const t = await appRes.text();
      console.error(`[X] media APPEND failed (${baseUrl}):`, appRes.status, t);
      return { error: `media APPEND ${appRes.status}`, status: appRes.status };
    }
  }

  const finParams = new URLSearchParams({ command: "FINALIZE", media_id: mediaId });
  const finRes = await fetch(`${baseUrl}?${finParams.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!finRes.ok) {
    const t = await finRes.text();
    console.error(`[X] media FINALIZE failed (${baseUrl}):`, finRes.status, t);
    return { error: `media FINALIZE ${finRes.status}`, status: finRes.status };
  }
  const finData: any = await finRes.json();
  let processingInfo = finData?.data?.processing_info || finData?.processing_info;
  while (processingInfo && (processingInfo.state === "pending" || processingInfo.state === "in_progress")) {
    await new Promise((r) => setTimeout(r, (processingInfo.check_after_secs || 5) * 1000));
    const statusParams = new URLSearchParams({ command: "STATUS", media_id: mediaId });
    const statusRes = await fetch(`${baseUrl}?${statusParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!statusRes.ok) return { error: `media STATUS ${statusRes.status}`, status: statusRes.status };
    const statusData: any = await statusRes.json();
    processingInfo = statusData?.data?.processing_info || statusData?.processing_info;
  }
  if (processingInfo && processingInfo.state === "failed") {
    return { error: `media processing failed: ${processingInfo?.error?.message || "unknown"}`, status: 0 };
  }
  return { mediaId };
}

/**
 * Uploads a video to X via the chunked media/upload endpoint (INIT/APPEND/FINALIZE +
 * STATUS polling) using the OAuth 2.0 user-context Bearer token, then publishes a
 * tweet referencing the resulting media_id. Requires the `media.write` scope.
 *
 * Tries the v2 endpoint first (api.x.com/2/media/upload). If v2 returns 403/404
 * (typical when the app/tier hasn't enabled v2 media), it falls back to the
 * legacy v1.1 endpoint (upload.twitter.com/1.1/media/upload.json) which is
 * available on the Free tier.
 */
export async function publishXTweetWithVideo(
  user: any,
  content: string,
  videoBuffer: Buffer,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = await getValidXToken(user);
  if (!token) return { success: false, error: "No X token" };

  const text = (content || "").slice(0, 280);

  try {
    let upload = await uploadVideoChunked(X_MEDIA_UPLOAD_URL_V2, token, videoBuffer);
    if ("error" in upload && (upload.status === 403 || upload.status === 404)) {
      console.warn(`[X] v2 media upload returned ${upload.status}; falling back to v1.1`);
      upload = await uploadVideoChunked(X_MEDIA_UPLOAD_URL_V1, token, videoBuffer);
    }
    if ("error" in upload) {
      return { success: false, error: upload.error };
    }
    const mediaId = upload.mediaId;

    const tweetBody: any = { media: { media_ids: [mediaId] } };
    if (text.trim()) tweetBody.text = text;
    const tweetRes = await fetch(`${X_API_BASE}/tweets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(tweetBody),
    });
    const tweetData: any = await tweetRes.json();
    if (!tweetRes.ok || tweetData.errors) {
      const msg = tweetData.errors?.[0]?.message || tweetData.detail || tweetData.title || `HTTP ${tweetRes.status}`;
      console.error("[X] tweet with media failed:", tweetRes.status, tweetData);
      return { success: false, error: msg };
    }
    return { success: true, postId: tweetData.data?.id };
  } catch (err: any) {
    console.error("[X] Publish video error:", err.message);
    return { success: false, error: err.message };
  }
}

router.post("/x/publish/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  const content = video.xDescription || video.description || video.title;
  const result = await publishXPost(user, content);

  if (result.success) {
    await db.update(videos).set({
      xPostId: result.postId,
      xStatus: "published",
      updatedAt: new Date(),
    }).where(eq(videos.id, videoId));
    res.json({ success: true, postId: result.postId, message: "Publicado en X" });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

export default router;
