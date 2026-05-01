import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { competitors } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

type AuthedUser = { id: number; email?: string; name?: string };
function getUser(req: Request): AuthedUser {
  return req.user as AuthedUser;
}

type FeedItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
};

const NEWS_FEEDS_DEFAULT = [
  "https://news.google.com/rss/search?q=marketing+digital&hl=es-419&gl=CL&ceid=CL:es",
  "https://news.google.com/rss/search?q=redes+sociales&hl=es-419&gl=CL&ceid=CL:es",
  "https://news.google.com/rss/search?q=inteligencia+artificial&hl=es-419&gl=CL&ceid=CL:es",
];

function getNewsFeeds(): string[] {
  const env = process.env.INSPIRATIONS_NEWS_FEEDS;
  if (!env) return NEWS_FEEDS_DEFAULT;
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

let newsCache: { fetchedAt: number; items: FeedItem[] } | null = null;
const NEWS_CACHE_MS = 10 * 60 * 1000;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripCData(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function parseRssItems(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRegex) || [];
  for (const item of matches) {
    const get = (tag: string) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
      const m = item.match(re);
      return m ? decodeXmlEntities(stripCData(m[1] || "")).trim() : "";
    };
    const title = get("title");
    const link = get("link");
    const pubDate = get("pubDate");
    const description = get("description");
    if (!title) continue;
    items.push({
      title,
      link,
      pubDate,
      description: description.replace(/<[^>]+>/g, "").slice(0, 240),
      source,
    });
  }
  return items;
}

function parseAtomEntries(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
  const matches = xml.match(entryRegex) || [];
  for (const entry of matches) {
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/i);
    const pubMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i)
      || entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
    const descMatch = entry.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/i)
      || entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const title = titleMatch ? decodeXmlEntities(stripCData(titleMatch[1] || "")).trim() : "";
    if (!title) continue;
    items.push({
      title,
      link: linkMatch ? linkMatch[1] : "",
      pubDate: pubMatch ? (pubMatch[1] || "").trim() : "",
      description: descMatch ? decodeXmlEntities(stripCData(descMatch[1] || "")).replace(/<[^>]+>/g, "").slice(0, 240) : "",
      source,
    });
  }
  return items;
}

router.get("/inspirations/news", async (_req: Request, res: Response) => {
  if (newsCache && Date.now() - newsCache.fetchedAt < NEWS_CACHE_MS) {
    res.json({ items: newsCache.items, cached: true });
    return;
  }
  const feeds = getNewsFeeds();
  const all: FeedItem[] = [];
  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const r = await fetch(feed, {
          headers: { "User-Agent": "Mozilla/5.0 WebMakerAdmin/1.0" },
        });
        if (!r.ok) {
          console.error(`[Inspirations][news] ${feed} returned ${r.status}`);
          return;
        }
        const xml = await r.text();
        const sourceLabel = (() => {
          try {
            return new URL(feed).hostname.replace(/^www\./, "");
          } catch {
            return feed;
          }
        })();
        const items = xml.includes("<entry")
          ? parseAtomEntries(xml, sourceLabel)
          : parseRssItems(xml, sourceLabel);
        all.push(...items.slice(0, 10));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Inspirations][news] ${feed} error:`, msg);
      }
    }),
  );

  all.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  const items = all.slice(0, 20);
  newsCache = { fetchedAt: Date.now(), items };
  res.json({ items, cached: false });
});

const PLATFORMS = ["youtube", "tiktok", "instagram", "x", "linkedin", "facebook"] as const;

const createCompetitorSchema = z.object({
  platform: z.enum(PLATFORMS),
  handle: z.string().min(1).max(120),
  displayName: z.string().max(120).optional().nullable(),
});

router.get("/inspirations/competitors", async (req: Request, res: Response) => {
  const user = getUser(req);
  const rows = await db
    .select()
    .from(competitors)
    .where(eq(competitors.userId, user.id))
    .orderBy(desc(competitors.createdAt));
  res.json({ competitors: rows });
});

router.post("/inspirations/competitors", async (req: Request, res: Response) => {
  const user = getUser(req);
  const parsed = createCompetitorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const handle = parsed.data.handle.replace(/^@/, "").trim();
  const [row] = await db
    .insert(competitors)
    .values({
      userId: user.id,
      platform: parsed.data.platform,
      handle,
      displayName: parsed.data.displayName ?? null,
    })
    .returning();
  res.json({ competitor: row });
});

router.delete("/inspirations/competitors/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const result = await db
    .delete(competitors)
    .where(and(eq(competitors.id, id), eq(competitors.userId, user.id)))
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.json({ success: true });
});

const competitorPostsCache = new Map<string, { fetchedAt: number; items: FeedItem[] }>();
const COMP_POSTS_CACHE_MS = 30 * 60 * 1000;

router.get("/inspirations/competitors/:id/posts", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const [row] = await db
    .select()
    .from(competitors)
    .where(and(eq(competitors.id, id), eq(competitors.userId, user.id)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }

  const cacheKey = `${row.platform}:${row.handle}`;
  const cached = competitorPostsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < COMP_POSTS_CACHE_MS) {
    res.json({ items: cached.items, cached: true });
    return;
  }

  let items: FeedItem[] = [];

  try {
    if (row.platform === "youtube") {
      const handle = row.handle.replace(/^@/, "");
      const candidates = handle.startsWith("UC")
        ? [`https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`]
        : [
            `https://www.youtube.com/feeds/videos.xml?user=${handle}`,
            `https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`,
          ];
      for (const url of candidates) {
        try {
          const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 WebMakerAdmin/1.0" } });
          if (!r.ok) continue;
          const xml = await r.text();
          items = parseAtomEntries(xml, "youtube.com").slice(0, 10);
          if (items.length > 0) break;
        } catch (innerErr) {
          const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
          console.warn(`[Inspirations][competitors] feed ${url} failed:`, msg);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Inspirations][competitors] error:", msg);
  }

  await db
    .update(competitors)
    .set({ lastFetchedAt: new Date() })
    .where(eq(competitors.id, id));

  competitorPostsCache.set(cacheKey, { fetchedAt: Date.now(), items });
  res.json({ items, cached: false });
});

export default router;
