import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { clearNetworkRevoked } from "../../lib/connections";
import crypto from "crypto";

const router: IRouter = Router();

import { getCredential } from "../../lib/credentials";
const LINKEDIN_AUTH_BASE = "https://www.linkedin.com/oauth/v2";
const LINKEDIN_API_BASE = "https://api.linkedin.com";
const LINKEDIN_REST_VERSION = "202509";

function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": LINKEDIN_REST_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function getLinkedInRedirectUri(): string {
  if (process.env.LINKEDIN_REDIRECT_URI) return process.env.LINKEDIN_REDIRECT_URI;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}/api/linkedin/callback`;
  return "https://admin.webmakerlatam.com/api/linkedin/callback";
}

async function refreshLinkedInToken(user: any): Promise<string | null> {
  if (!user.linkedinRefreshToken) return null;
  try {
    const [clientId, clientSecret] = await Promise.all([
      getCredential("LINKEDIN_CLIENT_ID"),
      getCredential("LINKEDIN_CLIENT_SECRET"),
    ]);
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: user.linkedinRefreshToken,
      client_id: clientId,
      client_secret: clientSecret,
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

router.get("/linkedin/auth", async (req: Request, res: Response) => {
  const clientId = await getCredential("LINKEDIN_CLIENT_ID");
  if (!clientId) {
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
    client_id: clientId,
    redirect_uri: redirectUri,
    state: csrfState,
    scope: "openid profile email w_member_social",
  });
  const authUrl = `${LINKEDIN_AUTH_BASE}/authorization?${params.toString()}`;
  console.log(`[LinkedIn] Redirecting to: ${authUrl}`);
  res.redirect(authUrl);
});

router.get("/linkedin/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    console.error("[LinkedIn] Auth error:", error, error_description);
    res.redirect("/cuentas?linkedin=error&msg=" + encodeURIComponent(error));
    return;
  }

  const csrfCookie = req.cookies?.linkedin_csrf;
  if (!state || state !== csrfCookie) {
    console.error("[LinkedIn] CSRF mismatch - state:", state, "cookie:", csrfCookie ? "present" : "missing");
    res.redirect("/cuentas?linkedin=error&msg=csrf_mismatch");
    return;
  }
  res.clearCookie("linkedin_csrf");

  if (!code) {
    res.redirect("/cuentas?linkedin=error&msg=no_code");
    return;
  }

  try {
    const redirectUri = getLinkedInRedirectUri();
    const [clientId, clientSecret] = await Promise.all([
      getCredential("LINKEDIN_CLIENT_ID"),
      getCredential("LINKEDIN_CLIENT_SECRET"),
    ]);
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch(`${LINKEDIN_AUTH_BASE}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData: any = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[LinkedIn] Token exchange failed:", tokenData);
      res.redirect("/cuentas?linkedin=error&msg=token_failed");
      return;
    }

    const currentUser = req.user as any;
    if (!currentUser) {
      res.redirect("/cuentas?linkedin=error&msg=not_logged_in");
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

    // Auto-detect organization pages the user admins
    let orgUrn: string | null = null;
    try {
      const orgRes = await fetch(
        `${LINKEDIN_API_BASE}/rest/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "LinkedIn-Version": LINKEDIN_REST_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );
      if (orgRes.ok) {
        const orgData: any = await orgRes.json();
        const elements = orgData.elements || [];
        if (elements.length > 0) {
          orgUrn = elements[0].organizationalTarget || null;
          console.log(`[LinkedIn] Auto-detected org: ${orgUrn}`);
        }
      }
    } catch (err: any) {
      console.warn("[LinkedIn] org auto-detect failed:", err.message);
    }

    await db.update(users).set({
      linkedinAccessToken: tokenData.access_token,
      linkedinRefreshToken: tokenData.refresh_token || null,
      linkedinTokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
      linkedinPersonUrn: personUrn,
      linkedinOrgUrn: orgUrn,
      linkedinName: name,
      linkedinPicture: picture,
    }).where(eq(users.id, currentUser.id));
    // Fresh token → drop any stale "revoked" flag so the UI stops nagging.
    try { await clearNetworkRevoked(currentUser.id, "linkedin"); } catch {}

    console.log(`[LinkedIn] Connected for user ${currentUser.id}, urn: ${personUrn}, org: ${orgUrn}`);
    res.redirect("/?linkedin=connected");
  } catch (err: any) {
    console.error("[LinkedIn] Callback error:", err.message);
    res.redirect("/cuentas?linkedin=error&msg=" + encodeURIComponent(err.message));
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

  // If org is selected, fetch org name and logo from LinkedIn
  let orgName: string | null = null;
  let orgLogo: string | null = null;
  if (user.linkedinOrgUrn) {
    try {
      const orgId = user.linkedinOrgUrn.replace("urn:li:organization:", "");
      const orgRes = await fetch(
        `${LINKEDIN_API_BASE}/rest/organizations/${orgId}?fields=id,localizedName,logoV2`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "LinkedIn-Version": LINKEDIN_REST_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );
      if (orgRes.ok) {
        const orgData: any = await orgRes.json();
        orgName = orgData.localizedName || null;
        orgLogo = orgData.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier || null;
      }
    } catch (err: any) {
      console.warn("[LinkedIn] org fetch failed:", err.message);
    }
  }

  res.json({
    connected: true,
    user: {
      personUrn: user.linkedinPersonUrn,
      orgUrn: user.linkedinOrgUrn,
      name: orgName || user.linkedinName,
      picture: orgLogo || user.linkedinPicture,
      orgName,
      orgLogo,
      personalName: user.linkedinName,
      personalPicture: user.linkedinPicture,
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
    // Try REST endpoint first (requires r_organization_social)
    const r = await fetch(
      `${LINKEDIN_API_BASE}/rest/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": LINKEDIN_REST_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (r.ok) {
      const data: any = await r.json();
      const orgs = (data.elements || []).map((el: any) => ({
        urn: el.organizationalTarget,
        name: el.organizationalTarget,
        vanity: "",
      }));
      // Fetch org names individually
      const enriched = await Promise.all(
        orgs.map(async (org: any) => {
          try {
            const id = org.urn?.replace("urn:li:organization:", "");
            const or = await fetch(`${LINKEDIN_API_BASE}/rest/organizations/${id}?fields=id,localizedName,vanityName`, {
              headers: {
                Authorization: `Bearer ${token}`,
                "LinkedIn-Version": LINKEDIN_REST_VERSION,
                "X-Restli-Protocol-Version": "2.0.0",
              },
            });
            if (or.ok) {
              const od: any = await or.json();
              return { urn: org.urn, name: od.localizedName || org.urn, vanity: od.vanityName };
            }
          } catch {}
          return org;
        })
      );
      res.json({ organizations: enriched });
      return;
    }

    // Fallback: try v2 legacy endpoint
    const r2 = await fetch(
      `${LINKEDIN_API_BASE}/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName,vanityName)))`,
      { headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" } },
    );
    if (r2.ok) {
      const data: any = await r2.json();
      const orgs = (data.elements || []).map((el: any) => {
        const target = el["organizationalTarget~"] || {};
        return { urn: el.organizationalTarget, name: target.localizedName || el.organizationalTarget, vanity: target.vanityName };
      });
      res.json({ organizations: orgs });
      return;
    }

    res.json({ organizations: [], note: "Sin permisos de organización" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/linkedin/find-org", async (req: Request, res: Response) => {
  const user = req.user as any;
  const token = await getValidLinkedInToken(user);
  if (!token) {
    res.status(401).json({ error: "LinkedIn no conectado" });
    return;
  }
  const vanityName = (req.query.vanityName as string || "").trim().toLowerCase()
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/company\//i, "")
    .replace(/\/$/, "");
  if (!vanityName) {
    res.status(400).json({ error: "Falta vanityName" });
    return;
  }
  try {
    // Try REST API
    const r = await fetch(
      `${LINKEDIN_API_BASE}/v2/organizations?q=vanityName&vanityName=${encodeURIComponent(vanityName)}&projection=(id,localizedName,vanityName)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (r.ok) {
      const data: any = await r.json();
      const el = (data.elements || [])[0];
      if (el?.id) {
        res.json({ found: true, urn: `urn:li:organization:${el.id}`, name: el.localizedName || vanityName, vanity: el.vanityName });
        return;
      }
    }
    res.json({ found: false });
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
 * Publishes a video to LinkedIn using the Versioned REST API:
 *   POST /rest/videos?action=initializeUpload  → returns uploadInstructions
 *   PUT  uploadUrl(s) (binary chunks, 1 here for simplicity)
 *   POST /rest/videos?action=finalizeUpload    → finalizes the asset
 *   POST /rest/posts                           → creates the post referencing the video URN
 *
 * Falls back to /v2/ugcPosts on REST 5xx so the integration keeps working if the
 * versioned endpoint is unavailable for the app.
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
  const fileSize = videoBuffer.length;

  try {
    // 1) initializeUpload (REST)
    const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/videos?action=initializeUpload`, {
      method: "POST",
      headers: restHeaders(token),
      body: JSON.stringify({
        initializeUploadRequest: { owner, fileSizeBytes: fileSize, uploadCaptions: false, uploadThumbnail: false },
      }),
    });

    if (initRes.status >= 500 || initRes.status === 404) {
      console.warn(`[LinkedIn] /rest/videos initializeUpload returned ${initRes.status}, falling back to /v2/assets`);
      return await publishLinkedInVideoLegacy(token, owner, content, videoBuffer);
    }
    if (!initRes.ok) {
      const text = await initRes.text();
      console.error("[LinkedIn] /rest/videos initializeUpload failed:", initRes.status, text);
      return { success: false, error: `init ${initRes.status}` };
    }

    const initData: any = await initRes.json();
    const value = initData?.value || {};
    const videoUrn: string | undefined = value.video;
    const instructions: any[] = value.uploadInstructions || [];
    const uploadToken: string | undefined = value.uploadToken;
    if (!videoUrn || instructions.length === 0) {
      return { success: false, error: "init missing video/uploadInstructions" };
    }

    // 2) PUT each chunk slice and collect ETags
    const etags: string[] = [];
    for (const inst of instructions) {
      const slice = videoBuffer.subarray(inst.firstByte ?? 0, (inst.lastByte ?? videoBuffer.length - 1) + 1);
      const upRes = await fetch(inst.uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
        body: new Uint8Array(slice),
      });
      if (!upRes.ok && upRes.status !== 201) {
        const text = await upRes.text();
        console.error("[LinkedIn] chunk upload failed:", upRes.status, text);
        return { success: false, error: `chunk ${upRes.status}` };
      }
      const etag = upRes.headers.get("etag") || upRes.headers.get("ETag");
      if (etag) etags.push(etag.replace(/^"|"$/g, ""));
    }

    // 3) finalizeUpload
    const finRes = await fetch(`${LINKEDIN_API_BASE}/rest/videos?action=finalizeUpload`, {
      method: "POST",
      headers: restHeaders(token),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: uploadToken || "",
          uploadedPartIds: etags,
        },
      }),
    });
    if (finRes.status >= 500 || finRes.status === 404) {
      console.warn(`[LinkedIn] /rest/videos finalizeUpload returned ${finRes.status}, falling back to /v2/assets`);
      return await publishLinkedInVideoLegacy(token, owner, content, videoBuffer);
    }
    if (!finRes.ok) {
      const text = await finRes.text();
      console.error("[LinkedIn] /rest/videos finalizeUpload failed:", finRes.status, text);
      return { success: false, error: `finalize ${finRes.status}` };
    }

    // 4) Create the post (REST)
    const postRes = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: "POST",
      headers: restHeaders(token),
      body: JSON.stringify({
        author: owner,
        commentary: content,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { id: videoUrn } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (postRes.status >= 500 || postRes.status === 404) {
      console.warn(`[LinkedIn] /rest/posts returned ${postRes.status}, falling back to /v2/ugcPosts`);
      return await publishLinkedInVideoLegacy(token, owner, content, videoBuffer);
    }
    if (!postRes.ok) {
      const text = await postRes.text();
      console.error("[LinkedIn] /rest/posts failed:", postRes.status, text);
      return { success: false, error: `post ${postRes.status}` };
    }
    const postId = postRes.headers.get("x-restli-id") || undefined;
    return { success: true, postId };
  } catch (err: any) {
    console.error("[LinkedIn] Video publish error:", err.message);
    return { success: false, error: err.message };
  }
}

async function publishLinkedInVideoLegacy(
  token: string,
  owner: string,
  content: string,
  videoBuffer: Buffer,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const registerRes = await fetch(`${LINKEDIN_API_BASE}/v2/assets?action=registerUpload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
        owner,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  if (!registerRes.ok) return { success: false, error: `legacy register ${registerRes.status}` };
  const registerData: any = await registerRes.json();
  const uploadUrl = registerData?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  const asset: string | undefined = registerData?.value?.asset;
  if (!uploadUrl || !asset) return { success: false, error: "legacy no uploadUrl" };
  const upRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: new Uint8Array(videoBuffer),
  });
  if (!upRes.ok && upRes.status !== 201) return { success: false, error: `legacy upload ${upRes.status}` };
  const postRes = await fetch(`${LINKEDIN_API_BASE}/v2/ugcPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
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
    }),
  });
  const text = await postRes.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!postRes.ok) return { success: false, error: data?.message || `legacy post ${postRes.status}` };
  return { success: true, postId: data.id || postRes.headers.get("x-restli-id") || undefined };
}

