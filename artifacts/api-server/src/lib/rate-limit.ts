import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request } from "express";

function keyByUserOrIp(req: Request): string {
  const userId = (req.user as { id?: number } | undefined)?.id;
  if (userId) return `u:${userId}`;
  return `ip:${ipKeyGenerator(req.ip || "")}`;
}

function buildLimiter(opts: { windowMs: number; max: number; tag: string }) {
  const cfg: Partial<Options> = {
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    handler: (_req, res, _next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
        retryAfterSeconds: retryAfter,
        tag: opts.tag,
      });
    },
  };
  return rateLimit(cfg);
}

/** AI generation endpoints (templates ai-fill, generate-descriptions, insights, hashtags). */
export const aiLimiter = buildLimiter({
  windowMs: 60_000,
  max: 20,
  tag: "ai",
});

/** Publication endpoints (publish/upload to social networks). */
export const publishLimiter = buildLimiter({
  windowMs: 60_000,
  max: 30,
  tag: "publish",
});

/** Heavy upload endpoints (file uploads, chunk uploads). */
export const uploadLimiter = buildLimiter({
  windowMs: 60_000,
  max: 60,
  tag: "upload",
});
