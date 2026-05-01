import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

const LINKEDIN_CLIENT_ID = (process.env.LINKEDIN_CLIENT_ID || "").trim();
const LINKEDIN_CLIENT_SECRET = (process.env.LINKEDIN_CLIENT_SECRET || "").trim();
const LINKEDIN_AUTH_BASE = "https://www.linkedin.com/oauth/v2";
const LINKEDIN_API_BASE = "https://api.linkedin.com";

function getLinkedInRedirectUri(): string {
  return process.env.LINKEDIN_REDIRECT_URI || "https://admin.webmakerchile.com/api/linkedin/callback";
}

async function refreshLinkedInToken(user: any): Promise<string | null> {
  if (!user.linkedinRefreshToken) return null;
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: user.linkedinRefreshToken,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    });
    const res = await fetch(`${LINKEDIN_AUTH_BASE}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data: any = await res.json();
    if (data.access_token) {
      await db.update(users).set({
        linkedinAccessToken: data.access_token,
        linkedinRefreshToken: data.refresh_token || user.linkedinRefreshToken,
        linkedinTokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      }).where(eq(users.id, user.id));
      return data.access_token;
    }
    console.error("[LinkedIn] Token refresh failed:", data);
    return null;
  } catch (err: any) {
    console.error("[LinkedIn] Token refresh error:", err.message);
    return null;
  }
}

export async function getValidLinkedInToken(user: any): Promise<string | null> {
  if (!user.linkedinAccessToken) return null;
  if (user.linkedinTokenExpiresAt && new Date(user.linkedinTokenExpiresAt) > new Date()) {
    return user.linkedinAccessToken;
  }
  return refreshLinkedInToken(user);
}

router.get("/linkedin/auth", (req: Request, res: Response) => {
  if (!LINKEDIN_CLIENT_ID) {
    res.status(500).json({ error: "LinkedIn no está configurado en el servidor" });
    return;
  }
  const csrfState = crypto.randomBytes(16).toString("hex");
  res.cookie("linkedin_csrf", csrfState, {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  const redirectUri = getLinkedInRedirectUri();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: redirectUri,
    state: csrfState,
    scope: "openid profile email w_member_social w_organization_social rw_organization_admin",
  });
  const authUrl = `${LINKEDIN_AUTH_BASE}/authorization?${params.toString()}`;
  console.log(`[LinkedIn] Redirecting to: ${authUrl}`);
  res.redirect(authUrl);
});

router.get("/linkedin/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    console.error("[LinkedIn] Auth error:", error, error_description);
    res.redirect("/?linkedin=error&msg=" + encodeURIComponent(error));
    return;
  }

  const csrfCookie = req.cookies?.linkedin_csrf;
  if (!state || state !== csrfCookie) {
    console.error("[LinkedIn] CSRF mismatch");
    res.redirect("/?linkedin=error&msg=csrf_mismatch");
    return;
  }
  res.clearCookie("linkedin_csrf");

  if (!code) {
    res.redirect("/?linkedin=error&msg=no_code");
    return;
  }

  try {
    const redirectUri = getLinkedInRedirectUri();
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    });

    const tokenRes = await fetch(`${LINKEDIN_AUTH_BASE}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData: any = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[LinkedIn] Token exchange failed:", tokenData);
      res.redirect("/?linkedin=error&msg=token_failed");
      return;
    }

    const currentUser = req.user as any;
    if (!currentUser) {
      res.redirect("/?linkedin=error&msg=not_logged_in");
      return;
    }

    let personUrn: string | null = null;
    let name: string | null = null;
    let picture: string | null = null;
    try {
      const userInfoRes = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo: any = await userInfoRes.json();
      if (userInfo.sub) {
        personUrn = `urn:li:person:${userInfo.sub}`;
        name = userInfo.name || null;
        picture = userInfo.picture || null;
      }
    } catch (err: any) {
      console.error("[LinkedIn] userinfo fetch failed:", err.message);
    }

    await db.update(users).set({
      linkedinAccessToken: tokenData.access_token,
      linkedinRefreshToken: tokenData.refresh_token || null,
      linkedinTokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
      linkedinPersonUrn: personUrn,
      linkedinName: name,
      linkedinPicture: picture,
    }).where(eq(users.id, currentUser.id));

    console.log(`[LinkedIn] Connected for user ${currentUser.id}, urn: ${personUrn}`);
    res.redirect("/?linkedin=connected");
  } catch (err: any) {
    console.error("[LinkedIn] Callback error:", err.message);
    res.redirect("/?linkedin=error&msg=" + encodeURIComponent(err.message));
  }
});

router.get("/linkedin/status", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user.linkedinAccessToken || !user.linkedinPersonUrn) {
    res.json({ connected: false, message: "LinkedIn no conectado. Usa el botón para conectar tu cuenta." });
    return;
  }
  const token = await getValidLinkedInToken(user);
  if (!token) {
    res.json({ connected: false, message: "Token de LinkedIn expirado. Reconecta tu cuenta." });
    return;
  }
  res.json({
    connected: true,
    user: {
      personUrn: user.linkedinPersonUrn,
      orgUrn: user.linkedinOrgUrn,
      name: user.linkedinName,
      picture: user.linkedinPicture,
    },
  });
});

