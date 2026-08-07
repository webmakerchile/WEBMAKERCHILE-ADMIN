import { type Request, type Response, type NextFunction } from "express";

/**
 * Email allowlist for the wmc (webmakerlatam.com live passthrough) sections.
 * Independent of the role/area system on purpose: this is scoped to a
 * single external collaborator for now, not a role. Comma-separated env var
 * so it can grow without a code change.
 */
function allowedEmails(): string[] {
  const raw = process.env.WMC_ALLOWED_EMAILS || "webmakerjosue@gmail.com";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function hasWmcAccess(user: { email?: string } | undefined): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && allowedEmails().includes(email);
}

/**
 * Mount AFTER requireAuth + requireApproved. Returns 403 WITHOUT forwarding
 * to the origin when the email isn't allowlisted — the service key must
 * never be spent on behalf of someone who shouldn't reach the origin.
 */
export function requireWmcAccess(req: Request, res: Response, next: NextFunction): void {
  if (hasWmcAccess(req.user as { email?: string } | undefined)) {
    next();
    return;
  }
  res.status(403).json({ error: "No tienes acceso a esta sección" });
}
