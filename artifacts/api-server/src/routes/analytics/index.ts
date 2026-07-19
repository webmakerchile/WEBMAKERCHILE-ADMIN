import { Router, type IRouter, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { users, videos } from "@workspace/db/schema";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getValidLinkedInToken } from "../linkedin";
import { getValidXToken } from "../x";
import { buildBrandToneSuffix } from "../../lib/brand-tone";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
import { getCredential } from "../../lib/credentials";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const IG_API_BASE = "https://graph.instagram.com/v21.0";
const FB_GRAPH_BASE = "https://graph.facebook.com/v21.0";

type Series = number[];

type MetricBlock = {
  total: number;
  delta: number;
  series: Series;
  prevSeries: Series;
  /**
   * "cumulative" (default): each bucket is an additive event count for that
   *   day (e.g. impressions, likes). delta = (total - sum(prevSeries))/sum(prevSeries).
   * "snapshot": value is a point-in-time count (e.g. lifetime followers) with
   *   no per-day history. We plateau the snapshot across all buckets in both
   *   periods so visualisations show a stable line. delta is computed from
   *   the final bucket of each window (apples-to-apples) so the plateau
   *   doesn't break the math.
   */
  kind?: "cumulative" | "snapshot";
  /**
   * Aggregate-only: sum of totals contributed by snapshot sources via
   * `addMetric`. Used by `finalizeMetric` to subtract the constant plateau
   * contribution (baseline * (days - 1)) before computing delta — so the
   * baseline is effectively counted once, like a real previous-period total.
   */
  snapshotBaseline?: number;
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

function emptyMetric(days: number, kind: "cumulative" | "snapshot" = "cumulative"): MetricBlock {
  return {
    total: 0,
    delta: 0,
    series: new Array(days).fill(0),
    prevSeries: new Array(days).fill(0),
    kind,
    snapshotBaseline: 0,
  };
}

/** Milliseconds in one day. Kept as a named constant so future adapters
 *  can't drift on the magic number. */
const MS_PER_DAY = 86_400_000;

/**
 * Returns the UTC-midnight epoch (ms) for the given date (defaults to "now").
 * All per-network adapters must build their day axis from this so buckets align
 * regardless of the server's local timezone (see Task #6 + Task #12).
 */
function utcMidnightMs(d: Date = new Date()): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addMetric(target: MetricBlock, source: MetricBlock) {
  target.total += source.total;
  for (let i = 0; i < target.series.length; i++) {
    target.series[i] = (target.series[i] || 0) + (source.series[i] || 0);
    target.prevSeries[i] = (target.prevSeries[i] || 0) + (source.prevSeries[i] || 0);
  }
  if (source.kind === "snapshot") {
    target.snapshotBaseline = (target.snapshotBaseline || 0) + source.total;
  }
}

function computeDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function finalizeMetric(m: MetricBlock) {
  if (m.kind === "snapshot") {
    // Snapshot metric: plateau in both windows. Compare last bucket of each
    // window (apples-to-apples) so the plateau doesn't fake growth or decline.
    const last = m.series.length - 1;
    const curr = m.series[last] || 0;
    const prev = m.prevSeries[last] || 0;
    m.delta = computeDelta(curr, prev);
    return;
  }
  // Cumulative metric. If snapshot sources contributed plateau via addMetric,
  // their constant baseline shows up in every bucket of prevSeries — i.e.
  // baseline*days extra. Subtract baseline*(days-1) so the baseline is
  // effectively counted once (like a real previous-period total) and the
  // delta stays meaningful for the cumulative portion.
  const days = m.prevSeries.length;
  const baseline = m.snapshotBaseline || 0;
  const prevTotal = m.prevSeries.reduce((a, b) => a + b, 0) - baseline * Math.max(0, days - 1);
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

    // Anchor the day axis on UTC midnight so buckets line up across networks
    // regardless of the server's local timezone (Task #12).
    const todayUtcMs = utcMidnightMs();
    const today = new Date(todayUtcMs);
    const start = new Date(todayUtcMs - (days - 1) * MS_PER_DAY);
    const prevStart = new Date(todayUtcMs - (days * 2 - 1) * MS_PER_DAY);
    const prevEnd = new Date(todayUtcMs - days * MS_PER_DAY);

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
        const idx = Math.floor((new Date(dateStr).getTime() - origin.getTime()) / MS_PER_DAY);
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
  const [igToken, igUserId] = await Promise.all([
    getCredential("INSTAGRAM_ACCESS_TOKEN"),
    getCredential("INSTAGRAM_USER_ID"),
  ]);
  if (!igToken || !igUserId) return null;
  try {
    // UTC-midnight axis so the requested window matches the day axis returned
    // to the frontend (Task #12 / #14). `endMs` is the start of "tomorrow" in
    // UTC so the bucket for "today" is fully included.
    const todayUtcMs = utcMidnightMs();
    const currStartMs = todayUtcMs - (days - 1) * MS_PER_DAY;
    const prevStartMs = currStartMs - days * MS_PER_DAY;
    const endMs = todayUtcMs + MS_PER_DAY;
    const sinceCurr = Math.floor(currStartMs / 1000);
    const sincePrev = Math.floor(prevStartMs / 1000);
    const untilCurr = Math.floor(endMs / 1000);
    const untilPrev = sinceCurr;

    const buildUrl = (since: number, until: number) =>
      `${IG_API_BASE}/${igUserId}/insights?metric=reach,follower_count&period=day&since=${since}&until=${until}&access_token=${encodeURIComponent(igToken)}`;

    type IgInsightValue = { end_time: string; value?: number };
    type IgInsightItem = { name: string; values?: IgInsightValue[] };
    type IgInsightResponse = { data?: IgInsightItem[]; error?: { message?: string } } | null;

    const [currR, prevR] = await Promise.all([
      fetch(buildUrl(sinceCurr, untilCurr))
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

    const consume = (data: IgInsightResponse, originMs: number, target: "series" | "prevSeries") => {
      if (!data?.data) return;
      for (const item of data.data) {
        const block = item.name === "follower_count" ? followers : item.name === "reach" ? reach : null;
        if (!block) continue;
        for (const v of item.values || []) {
          const t = new Date(v.end_time).getTime();
          const idx = Math.floor((t - originMs) / MS_PER_DAY);
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
    // UTC-midnight axis so the requested window matches the day axis returned
    // to the frontend (Task #12 / #14). `endMs` is the start of "tomorrow" in
    // UTC so the bucket for "today" is fully included.
    const todayUtcMs = utcMidnightMs();
    const currStartMs = todayUtcMs - (days - 1) * MS_PER_DAY;
    const prevStartMs = currStartMs - days * MS_PER_DAY;
    const endMs = todayUtcMs + MS_PER_DAY;
    const sinceCurr = Math.floor(currStartMs / 1000);
    const sincePrev = Math.floor(prevStartMs / 1000);
    const untilCurr = Math.floor(endMs / 1000);
    const untilPrev = sinceCurr;

    const buildUrl = (since: number, until: number) =>
      `${FB_GRAPH_BASE}/${fbPageId}/insights?metric=page_impressions_unique,page_post_engagements,page_fan_adds,page_fan_removes&period=day&since=${since}&until=${until}&access_token=${encodeURIComponent(fbToken)}`;

    type FbInsightValue = { end_time: string; value?: number };
    type FbInsightItem = { name: string; values?: FbInsightValue[] };
    type FbInsightResponse = { data?: FbInsightItem[]; error?: { message?: string } } | null;

    const [currR, prevR] = await Promise.all([
      fetch(buildUrl(sinceCurr, untilCurr))
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

    const consume = (data: FbInsightResponse, originMs: number, target: "series" | "prevSeries") => {
      if (!data?.data) return;
      for (const item of data.data) {
        const block =
          item.name === "page_impressions_unique" ? reach :
          item.name === "page_post_engagements" ? interactions : null;
        if (block) {
          for (const v of item.values || []) {
            const t = new Date(v.end_time).getTime();
            const idx = Math.floor((t - originMs) / MS_PER_DAY);
            if (idx < 0 || idx >= days) continue;
            block[target][idx] = (block[target][idx] || 0) + Number(v.value || 0);
          }
        } else if (item.name === "page_fan_adds" || item.name === "page_fan_removes") {
          const sign = item.name === "page_fan_adds" ? 1 : -1;
          for (const v of item.values || []) {
            const t = new Date(v.end_time).getTime();
            const idx = Math.floor((t - originMs) / MS_PER_DAY);
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
    // UTC-midnight axis so the requested window matches the day axis returned
    // to the frontend (Task #12 / #14). `endMs` is the start of "tomorrow" in
    // UTC so the bucket for "today" is fully included.
    const todayUtcMs = utcMidnightMs();
    const currStartMs = todayUtcMs - (days - 1) * MS_PER_DAY;
    const prevStartMs = currStartMs - days * MS_PER_DAY;
    const endMs = todayUtcMs + MS_PER_DAY;
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
      fetch(buildUrl(currStartMs, endMs), { headers })
        .then((r) => (r.ok ? (r.json() as Promise<LiResponse>) : null))
        .catch(() => null),
      fetch(buildUrl(prevStartMs, currStartMs), { headers })
        .then((r) => (r.ok ? (r.json() as Promise<LiResponse>) : null))
        .catch(() => null),
    ]);
    if (!currR) return null;

    const followers = emptyMetric(days);
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);

    const consume = (data: LiResponse, originMs: number, target: "series" | "prevSeries") => {
      for (const el of data?.elements || []) {
        const t = el.timeRange?.start;
        if (!t) continue;
        const idx = Math.floor((t - originMs) / MS_PER_DAY);
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
    const meR = await fetch("https://api.twitter.com/2/users/me?user.fields=public_metrics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meR.ok) {
      console.error("[Analytics][X]", meR.status, await meR.text().catch(() => ""));
      return null;
    }
    const meData = (await meR.json()) as {
      data?: { id?: string; public_metrics?: { followers_count?: number } };
    };
    const fc = Number(meData.data?.public_metrics?.followers_count || 0);
    const userId = meData.data?.id;

    const followers = emptyMetric(days, "snapshot");
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days);

    // X public_metrics has no per-day follower history. Mark the metric as
    // "snapshot" and plateau the value across all buckets in both windows so
    // visualisations show a stable line (not zeros + a single spike). The
    // snapshot-aware finalizeMetric / addMetric keep delta math honest.
    followers.total = fc;
    for (let i = 0; i < days; i++) {
      followers.series[i] = fc;
      followers.prevSeries[i] = fc;
    }

    // Real per-day reach/interactions: aggregate the user's own recent tweets
    // by UTC day. start_time/end_time match the UTC-midnight axis used
    // everywhere else (Tasks #12 / #14). If this call fails (rate limit,
    // missing tier, etc.) we keep the followers snapshot and return zeros
    // for reach/interactions.
    if (userId) {
      const todayUtcMs = utcMidnightMs();
      const currStartMs = todayUtcMs - (days - 1) * MS_PER_DAY;
      const prevStartMs = currStartMs - days * MS_PER_DAY;
      const endMs = todayUtcMs + MS_PER_DAY;

      type XTweet = {
        created_at?: string;
        public_metrics?: {
          retweet_count?: number;
          reply_count?: number;
          like_count?: number;
          quote_count?: number;
          impression_count?: number;
        };
      };
      type XTweetsResponse = {
        data?: XTweet[];
        meta?: { next_token?: string };
        errors?: unknown;
      } | null;

      // Fetch one page. max_results=100 is the per-page max on Free/Basic.
      const fetchTweetsPage = async (
        startMs: number,
        endMsArg: number,
        nextToken?: string,
      ): Promise<XTweetsResponse> => {
        const params = new URLSearchParams({
          max_results: "100",
          "tweet.fields": "created_at,public_metrics",
          start_time: new Date(startMs).toISOString(),
          end_time: new Date(endMsArg).toISOString(),
        });
        if (nextToken) params.set("pagination_token", nextToken);
        try {
          const r = await fetch(
            `https://api.twitter.com/2/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!r.ok) {
            console.error("[Analytics][X] tweets", r.status, await r.text().catch(() => ""));
            return null;
          }
          return (await r.json()) as XTweetsResponse;
        } catch (e) {
          console.error("[Analytics][X] tweets", (e instanceof Error ? e.message : String(e)));
          return null;
        }
      };

      // Walk pagination via next_token, capped at MAX_PAGES so a runaway
      // prolific account can't burn rate-limit budget. Returns merged tweets.
      // Tradeoff: extreme-volume accounts publishing >MAX_PAGES*100 tweets in
      // a single window will undercount reach/interactions; the cap is
      // intentional to stay within X API rate limits. If accuracy needs
      // increase, raise MAX_PAGES or make it env-configurable in a follow-up.
      const MAX_PAGES = 5;
      const fetchAllTweets = async (startMs: number, endMsArg: number): Promise<XTweet[]> => {
        const out: XTweet[] = [];
        let token: string | undefined = undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const resp: XTweetsResponse = await fetchTweetsPage(startMs, endMsArg, token);
          if (!resp) break;
          if (resp.data?.length) out.push(...resp.data);
          token = resp.meta?.next_token;
          if (!token) break;
        }
        return out;
      };

      const consume = (tweets: XTweet[], originMs: number, target: "series" | "prevSeries") => {
        for (const t of tweets) {
          if (!t.created_at) continue;
          const tMs = new Date(t.created_at).getTime();
          const idx = Math.floor((tMs - originMs) / MS_PER_DAY);
          if (idx < 0 || idx >= days) continue;
          const m = t.public_metrics || {};
          reach[target][idx] += Number(m.impression_count || 0);
          interactions[target][idx] +=
            Number(m.like_count || 0) +
            Number(m.reply_count || 0) +
            Number(m.retweet_count || 0) +
            Number(m.quote_count || 0);
        }
      };

      const [currT, prevT] = await Promise.all([
        fetchAllTweets(currStartMs, endMs),
        fetchAllTweets(prevStartMs, currStartMs),
      ]);
      consume(currT, currStartMs, "series");
      consume(prevT, prevStartMs, "prevSeries");
      reach.total = reach.series.reduce((a, b) => a + b, 0);
      interactions.total = interactions.series.reduce((a, b) => a + b, 0);
    }

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
    const followers = emptyMetric(days, "snapshot");
    const reach = emptyMetric(days);
    const interactions = emptyMetric(days, "snapshot");
    const fc = Number(u?.follower_count || 0);
    const likes = Number(u?.likes_count || 0);

    // TikTok /v2/user/info/ only returns lifetime snapshots and our current
    // OAuth scope ("user.info.basic,video.upload") does not include
    // "video.list", so we can't aggregate per-video stats to build a real
    // per-day series (see follow-up #15 to expand the scope). Mark these
    // metrics as "snapshot" and plateau the value across all buckets so the
    // sparkline shows a stable line. The snapshot-aware finalize/add helpers
    // keep delta math honest both per-network and at the aggregate level.
    followers.total = fc;
    interactions.total = likes;
    for (let i = 0; i < days; i++) {
      followers.series[i] = fc;
      followers.prevSeries[i] = fc;
      interactions.series[i] = likes;
      interactions.prevSeries[i] = likes;
    }

    finalizeMetric(followers); finalizeMetric(reach); finalizeMetric(interactions);
    return { followers, reach, interactions };
  } catch (err) {
    console.error("[Analytics][TikTok]", (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

router.get("/analytics/summary", async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
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
  // Use UTC end-to-end so day buckets line up regardless of server/DB tz.
  const todayUtcMs = utcMidnightMs();
  const currStartMs = todayUtcMs - (days - 1) * MS_PER_DAY;
  const prevStartMs = currStartMs - days * MS_PER_DAY;
  const currStartDate = new Date(currStartMs);
  const prevStartDate = new Date(prevStartMs);
  const windowEndDate = new Date(todayUtcMs + MS_PER_DAY);

  const posts = emptyMetric(days);
  try {
    type PostRow = { day: string; count: number };
    // Truncate at UTC day so the returned date string corresponds to the
    // same boundary we use to compute `idx` below.
    const dayExpr = sql<string>`to_char(${videos.publishedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const fillFromRows = (rows: PostRow[], originMs: number, target: "series" | "prevSeries") => {
      for (const row of rows) {
        const t = new Date(row.day + "T00:00:00Z").getTime();
        const idx = Math.floor((t - originMs) / MS_PER_DAY);
        if (idx < 0 || idx >= days) continue;
        posts[target][idx] = (posts[target][idx] || 0) + Number(row.count || 0);
      }
    };
    const currRows = (await db
      .select({ day: dayExpr, count: sql<number>`count(*)::int` })
      .from(videos)
      .where(and(
        eq(videos.status, "published"),
        gte(videos.publishedAt, currStartDate),
        lt(videos.publishedAt, windowEndDate),
      ))
      .groupBy(dayExpr)) as PostRow[];
    const prevRows = (await db
      .select({ day: dayExpr, count: sql<number>`count(*)::int` })
      .from(videos)
      .where(and(
        eq(videos.status, "published"),
        gte(videos.publishedAt, prevStartDate),
        lt(videos.publishedAt, currStartDate),
      ))
      .groupBy(dayExpr)) as PostRow[];
    fillFromRows(currRows, currStartMs, "series");
    fillFromRows(prevRows, prevStartMs, "prevSeries");
    posts.total = posts.series.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[Analytics][posts] error:", (err instanceof Error ? err.message : String(err)));
  }
  finalizeMetric(posts);
  const postsCount = posts.total;

  const currTotal = followers.total + reach.total + interactions.total;
  // For each aggregate block, snapshot sources contributed a constant plateau
  // to prevSeries (baseline added to every bucket via addMetric). Subtract
  // baseline*(days-1) so the baseline is effectively counted once, matching
  // how `finalizeMetric` computes deltas for cumulative blocks. Without this
  // correction growthRate.delta would be heavily negative whenever an account
  // has snapshot-only networks (X / TikTok) connected.
  const adjPrevSum = (m: MetricBlock) => {
    const baseline = m.snapshotBaseline || 0;
    return m.prevSeries.reduce((a, b) => a + b, 0) - baseline * Math.max(0, days - 1);
  };
  const prevFollowersTotal = adjPrevSum(followers);
  const prevReachTotal = adjPrevSum(reach);
  const prevInterTotal = adjPrevSum(interactions);
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
    currDates.push(fmtDay(currStartMs + i * MS_PER_DAY));
    prevDates.push(fmtDay(prevStartMs + i * MS_PER_DAY));
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

// Best times to publish per network. Returns top-3 (dow 0=Mon..6=Sun, hour 0-23)
// per network. Score is recency-weighted (exp(-days/30)) over published posts;
// when buckets are sparse we fall back to industry defaults. Engagement-aware
// scoring (per-post views/likes/comments) is the next iteration — see weightOf.
type BestTimeSlot = { dow: number; hour: number; score: number; source: "history" | "default" };
type Net = "youtube" | "instagram" | "tiktok" | "linkedin" | "x" | "facebook";

const BEST_TIME_DEFAULTS: Record<Net, { dow: number; hour: number; score: number }[]> = {
  // dow uses 0=Mon..6=Sun to match the UI's Lun-first calendar
  youtube: [
    { dow: 5, hour: 18, score: 100 }, // Sat 18:00
    { dow: 6, hour: 12, score: 92 },  // Sun 12:00
    { dow: 4, hour: 19, score: 88 },  // Fri 19:00
  ],
  instagram: [
    { dow: 1, hour: 11, score: 100 }, // Tue 11:00
    { dow: 2, hour: 14, score: 95 },  // Wed 14:00
    { dow: 3, hour: 11, score: 90 },  // Thu 11:00
  ],
  tiktok: [
    { dow: 0, hour: 19, score: 100 }, // Mon 19:00
    { dow: 1, hour: 18, score: 95 },  // Tue 18:00
    { dow: 3, hour: 21, score: 90 },  // Thu 21:00
  ],
  linkedin: [
    { dow: 0, hour: 10, score: 100 }, // Mon 10:00
    { dow: 1, hour: 9, score: 96 },   // Tue 09:00
    { dow: 2, hour: 12, score: 92 },  // Wed 12:00
  ],
  x: [
    { dow: 0, hour: 9, score: 100 },  // Mon 09:00
    { dow: 2, hour: 12, score: 94 },  // Wed 12:00
    { dow: 3, hour: 15, score: 90 },  // Thu 15:00
  ],
  facebook: [
    { dow: 1, hour: 13, score: 100 }, // Tue 13:00
    { dow: 2, hour: 15, score: 95 },  // Wed 15:00
    { dow: 3, hour: 12, score: 90 },  // Thu 12:00
  ],
};

const STATUS_COL: Record<Net, AnyPgColumn> = {
  youtube: videos.youtubeStatus,
  instagram: videos.instagramStatus,
  tiktok: videos.tiktokStatus,
  linkedin: videos.linkedinStatus,
  x: videos.xStatus,
  facebook: videos.facebookStatus,
};

// Engagement weight for a published post. Recency decay today; replace
// with `(views + likes + comments)` once denormalised on `videos`.
function weightOf(ts: Date, now: number): number {
  const days = Math.max(0, (now - ts.getTime()) / (1000 * 60 * 60 * 24));
  return Math.exp(-days / 30);
}

// Tenancy note: the `videos` table is single-workspace (no userId/teamId
// column — see lib/db/src/schema/videos.ts), so all routes that read from
// `videos` operate on the shared content set by design. If the data model
// later grows a tenancy column, scope this query alongside the rest.
router.get("/analytics/best-times", async (_req: Request, res: Response) => {
  const NETS: Net[] = ["youtube", "instagram", "tiktok", "linkedin", "x", "facebook"];
  const out: Record<Net, BestTimeSlot[]> = {} as Record<Net, BestTimeSlot[]>;
  const now = Date.now();

  await Promise.all(
    NETS.map(async (net) => {
      try {
        const rows = await db
          .select({ scheduledAt: videos.scheduledAt, publishedAt: videos.publishedAt })
          .from(videos)
          .where(
            and(
              eq(STATUS_COL[net], "published"),
              // Need at least one timestamp to bucket from. Older posts may
              // only have publishedAt; new ones typically have both.
              sql`(${videos.scheduledAt} is not null OR ${videos.publishedAt} is not null)`,
            ),
          )
          // Deterministic ordering: newest first (coalesce to handle either
          // column being null) so that on datasets larger than the limit,
          // recommendations stay stable and biased toward recent activity —
          // which is also where the recency-weighted score draws most signal.
          .orderBy(desc(sql`coalesce(${videos.scheduledAt}, ${videos.publishedAt})`))
          .limit(500);
        const buckets = new Map<string, number>();
        for (const r of rows) {
          // Prefer scheduledAt (planning intent) when available; fall back to
          // publishedAt for older rows. Both are TZ-aware timestamps.
          const ts = r.scheduledAt || r.publishedAt;
          if (!ts) continue;
          const d = new Date(ts);
          // Convert JS getDay() (0=Sun..6=Sat) to UI convention (0=Mon..6=Sun)
          const dow = (d.getDay() + 6) % 7;
          const hour = d.getHours();
          const key = `${dow}_${hour}`;
          buckets.set(key, (buckets.get(key) || 0) + weightOf(d, now));
        }
        if (buckets.size >= 3) {
          const sorted = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
          const max = sorted[0][1] || 1;
          out[net] = sorted.map(([k, v]) => {
            const [dow, hour] = k.split("_").map(Number);
            return { dow, hour, score: Math.round((v / max) * 100), source: "history" };
          });
        } else {
          out[net] = BEST_TIME_DEFAULTS[net].map((s) => ({ ...s, source: "default" }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Analytics][best-times] ${net} failed: ${msg}`);
        out[net] = BEST_TIME_DEFAULTS[net].map((s) => ({ ...s, source: "default" }));
      }
    }),
  );

  res.json({ networks: out });
});

/* ============================================================
 * Analytics v2 — timeseries (per-network), top videos, AI insights
 * ============================================================ */

type TsPoint = { date: string; value: number };

router.get("/analytics/timeseries", async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
  const user = getUser(req);

  const todayUtcMs = utcMidnightMs();
  const currStartMs = todayUtcMs - (days - 1) * MS_PER_DAY;
  const fmtDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(fmtDay(currStartMs + i * MS_PER_DAY));

  type NetResult = { followers: MetricBlock; reach: MetricBlock; interactions: MetricBlock } | null;
  const networkFns: { name: Net; fn: () => Promise<NetResult> }[] = [
    { name: "youtube", fn: () => fetchYouTube(user, days) },
    { name: "instagram", fn: () => fetchInstagram(user, days) },
    { name: "facebook", fn: () => fetchFacebook(user, days) },
    { name: "linkedin", fn: () => fetchLinkedIn(user, days) },
    { name: "x", fn: () => fetchX(user, days) },
    { name: "tiktok", fn: () => fetchTikTok(user, days) },
  ];

  const results = await Promise.all(networkFns.map(async (n) => {
    try {
      const r = await n.fn();
      if (!r) {
        return { network: n.name, connected: false, reach: [] as TsPoint[], interactions: [] as TsPoint[], followers: [] as TsPoint[], totals: { reach: 0, interactions: 0, followers: 0 } };
      }
      const toPts = (arr: number[]) => arr.map((v, i) => ({ date: dates[i] || "", value: Number(v || 0) }));
      return {
        network: n.name,
        connected: true,
        reach: toPts(r.reach.series),
        interactions: toPts(r.interactions.series),
        followers: toPts(r.followers.series),
        totals: { reach: r.reach.total, interactions: r.interactions.total, followers: r.followers.total },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Analytics][timeseries][${n.name}]`, msg);
      return { network: n.name, connected: false, reach: [] as TsPoint[], interactions: [] as TsPoint[], followers: [] as TsPoint[], totals: { reach: 0, interactions: 0, followers: 0 }, error: msg };
    }
  }));

  res.json({ days, dates, networks: results });
});

type TopMetric = { views: number; likes: number; comments: number; shares: number };
function emptyTopMetric(): TopMetric { return { views: 0, likes: 0, comments: 0, shares: 0 }; }

router.get("/analytics/top", async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
  const networkFilter = String(req.query.network || "all").toLowerCase();
  const user = getUser(req);

  const todayUtcMs = utcMidnightMs();
  const startMs = todayUtcMs - (days - 1) * MS_PER_DAY;
  const startDate = new Date(startMs);

  const rows = await db.select().from(videos)
    .where(and(eq(videos.status, "published"), gte(videos.publishedAt, startDate)))
    .orderBy(desc(videos.publishedAt))
    .limit(200);

  const wants = (n: string) => networkFilter === "all" || networkFilter === n;
  const SUPPORTED_PER_VIDEO = new Set(["youtube", "instagram", "facebook", "x"]);
  if (networkFilter !== "all" && !SUPPORTED_PER_VIDEO.has(networkFilter)) {
    res.json({
      days,
      network: networkFilter,
      items: [],
      unsupported: true,
      message: `Métricas por video no disponibles para ${networkFilter}. La API pública de esta red no expone estadísticas por publicación.`,
    });
    return;
  }

  // YouTube batch (videos.list, up to 50 ids per call)
  const ytStats = new Map<string, TopMetric>();
  const ytIds = wants("youtube") ? (rows.map((r) => r.youtubeVideoId).filter(Boolean) as string[]) : [];
  if (ytIds.length && user.googleAccessToken) {
    try {
      const auth = getOAuth2Client(user);
      const ytApi = google.youtube({ version: "v3", auth });
      for (let i = 0; i < ytIds.length; i += 50) {
        const ids = ytIds.slice(i, i + 50);
        const r = await ytApi.videos.list({ part: ["statistics"], id: ids });
        for (const item of r.data.items || []) {
          const s = item.statistics || {};
          ytStats.set(item.id || "", {
            views: Number(s.viewCount || 0),
            likes: Number(s.likeCount || 0),
            comments: Number(s.commentCount || 0),
            shares: 0,
          });
        }
      }
    } catch (err) {
      console.error("[Analytics][top][youtube]", err instanceof Error ? err.message : String(err));
    }
  }

  // X batch (tweets?ids=, up to 100)
  const xStats = new Map<string, TopMetric>();
  const xIds = wants("x") ? (rows.map((r) => r.xPostId).filter(Boolean) as string[]) : [];
  if (xIds.length) {
    const token = await getValidXToken(user);
    if (token) {
      try {
        for (let i = 0; i < xIds.length; i += 100) {
          const ids = xIds.slice(i, i + 100);
          const r = await fetch(`https://api.twitter.com/2/tweets?ids=${ids.join(",")}&tweet.fields=public_metrics`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!r.ok) continue;
          const data = (await r.json()) as { data?: { id: string; public_metrics?: Record<string, number> }[] };
          for (const t of data.data || []) {
            const m = t.public_metrics || {};
            xStats.set(t.id, {
              views: Number(m.impression_count || 0),
              likes: Number(m.like_count || 0),
              comments: Number(m.reply_count || 0),
              shares: Number(m.retweet_count || 0) + Number(m.quote_count || 0),
            });
          }
        }
      } catch (err) {
        console.error("[Analytics][top][x]", err instanceof Error ? err.message : String(err));
      }
    }
  }

  // IG per-media (limited to keep request bounded)
  const igStats = new Map<string, TopMetric>();
  const igTopToken = await getCredential("INSTAGRAM_ACCESS_TOKEN");
  if (igTopToken && wants("instagram")) {
    const igIds = (rows.map((r) => r.instagramMediaId).filter(Boolean) as string[]).slice(0, 50);
    await Promise.all(igIds.map(async (id) => {
      try {
        const r = await fetch(`${IG_API_BASE}/${id}?fields=like_count,comments_count,insights.metric(reach,plays,shares)&access_token=${encodeURIComponent(igTopToken)}`);
        if (!r.ok) return;
        const d = (await r.json()) as { like_count?: number; comments_count?: number; insights?: { data?: { name: string; values?: { value?: number }[] }[] } };
        const insights: Record<string, number> = {};
        for (const it of d.insights?.data || []) insights[it.name] = Number(it.values?.[0]?.value || 0);
        igStats.set(id, {
          views: insights.plays || insights.reach || 0,
          likes: Number(d.like_count || 0),
          comments: Number(d.comments_count || 0),
          shares: insights.shares || 0,
        });
      } catch { /* ignore */ }
    }));
  }

  // Facebook per-post (basic engagement counts)
  const fbStats = new Map<string, TopMetric>();
  const fbToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim() || user.facebookPageAccessToken || "";
  if (fbToken && wants("facebook")) {
    const fbIds = (rows.map((r) => r.facebookPostId).filter(Boolean) as string[]).slice(0, 50);
    await Promise.all(fbIds.map(async (id) => {
      try {
        const r = await fetch(`${FB_GRAPH_BASE}/${id}?fields=likes.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(fbToken)}`);
        if (!r.ok) return;
        const d = (await r.json()) as { likes?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } };
        fbStats.set(id, {
          views: 0,
          likes: Number(d.likes?.summary?.total_count || 0),
          comments: Number(d.comments?.summary?.total_count || 0),
          shares: Number(d.shares?.count || 0),
        });
      } catch { /* ignore */ }
    }));
  }

  type ItemOut = {
    videoId: number;
    title: string;
    coverImageBase64: string | null;
    coverMimeType: string | null;
    publishedAt: string | null;
    perNetwork: Record<string, TopMetric>;
    totals: TopMetric;
    engagement: number;
  };

  const items: ItemOut[] = [];
  for (const v of rows) {
    const perNetwork: Record<string, TopMetric> = {};
    if (v.youtubeVideoId && ytStats.has(v.youtubeVideoId)) perNetwork.youtube = ytStats.get(v.youtubeVideoId)!;
    if (v.instagramMediaId && igStats.has(v.instagramMediaId)) perNetwork.instagram = igStats.get(v.instagramMediaId)!;
    if (v.facebookPostId && fbStats.has(v.facebookPostId)) perNetwork.facebook = fbStats.get(v.facebookPostId)!;
    if (v.xPostId && xStats.has(v.xPostId)) perNetwork.x = xStats.get(v.xPostId)!;
    if (Object.keys(perNetwork).length === 0) continue;

    const agg = emptyTopMetric();
    const keys = networkFilter === "all" ? Object.keys(perNetwork) : [networkFilter];
    for (const k of keys) {
      const n = perNetwork[k];
      if (!n) continue;
      agg.views += n.views;
      agg.likes += n.likes;
      agg.comments += n.comments;
      agg.shares += n.shares;
    }
    const engagement = agg.views * 1 + agg.likes * 3 + agg.comments * 5 + agg.shares * 7;
    if (networkFilter !== "all" && !perNetwork[networkFilter]) continue;
    items.push({
      videoId: v.id,
      title: v.title,
      coverImageBase64: v.coverImageBase64,
      coverMimeType: v.coverMimeType,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      perNetwork,
      totals: agg,
      engagement,
    });
  }

  items.sort((a, b) => b.engagement - a.engagement);
  res.json({ days, network: networkFilter, items: items.slice(0, 10) });
});

router.get("/analytics/insights", async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));

  const todayUtcMs = utcMidnightMs();
  const startMs = todayUtcMs - (days - 1) * MS_PER_DAY;
  const prevStartMs = startMs - days * MS_PER_DAY;
  const startDate = new Date(startMs);
  const prevStartDate = new Date(prevStartMs);

  const NETS: Net[] = ["youtube", "instagram", "tiktok", "linkedin", "x", "facebook"];
  const postsByNet: Record<string, { current: number; previous: number }> = {};
  await Promise.all(NETS.map(async (n) => {
    try {
      const [curRow] = await db.select({ c: sql<number>`count(*)::int` }).from(videos)
        .where(and(eq(STATUS_COL[n], "published"), gte(videos.publishedAt, startDate)));
      const [prevRow] = await db.select({ c: sql<number>`count(*)::int` }).from(videos)
        .where(and(eq(STATUS_COL[n], "published"), gte(videos.publishedAt, prevStartDate), lt(videos.publishedAt, startDate)));
      postsByNet[n] = { current: Number(curRow?.c || 0), previous: Number(prevRow?.c || 0) };
    } catch {
      postsByNet[n] = { current: 0, previous: 0 };
    }
  }));

  type DowHourRow = { dow: number; hour: number; count: number };
  let distribution: DowHourRow[] = [];
  try {
    const rows = await db.select({
      dow: sql<number>`(extract(dow from coalesce(${videos.publishedAt}, ${videos.scheduledAt}))::int + 6) % 7`,
      hour: sql<number>`extract(hour from coalesce(${videos.publishedAt}, ${videos.scheduledAt}))::int`,
      count: sql<number>`count(*)::int`,
    }).from(videos)
      .where(and(eq(videos.status, "published"), gte(videos.publishedAt, startDate)))
      .groupBy(sql`1`, sql`2`);
    distribution = rows.map((r) => ({ dow: Number(r.dow), hour: Number(r.hour), count: Number(r.count) }));
  } catch (err) {
    console.warn("[Analytics][insights] distribution failed:", err instanceof Error ? err.message : String(err));
  }

  const dataSnapshot = { days, postsByNetwork: postsByNet, distribution };

  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    res.json({
      insights: [{ type: "info", title: "IA no configurada", body: "Configura la integración de OpenAI para activar las recomendaciones automáticas." }],
      data: dataSnapshot,
    });
    return;
  }

  try {
    const { default: OpenAI } = await import("openai");
    // Preferir la API key propia del usuario para que el costo se cargue
    // a su cuenta de OpenAI, no a la de Replit.
    const useOwnKey = !!process.env.OPENAI_API_KEY;
    const openai = new OpenAI({
      apiKey: useOwnKey
        ? process.env.OPENAI_API_KEY
        : process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: useOwnKey ? undefined : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const prompt = `Eres analista de redes sociales para una agencia. Te paso datos agregados de los últimos ${days} días en JSON. Devuelve EXACTAMENTE 4 recomendaciones accionables en español, basadas SOLO en estos datos. Cada recomendación debe ser específica, breve (1-2 líneas) y con datos concretos del JSON (números, nombres de redes, días/horas). Devuelve SOLO un objeto JSON con la clave "insights" cuyo valor sea un array. Cada item: { "type": "win" | "warning" | "info", "title": string, "body": string }.

Reglas:
- "win" = oportunidad clara o algo funcionando bien.
- "warning" = riesgo o caída a corregir.
- "info" = dato relevante neutral.
- Días: 0=Lunes, 6=Domingo.

Datos:
${JSON.stringify(dataSnapshot)}${await buildBrandToneSuffix(getUser(req).id)}`;

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });
    const text = r.choices[0]?.message?.content || "{}";
    let parsed: { insights?: unknown } = {};
    try { parsed = JSON.parse(text); } catch { /* keep empty */ }
    const arr = Array.isArray(parsed.insights) ? parsed.insights : [];
    const insights = arr.filter((x: unknown): x is { type: string; title: string; body: string } => {
      return !!x && typeof x === "object" && "title" in x && "body" in x;
    }).map((x) => ({
      type: ["win", "warning", "info"].includes(x.type) ? x.type : "info",
      title: String(x.title).slice(0, 200),
      body: String(x.body).slice(0, 500),
    }));
    res.json({ insights, data: dataSnapshot });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Analytics][insights]", msg);
    res.json({
      insights: [{ type: "warning", title: "No se pudieron generar insights", body: msg }],
      data: dataSnapshot,
    });
  }
});

export default router;