router.get("/linkedin/organizations", async (req: Request, res: Response) => {
  const user = req.user as any;
  const token = await getValidLinkedInToken(user);
  if (!token) {
    res.status(401).json({ error: "LinkedIn no conectado" });
    return;
  }
  try {
    const r = await fetch(
      `${LINKEDIN_API_BASE}/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName,vanityName,logoV2(original~:playableStreams))))`,
      { headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" } },
    );
    if (!r.ok) {
      const text = await r.text();
      console.warn("[LinkedIn] organizations fetch failed:", r.status, text);
      res.json({ organizations: [], note: "Sin permisos de organización (requiere scope rw_organization_admin)" });
      return;
    }
    const data: any = await r.json();
    const orgs = (data.elements || []).map((el: any) => {
      const target = el["organizationalTarget~"] || {};
      return { urn: el.organizationalTarget, name: target.localizedName, vanity: target.vanityName };
    });
    res.json({ organizations: orgs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/linkedin/select-org", async (req: Request, res: Response) => {
  const user = req.user as any;
  const { orgUrn } = req.body || {};
  if (orgUrn !== null && (typeof orgUrn !== "string" || !orgUrn.startsWith("urn:li:organization:"))) {
    res.status(400).json({ error: "orgUrn inválido" });
    return;
  }
  await db.update(users).set({ linkedinOrgUrn: orgUrn || null }).where(eq(users.id, user.id));
  res.json({ success: true, orgUrn: orgUrn || null });
});

router.post("/linkedin/disconnect", async (req: Request, res: Response) => {
  const user = req.user as any;
  await db.update(users).set({
    linkedinAccessToken: null,
    linkedinRefreshToken: null,
    linkedinTokenExpiresAt: null,
    linkedinPersonUrn: null,
    linkedinOrgUrn: null,
    linkedinName: null,
    linkedinPicture: null,
  }).where(eq(users.id, user.id));
  res.json({ success: true });
});

/**
 * Registers a video asset with LinkedIn, uploads the binary to the returned URL,
 * and creates a UGC post that references the asset.
 */
export async function publishLinkedInVideo(
  user: any,
  content: string,
  videoBuffer: Buffer,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = await getValidLinkedInToken(user);
  if (!token) return { success: false, error: "No LinkedIn token" };
  if (!user.linkedinPersonUrn) return { success: false, error: "No LinkedIn person URN" };

  const owner = user.linkedinOrgUrn || user.linkedinPersonUrn;

  try {
    const registerRes = await fetch(`${LINKEDIN_API_BASE}/v2/assets?action=registerUpload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
          owner,
          serviceRelationships: [
            { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
          ],
        },
      }),
    });

    if (!registerRes.ok) {
      const text = await registerRes.text();
      console.error("[LinkedIn] Asset register failed:", registerRes.status, text);
      return { success: false, error: `register ${registerRes.status}` };
    }

    const registerData: any = await registerRes.json();
    const uploadUrl = registerData?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    const asset: string | undefined = registerData?.value?.asset;
    if (!uploadUrl || !asset) {
      console.error("[LinkedIn] Missing uploadUrl or asset:", registerData);
      return { success: false, error: "asset register no uploadUrl" };
    }

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(videoBuffer),
    });
    if (!uploadRes.ok && uploadRes.status !== 201) {
      const text = await uploadRes.text();
      console.error("[LinkedIn] Asset upload failed:", uploadRes.status, text);
      return { success: false, error: `upload ${uploadRes.status}` };
    }

    const postBody = {
      author: owner,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content },
          shareMediaCategory: "VIDEO",
          media: [{ status: "READY", media: asset, description: { text: "" }, title: { text: "" } }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const postRes = await fetch(`${LINKEDIN_API_BASE}/v2/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });

    const text = await postRes.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!postRes.ok) {
      console.error("[LinkedIn] UGC post failed:", postRes.status, data);
      return { success: false, error: data?.message || `HTTP ${postRes.status}` };
    }

    const postId = data.id || postRes.headers.get("x-restli-id") || null;
    return { success: true, postId: postId || undefined };
  } catch (err: any) {
    console.error("[LinkedIn] Video publish error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Posts a text-only update to LinkedIn (UGC posts API). Used as a fallback when no
 * Drive video is available.
 */
export async function publishLinkedInPost(
  user: any,
  content: string,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = await getValidLinkedInToken(user);
  if (!token) return { success: false, error: "No LinkedIn token" };
  if (!user.linkedinPersonUrn) return { success: false, error: "No LinkedIn person URN" };

  try {
    const author = user.linkedinOrgUrn || user.linkedinPersonUrn;
    const body = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const res = await fetch(`${LINKEDIN_API_BASE}/v2/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      console.error("[LinkedIn] Publish failed:", res.status, data);
      return { success: false, error: data?.message || `HTTP ${res.status}` };
    }

    const postId = data.id || res.headers.get("x-restli-id") || null;
    return { success: true, postId: postId || undefined };
  } catch (err: any) {
    console.error("[LinkedIn] Publish error:", err.message);
    return { success: false, error: err.message };
  }
}

router.post("/linkedin/publish/:videoId", async (req: Request, res: Response) => {
  const user = req.user as any;
  const videoId = Number(req.params.videoId);

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  const content = video.linkedinDescription || video.description || video.title;
  const result = await publishLinkedInPost(user, content);

  if (result.success) {
    await db.update(videos).set({
      linkedinPostId: result.postId,
      linkedinStatus: "published",
      updatedAt: new Date(),
    }).where(eq(videos.id, videoId));
    res.json({ success: true, postId: result.postId, message: "Publicado en LinkedIn" });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

export default router;
