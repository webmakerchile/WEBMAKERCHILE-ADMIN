import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { google } from "googleapis";

const router: IRouter = Router();

const INSTAGRAM_ACCESS_TOKEN = (process.env.INSTAGRAM_ACCESS_TOKEN || "").trim();
const INSTAGRAM_USER_ID = (process.env.INSTAGRAM_USER_ID || "").trim();
const IG_API_BASE = "https://graph.facebook.com/v21.0";

const FACEBOOK_GRAPH_VERSION = "v21.0";
const FB_GRAPH_BASE = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
const SERVER_FB_PAGE_ID = (process.env.FACEBOOK_PAGE_ID || "").trim();
const SERVER_FB_PAGE_TOKEN = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const LINKEDIN_API_BASE = "https://api.linkedin.com";
const LINKEDIN_REST_VERSION = "202405";
const X_API_BASE = "https://api.twitter.com/2";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export type NetworkProfile = {
  connected: boolean;
  name?: string | null;
  handle?: string | null;
  avatar?: string | null;
  followers?: number | null;
  extra?: Record<string, unknown>;
};

export type SocialProfilesResponse = {
  instagram: NetworkProfile;
  tiktok: NetworkProfile;
  youtube: NetworkProfile;
  linkedin: NetworkProfile;
  x: NetworkProfile;
  facebook: NetworkProfile;
};

const EMPTY: NetworkProfile = { connected: false };

async function getInstagramProfile(): Promise<NetworkProfile> {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) return EMPTY;
  try {
    const r = await fetch(
      `${IG_API_BASE}/${INSTAGRAM_USER_ID}?fields=id,username,name,profile_picture_url,followers_count&access_token=${INSTAGRAM_ACCESS_TOKEN}`,
    );
    const data: any = await r.json();
    if (data.error) return EMPTY;
    return {
      connected: true,
      name: data.name || data.username,
      handle: data.username,
      avatar: data.profile_picture_url || null,
      followers: typeof data.followers_count === "number" ? data.followers_count : null,
    };
  } catch {
    return EMPTY;
  }
}

async function getFacebookProfile(user: any): Promise<NetworkProfile> {
  if (SERVER_FB_PAGE_ID && SERVER_FB_PAGE_TOKEN) {
    try {
      const r = await fetch(
        `${FB_GRAPH_BASE}/${SERVER_FB_PAGE_ID}?fields=id,name,picture,fan_count&access_token=${SERVER_FB_PAGE_TOKEN}`,
      );
      const data: any = await r.json();
      if (!data.error) {
        return {
          connected: true,
          name: data.name || "Facebook Page",
          handle: data.name || null,
          avatar: data.picture?.data?.url || null,
          followers: typeof data.fan_count === "number" ? data.fan_count : null,
        };
      }
    } catch {
      /* fall through */
    }
  }
  if (user?.facebookUserAccessToken && user?.facebookPageName) {
    return {
      connected: true,
      name: user.facebookPageName,
      handle: user.facebookPageName,
      avatar: user.facebookPagePicture || null,
    };
  }
  return EMPTY;
}

async function getTikTokProfile(user: any): Promise<NetworkProfile> {
  if (!user?.tiktokAccessToken || !user?.tiktokOpenId) return EMPTY;
  try {
    const r = await fetch(
      `${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,display_name,avatar_url`,
      { headers: { Authorization: `Bearer ${user.tiktokAccessToken}` } },
    );
    if (!r.ok) return EMPTY;
    const data: any = await r.json();
    const u = data?.data?.user;
    if (!u) return EMPTY;
    return {
      connected: true,
      name: u.display_name || null,
      handle: u.display_name || null,
      avatar: u.avatar_url || null,
    };
  } catch {
    return EMPTY;
  }
}

async function getYouTubeProfile(user: any): Promise<NetworkProfile> {
  if (!user?.googleAccessToken || !user?.googleRefreshToken) return EMPTY;
  try {
    const oauth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });
    const yt = google.youtube({ version: "v3", auth: oauth });
    const r = await yt.channels.list({ part: ["snippet", "statistics"], mine: true });
    const c = r.data.items?.[0];
    if (!c) return EMPTY;
    const subs = c.statistics?.subscriberCount;
    return {
      connected: true,
      name: c.snippet?.title || null,
      handle: c.snippet?.customUrl || c.snippet?.title || null,
      avatar: c.snippet?.thumbnails?.default?.url || null,
      followers: subs ? Number(subs) : null,
    };
  } catch {
    return EMPTY;
  }
}

async function getLinkedInProfile(user: any): Promise<NetworkProfile> {
  if (!user?.linkedinAccessToken || !user?.linkedinPersonUrn) return EMPTY;
  let orgName: string | null = null;
  let orgLogo: string | null = null;
  if (user.linkedinOrgUrn) {
    try {
      const orgId = user.linkedinOrgUrn.replace("urn:li:organization:", "");
      const r = await fetch(
        `${LINKEDIN_API_BASE}/rest/organizations/${orgId}?fields=id,localizedName,logoV2`,
        {
          headers: {
            Authorization: `Bearer ${user.linkedinAccessToken}`,
            "LinkedIn-Version": LINKEDIN_REST_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );
      if (r.ok) {
        const data: any = await r.json();
        orgName = data.localizedName || null;
        orgLogo = data.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier || null;
      }
    } catch {
      /* ignore */
    }
  }
  return {
    connected: true,
    name: orgName || user.linkedinName || "LinkedIn",
    handle: orgName ? `Página de ${orgName}` : (user.linkedinName || null),
    avatar: orgLogo || user.linkedinPicture || null,
    extra: { isOrg: !!user.linkedinOrgUrn },
  };
}

async function getXProfile(user: any): Promise<NetworkProfile> {
  if (!user?.xAccessToken || !user?.xUserId) return EMPTY;
  const fallback: NetworkProfile = {
    connected: true,
    name: user.xUsername || null,
    handle: user.xUsername || null,
    avatar: null,
  };
  try {
    const r = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url,name`, {
      headers: { Authorization: `Bearer ${user.xAccessToken}` },
    });
    if (!r.ok) return fallback;
    const data: any = await r.json();
    const u = data?.data;
    if (!u) return fallback;
    return {
      connected: true,
      name: u.name || user.xUsername || null,
      handle: u.username || user.xUsername || null,
      avatar: u.profile_image_url || null,
    };
  } catch {
    return fallback;
  }
}

router.get("/social/profiles", async (req: Request, res: Response) => {
  const u = req.user as any;
  let user = u;
  if (u?.id) {
    const fresh = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
    if (fresh[0]) user = fresh[0];
  }
  const [instagram, tiktok, youtube, linkedin, x, facebook] = await Promise.all([
    getInstagramProfile(),
    getTikTokProfile(user),
    getYouTubeProfile(user),
    getLinkedInProfile(user),
    getXProfile(user),
    getFacebookProfile(user),
  ]);
  res.set("Cache-Control", "private, max-age=60");
  res.json({ instagram, tiktok, youtube, linkedin, x, facebook });
});

export default router;