/**
 * Text-only post via the Versioned REST `/rest/posts` endpoint.
 * Falls back to /v2/ugcPosts on REST 5xx.
 */
export async function publishLinkedInPost(
  user: any,
  content: string,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = await getValidLinkedInToken(user);
  if (!token) return { success: false, error: "No LinkedIn token" };
  if (!user.linkedinPersonUrn) return { success: false, error: "No LinkedIn person URN" };

  const author = user.linkedinOrgUrn || user.linkedinPersonUrn;

  try {
    const res = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: "POST",
      headers: restHeaders(token),
      body: JSON.stringify({
        author,
        commentary: content,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (res.status >= 500 || res.status === 404) {
      console.warn(`[LinkedIn] /rest/posts returned ${res.status}, falling back to /v2/ugcPosts`);
      return await publishLinkedInTextLegacy(token, author, content);
    }
    if (!res.ok) {
      const text = await res.text();
      console.error("[LinkedIn] /rest/posts failed:", res.status, text);
      return { success: false, error: `post ${res.status}` };
    }
    const postId = res.headers.get("x-restli-id") || undefined;
    return { success: true, postId };
  } catch (err: any) {
    console.error("[LinkedIn] Publish error:", err.message);
    return { success: false, error: err.message };
  }
}

async function publishLinkedInTextLegacy(
  token: string,
  author: string,
  content: string,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const res = await fetch(`${LINKEDIN_API_BASE}/v2/ugcPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) return { success: false, error: data?.message || `legacy ${res.status}` };
  return { success: true, postId: data.id || res.headers.get("x-restli-id") || undefined };
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
