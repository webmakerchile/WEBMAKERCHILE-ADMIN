import { Router, type IRouter, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getValidLinkedInToken } from "../linkedin";
import { getValidXToken } from "../x";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const TIKTOK_CLIENT_KEY = (process.env.TIKTOK_CLIENT_KEY || "").trim();
const TIKTOK_CLIENT_SECRET = (process.env.TIKTOK_CLIENT_SECRET || "").trim();
const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID || "";
const IG_API_BASE = "https://graph.instagram.com/v21.0";
const FB_GRAPH_BASE = "https://graph.facebook.com/v21.0";

type Series = number[];

type MetricBlock = {
  total: number;
  delta: number;
  series: Series;
  prevSeries: Series;
};

type AuthedUser = {
  id: number;
  email?: string;
  name?: string;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  tiktokAccessToken?: string | null;
  tiktokRefreshToken?: string | null;
  tiktokTokenExpiresAt?: Date | string | null;
  linkedinAccessToken?: string | null;
  linkedinPersonUrn?: string | null;
  linkedinOrgUrn?: string | null;
  facebookPageId?: string | null;
  facebookPageAccessToken?: string | null;
};

function getUser(req: Request): AuthedUser {
  return req.user as AuthedUser;
}

function emptyMetric(days: number): MetricBlock {
  return { total: 0, delta: 0, series: new Array(days).fill(0), prevSeries: new Array(days).fill(0) };
}

function addMetric(target: MetricBlock, source: MetricBlock) {
  target.total += source.total;
  for (let i = 0; i < target.series.length; i++) {
    target.series[i] = (target.series[i] || 0) + (source.series[i] || 0);
    target.prevSeries[i] = (target.prevSeries[i] || 0) + (source.prevSeries[i] || 0);
  }
}

function computeDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function finalizeMetric(m: MetricBlock) {
  const prevTotal = m.prevSeries.reduce((a, b) => a + b, 0);
  m.delta = computeDelta(m.total, prevTotal);
}

function getOAuth2Client(user: AuthedUser) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  oauth2Client.on("tokens", async (tokens) => {
    try {
      const updateData: Partial<{ googleAccessToken: string; googleRefreshToken: string }> = {};
      if (tokens.access_token) updateData.googleAccessToken = tokens.access_token;
      if (tokens.refresh_token) updateData.googleRefreshToken = tokens.refresh_token;
      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, user.id));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Analytics] failed to persist refreshed Google tokens:", msg);
    }
  });
  return oauth2Client;
}

async function getValidTikTokToken(user: AuthedUser): Promise<string | null> {
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
    const r = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: params.toString(),
    });
    const data = (await r.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (data.access_token) {
      await db.update(users).set({
        tiktokAccessToken: data.access_token,
        tiktokRefreshToken: data.refresh_token || user.tiktokRefreshToken,
        tiktokTokenExpiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000),
      }).where(eq(users.id, user.id));
      return data.access_token;
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[Analytics][TikTok] refresh failed:", msg);
    return null;
  }
}

/** Fetch YouTube Analytics rows: estimatedMinutesWatched/views/subscribersGained, daily series. */
async function fetchYouTube(user: AuthedUser, days: number): Promise<{
  followers: MetricBlock; reach: MetricBlock; interactions: MetricBlock;
} | null> {
  if (!user.googleAccessToken || !user.googleRefreshToken) return null;
  try {
    const auth = getOAuth2Client(user);
    const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });

    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - days + 1);
    const prevStart = new Date(today); prevStart.setDate(today.getDate() - days * 2 + 1);
    const prevEnd = new Date(today); prevEnd.setDate(today.getDate() - days);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const [curr, prev] = await Promise.all([
      youtubeAnalytics.reports.query({
        ids: "channel==MINE",
        startDate: fmt(start),
        endDate: fmt(today),
        metrics: "views,likes,comments,subscribersGained,subscribersLost",
        dimensions: "day",
      }).catch(() => null),
      youtubeAnalytics.reports.query({
        ids: "channel==MINE",
        startDate: fmt(prevStart),
        endDate: fmt(prevEnd),
        metrics: "views,likes,comments,subscribersGained,subscribersLost",
        dimensions: "day",
      }).catch(() => null),
    ]);

    const followers = emptyMetric(days);
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);

    type YtRow = [string, number, number, number, number, number];
    const fillSeries = (
      rows: YtRow[] | undefined,
      origin: Date,
      target: { reach: Series; inter: Series; subs: Series },
    ) => {
      if (!rows) return;
      for (const row of rows) {
        const dateStr = row[0];
        const idx = Math.floor((new Date(dateStr).getTime() - origin.getTime()) / 86400000);
        if (idx < 0 || idx >= days) continue;
        target.reach[idx] = (target.reach[idx] || 0) + Number(row[1] || 0);
        target.inter[idx] = (target.inter[idx] || 0) + Number(row[2] || 0) + Number(row[3] || 0);
        target.subs[idx] = (target.subs[idx] || 0) + (Number(row[4] || 0) - Number(row[5] || 0));
      }
    };

    const currT = { reach: new Array(days).fill(0), inter: new Array(days).fill(0), subs: new Array(days).fill(0) };
    const prevT = { reach: new Array(days).fill(0), inter: new Array(days).fill(0), subs: new Array(days).fill(0) };
    fillSeries(curr?.data?.rows as YtRow[] | undefined, start, currT);
    fillSeries(prev?.data?.rows as YtRow[] | undefined, prevStart, prevT);

    reach.series = currT.reach; reach.prevSeries = prevT.reach;
    reach.total = currT.reach.reduce((a, b) => a + b, 0);
    interactions.series = currT.inter; interactions.prevSeries = prevT.inter;
    interactions.total = currT.inter.reduce((a, b) => a + b, 0);
    followers.series = currT.subs; followers.prevSeries = prevT.subs;
    followers.total = currT.subs.reduce((a, b) => a + b, 0);

    finalizeMetric(reach); finalizeMetric(interactions); finalizeMetric(followers);
    return { followers, reach, interactions };
  } catch (err) {
    console.error("[Analytics][YouTube]", (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

async function fetchInstagram(_user: AuthedUser, days: number): Promise<{
  followers: MetricBlock; reach: MetricBlock; interactions: MetricBlock;
} | null> {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) return null;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const sinceCurr = nowSec - days * 86400;
    const sincePrev = nowSec - days * 2 * 86400;
    const untilPrev = sinceCurr;

    const buildUrl = (since: number, until: number) =>
      `${IG_API_BASE}/${INSTAGRAM_USER_ID}/insights?metric=reach,follower_count&period=day&since=${since}&until=${until}&access_token=${encodeURIComponent(INSTAGRAM_ACCESS_TOKEN)}`;

    type IgInsightValue = { end_time: string; value?: number };
    type IgInsightItem = { name: string; values?: IgInsightValue[] };
    type IgInsightResponse = { data?: IgInsightItem[]; error?: { message?: string } } | null;

    const [currR, prevR] = await Promise.all([
      fetch(buildUrl(sinceCurr, nowSec))
        .then((r) => r.json() as Promise<IgInsightResponse>)
        .catch(() => null),
      fetch(buildUrl(sincePrev, untilPrev))
        .then((r) => r.json() as Promise<IgInsightResponse>)
        .catch(() => null),
    ]);
    if (currR?.error) {
      console.error("[Analytics][Instagram]", currR.error.message);
      return null;
    }

    const followers = emptyMetric(days);
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const currStartMs = today.getTime() - (days - 1) * 86400000;
    const prevStartMs = currStartMs - days * 86400000;

    const consume = (data: IgInsightResponse, originMs: number, target: "series" | "prevSeries") => {
      if (!data?.data) return;
      for (const item of data.data) {
        const block = item.name === "follower_count" ? followers : item.name === "reach" ? reach : null;
        if (!block) continue;
        for (const v of item.values || []) {
          const t = new Date(v.end_time).getTime();
          const idx = Math.floor((t - originMs) / 86400000);
          if (idx < 0 || idx >= days) continue;
          block[target][idx] = (block[target][idx] || 0) + Number(v.value || 0);
        }
      }
    };
    consume(currR, currStartMs, "series");
    consume(prevR, prevStartMs, "prevSeries");
    followers.total = followers.series.reduce((a, b) => a + b, 0);
    reach.total = reach.series.reduce((a, b) => a + b, 0);

    finalizeMetric(followers); finalizeMetric(reach); finalizeMetric(interactions);
    return { followers, reach, interactions };
  } catch (err) {
    console.error("[Analytics][Instagram]", (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

async function fetchFacebook(user: AuthedUser, days: number): Promise<{
  followers: MetricBlock; reach: MetricBlock; interactions: MetricBlock;
} | null> {
  if (!user.facebookPageId || !user.facebookPageAccessToken) return null;
  const fbPageId = user.facebookPageId;
  const fbToken = user.facebookPageAccessToken;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const sinceCurr = nowSec - days * 86400;
    const sincePrev = nowSec - days * 2 * 86400;
    const untilPrev = sinceCurr;

    const buildUrl = (since: number, until: number) =>
      `${FB_GRAPH_BASE}/${fbPageId}/insights?metric=page_impressions_unique,page_post_engagements,page_fan_adds,page_fan_removes&period=day&since=${since}&until=${until}&access_token=${encodeURIComponent(fbToken)}`;

    type FbInsightValue = { end_time: string; value?: number };
    type FbInsightItem = { name: string; values?: FbInsightValue[] };
    type FbInsightResponse = { data?: FbInsightItem[]; error?: { message?: string } } | null;

    const [currR, prevR] = await Promise.all([
      fetch(buildUrl(sinceCurr, nowSec))
        .then((r) => r.json() as Promise<FbInsightResponse>)
        .catch(() => null),
      fetch(buildUrl(sincePrev, untilPrev))
        .then((r) => r.json() as Promise<FbInsightResponse>)
        .catch(() => null),
    ]);
    if (currR?.error) {
      console.error("[Analytics][Facebook]", currR.error.message);
      return null;
    }

    const followers = emptyMetric(days);
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const currStartMs = today.getTime() - (days - 1) * 86400000;
    const prevStartMs = currStartMs - days * 86400000;

    const consume = (data: FbInsightResponse, originMs: number, target: "series" | "prevSeries") => {
      if (!data?.data) return;
      for (const item of data.data) {
        const block =
          item.name === "page_impressions_unique" ? reach :
          item.name === "page_post_engagements" ? interactions : null;
        if (block) {
          for (const v of item.values || []) {
            const t = new Date(v.end_time).getTime();
            const idx = Math.floor((t - originMs) / 86400000);
            if (idx < 0 || idx >= days) continue;
            block[target][idx] = (block[target][idx] || 0) + Number(v.value || 0);
          }
        } else if (item.name === "page_fan_adds" || item.name === "page_fan_removes") {
          const sign = item.name === "page_fan_adds" ? 1 : -1;
          for (const v of item.values || []) {
            const t = new Date(v.end_time).getTime();
            const idx = Math.floor((t - originMs) / 86400000);
            if (idx < 0 || idx >= days) continue;
            followers[target][idx] = (followers[target][idx] || 0) + sign * Number(v.value || 0);
          }
        }
      }
    };
    consume(currR, currStartMs, "series");
    consume(prevR, prevStartMs, "prevSeries");
    followers.total = followers.series.reduce((a, b) => a + b, 0);
    reach.total = reach.series.reduce((a, b) => a + b, 0);
    interactions.total = interactions.series.reduce((a, b) => a + b, 0);

    finalizeMetric(followers); finalizeMetric(reach); finalizeMetric(interactions);
    return { followers, reach, interactions };
  } catch (err) {
    console.error("[Analytics][Facebook]", (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

async function fetchLinkedIn(user: AuthedUser, days: number): Promise<{
  followers: MetricBlock; reach: MetricBlock; interactions: MetricBlock;
} | null> {
  const token = await getValidLinkedInToken(user);
  if (!token || !user.linkedinOrgUrn) return null;
  try {
    const orgUrn = encodeURIComponent(user.linkedinOrgUrn);
    const end = Date.now();
    const startCurr = end - days * 86400000;
    const startPrev = end - days * 2 * 86400000;
    const headers = {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202509",
      "X-Restli-Protocol-Version": "2.0.0",
    };
    const buildUrl = (s: number, e: number) =>
      `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgUrn}&timeIntervals.timeGranularityType=DAY&timeIntervals.timeRange.start=${s}&timeIntervals.timeRange.end=${e}`;

    type LiStats = {
      impressionCount?: number;
      likeCount?: number;
      commentCount?: number;
      shareCount?: number;
    };
    type LiElement = { timeRange?: { start?: number }; totalShareStatistics?: LiStats };
    type LiResponse = { elements?: LiElement[] } | null;

    const [currR, prevR] = await Promise.all([
      fetch(buildUrl(startCurr, end), { headers })
        .then((r) => (r.ok ? (r.json() as Promise<LiResponse>) : null))
        .catch(() => null),
      fetch(buildUrl(startPrev, startCurr), { headers })
        .then((r) => (r.ok ? (r.json() as Promise<LiResponse>) : null))
        .catch(() => null),
    ]);
    if (!currR) return null;

    const followers = emptyMetric(days);
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const currStartMs = today.getTime() - (days - 1) * 86400000;
    const prevStartMs = currStartMs - days * 86400000;

    const consume = (data: LiResponse, originMs: number, target: "series" | "prevSeries") => {
      for (const el of data?.elements || []) {
        const t = el.timeRange?.start;
        if (!t) continue;
        const idx = Math.floor((t - originMs) / 86400000);
        if (idx < 0 || idx >= days) continue;
        const stats = el.totalShareStatistics || {};
        reach[target][idx] = (reach[target][idx] || 0) + Number(stats.impressionCount || 0);
        interactions[target][idx] = (interactions[target][idx] || 0) +
          Number(stats.likeCount || 0) + Number(stats.commentCount || 0) + Number(stats.shareCount || 0);
      }
    };
    consume(currR, currStartMs, "series");
    consume(prevR, prevStartMs, "prevSeries");
    reach.total = reach.series.reduce((a, b) => a + b, 0);
    interactions.total = interactions.series.reduce((a, b) => a + b, 0);

    // Followers snapshot via organizationalEntityFollowerStatistics
    try {
      const fs = await fetch(
        `https://api.linkedin.com/rest/networkSizes/${orgUrn}?edgeType=CompanyFollowedByMember`,
        { headers },
      );
      if (fs.ok) {
        const fd = (await fs.json()) as { firstDegreeSize?: number };
        const fc = Number(fd.firstDegreeSize || 0);
        followers.total = fc;
        followers.series[days - 1] = fc;
        followers.prevSeries[days - 1] = fc;
      }
    } catch (followersErr) {
      const msg = followersErr instanceof Error ? followersErr.message : String(followersErr);
      console.warn("[Analytics][LinkedIn] networkSizes failed:", msg);
    }

    finalizeMetric(followers); finalizeMetric(reach); finalizeMetric(interactions);
    return { followers, reach, interactions };
  } catch (err) {
    console.error("[Analytics][LinkedIn]", (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

async function fetchX(user: AuthedUser, days: number): Promise<{
  followers: MetricBlock; reach: MetricBlock; interactions: MetricBlock;
} | null> {
  const token = await getValidXToken(user);
  if (!token) return null;
  try {
    const r = await fetch("https://api.twitter.com/2/users/me?user.fields=public_metrics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      console.error("[Analytics][X]", r.status, await r.text().catch(() => ""));
      return null;
    }
    const data = (await r.json()) as { data?: { public_metrics?: { followers_count?: number } } };
    const followers = emptyMetric(days);
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);
    const fc = Number(data.data?.public_metrics?.followers_count || 0);
    followers.total = fc;
    followers.series[days - 1] = fc;
    followers.prevSeries[days - 1] = fc;
    finalizeMetric(followers); finalizeMetric(reach); finalizeMetric(interactions);
    return { followers, reach, interactions };
  } catch (err) {
    console.error("[Analytics][X]", (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

async function fetchTikTok(user: AuthedUser, days: number): Promise<{
  followers: MetricBlock; reach: MetricBlock; interactions: MetricBlock;
} | null> {
  const token = await getValidTikTokToken(user);
  if (!token) return null;
  try {
    const r = await fetch(
      `${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await r.json()) as {
      data?: { user?: { follower_count?: number; likes_count?: number } };
      error?: { code?: string; message?: string };
    };
    if (data.error?.code && data.error.code !== "ok") {
      console.error("[Analytics][TikTok]", data.error.message);
      return null;
    }
    const u = data.data?.user;
    const followers = emptyMetric(days);
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);
    const fc = Number(u?.follower_count || 0);
    const likes = Number(u?.likes_count || 0);
    followers.total = fc;
    followers.series[days - 1] = fc;
    followers.prevSeries[days - 1] = fc;
    interactions.total = likes;
    interactions.series[days - 1] = likes;
    interactions.prevSeries[days - 1] = likes;
    finalizeMetric(followers); finalizeMetric(reach); finalizeMetric(interactions);
    return { followers, reach, interactions };
  } catch (err) {
    console.error("[Analytics][TikTok]", (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

router.get("/analytics/summary", async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(30, Number(req.query.days) || 7));
  const user = getUser(req);

  const followers = emptyMetric(days);
  const reach = emptyMetric(days);
  const interactions = emptyMetric(days);
  const sources: { network: string; ok: boolean; reason?: string }[] = [];

  type NetworkSummary = {
    network: string;
    connected: boolean;
    reason?: string;
    metrics: {
      followers: number;
      followersDelta: number;
      views: number;
      viewsDelta: number;
      engagements: number;
      engagementsDelta: number;
    } | null;
  };
  const networkSummaries: NetworkSummary[] = [];

  type NetworkResult = {
    followers: MetricBlock;
    reach: MetricBlock;
    interactions: MetricBlock;
  } | null;
  const networks: { name: string; fn: () => Promise<NetworkResult> }[] = [
    { name: "youtube", fn: () => fetchYouTube(user, days) },
    { name: "instagram", fn: () => fetchInstagram(user, days) },
    { name: "facebook", fn: () => fetchFacebook(user, days) },
    { name: "linkedin", fn: () => fetchLinkedIn(user, days) },
    { name: "x", fn: () => fetchX(user, days) },
    { name: "tiktok", fn: () => fetchTikTok(user, days) },
  ];

  await Promise.all(
    networks.map(async (n) => {
      try {
        const result = await n.fn();
        if (!result) {
          sources.push({ network: n.name, ok: false, reason: "no_connection_or_data" });
          networkSummaries.push({ network: n.name, connected: false, reason: "no_connection_or_data", metrics: null });
          return;
        }
        finalizeMetric(result.followers);
        finalizeMetric(result.reach);
        finalizeMetric(result.interactions);
        addMetric(followers, result.followers);
        addMetric(reach, result.reach);
        addMetric(interactions, result.interactions);
        sources.push({ network: n.name, ok: true });
        networkSummaries.push({
          network: n.name,
          connected: true,
          metrics: {
            followers: result.followers.total,
            followersDelta: result.followers.delta,
            views: result.reach.total,
            viewsDelta: result.reach.delta,
            engagements: result.interactions.total,
            engagementsDelta: result.interactions.delta,
          },
        });
      } catch (err) {
        console.error(`[Analytics][${n.name}] error:`, (err instanceof Error ? err.message : String(err)));
        sources.push({ network: n.name, ok: false, reason: (err instanceof Error ? err.message : String(err)) });
        networkSummaries.push({ network: n.name, connected: false, reason: (err instanceof Error ? err.message : String(err)), metrics: null });
      }
    }),
  );

  finalizeMetric(followers);
  finalizeMetric(reach);
  finalizeMetric(interactions);

  // Posts published, daily series for current and previous window.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const currStartMs = today.getTime() - (days - 1) * 86400000;
  const prevStartMs = currStartMs - days * 86400000;
  const currStartDate = new Date(currStartMs);
  const prevStartDate = new Date(prevStartMs);
  const windowEndDate = new Date(today.getTime() + 86400000);

  const posts = emptyMetric(days);
  try {
    type PostRow = { day: string; count: number };
    const fillFromRows = (rows: PostRow[], originMs: number, target: "series" | "prevSeries") => {
      for (const row of rows) {
        const t = new Date(row.day + "T00:00:00Z").getTime();
        const idx = Math.floor((t - originMs) / 86400000);
        if (idx < 0 || idx >= days) continue;
        posts[target][idx] = (posts[target][idx] || 0) + Number(row.count || 0);
      }
    };
    const currRows = (await db
      .select({
        day: sql<string>`to_char(${videos.publishedAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(videos)
      .where(and(
        eq(videos.status, "published"),
        gte(videos.publishedAt, currStartDate),
        lt(videos.publishedAt, windowEndDate),
      ))
      .groupBy(sql`to_char(${videos.publishedAt}, 'YYYY-MM-DD')`)) as PostRow[];
    const prevRows = (await db
      .select({
        day: sql<string>`to_char(${videos.publishedAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(videos)
      .where(and(
        eq(videos.status, "published"),
        gte(videos.publishedAt, prevStartDate),
        lt(videos.publishedAt, currStartDate),
      ))
      .groupBy(sql`to_char(${videos.publishedAt}, 'YYYY-MM-DD')`)) as PostRow[];
    fillFromRows(currRows, currStartMs, "series");
    fillFromRows(prevRows, prevStartMs, "prevSeries");
    posts.total = posts.series.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[Analytics][posts] error:", (err instanceof Error ? err.message : String(err)));
  }
  finalizeMetric(posts);
  const postsCount = posts.total;

  const currTotal = followers.total + reach.total + interactions.total;
  const prevReachTotal = reach.prevSeries.reduce((a, b) => a + b, 0);
  const prevInterTotal = interactions.prevSeries.reduce((a, b) => a + b, 0);
  const prevFollowersTotal = followers.prevSeries.reduce((a, b) => a + b, 0);
  const prevTotal = prevFollowersTotal + prevReachTotal + prevInterTotal;
  const growthRate = {
    value: currTotal,
    prev: prevTotal,
    delta: computeDelta(currTotal, prevTotal),
    series: followers.series.map((_, i) =>
      (followers.series[i] || 0) + (reach.series[i] || 0) + (interactions.series[i] || 0),
    ),
    prevSeries: followers.prevSeries.map((_, i) =>
      (followers.prevSeries[i] || 0) + (reach.prevSeries[i] || 0) + (interactions.prevSeries[i] || 0),
    ),
  };

  // Sort networks in a stable, predictable order
  const ORDER = ["youtube", "instagram", "facebook", "linkedin", "x", "tiktok"];
  networkSummaries.sort((a, b) => ORDER.indexOf(a.network) - ORDER.indexOf(b.network));

  // Build YYYY-MM-DD axis for the current and previous windows so the
  // frontend can render per-day labels/tooltips in sparklines.
  const fmtDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const currDates: string[] = [];
  const prevDates: string[] = [];
  for (let i = 0; i < days; i++) {
    currDates.push(fmtDay(currStartMs + i * 86400000));
    prevDates.push(fmtDay(prevStartMs + i * 86400000));
  }
  const toPoints = (values: number[], dates: string[]) =>
    values.map((value, i) => ({ date: dates[i] || "", value: Number(value || 0) }));

  const serialize = (m: MetricBlock) => ({
    total: m.total,
    delta: m.delta,
    series: toPoints(m.series, currDates),
    prevSeries: toPoints(m.prevSeries, prevDates),
  });

  res.json({
    days,
    range: { start: currDates[0], end: currDates[currDates.length - 1] },
    totals: {
      views: reach.total,
      engagements: interactions.total,
      followers: followers.total,
      posts: postsCount,
      viewsDelta: reach.delta,
      engagementsDelta: interactions.delta,
      followersDelta: followers.delta,
      postsDelta: posts.delta,
    },
    networks: networkSummaries,
    sources,
    followers: serialize(followers),
    reach: serialize(reach),
    interactions: serialize(interactions),
    posts: serialize(posts),
    growthRate: {
      value: growthRate.value,
      prev: growthRate.prev,
      delta: growthRate.delta,
      series: toPoints(growthRate.series, currDates),
      prevSeries: toPoints(growthRate.prevSeries, prevDates),
    },
  });
});

export default router;
