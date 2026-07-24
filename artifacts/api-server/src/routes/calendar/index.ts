import { Router, type IRouter, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getCalendarCallbackURL } from "../auth";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getCalendarAuth(user: any) {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token: user.googleCalendarAccessToken,
    refresh_token: user.googleCalendarRefreshToken,
    expiry_date: user.googleCalendarTokenExpiry ? new Date(user.googleCalendarTokenExpiry).getTime() : undefined,
  });
  oauth2Client.on("tokens", async (tokens) => {
    try {
      const updateData: Record<string, unknown> = {};
      if (tokens.access_token) updateData.googleCalendarAccessToken = tokens.access_token;
      if (tokens.refresh_token) updateData.googleCalendarRefreshToken = tokens.refresh_token;
      if (tokens.expiry_date) updateData.googleCalendarTokenExpiry = new Date(tokens.expiry_date);
      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, user.id));
      }
    } catch { /* ignore token refresh persistence errors */ }
  });
  return oauth2Client;
}

/** GET /api/calendar/status — returns { connected, reason?, configured, callbackUrl } */
router.get("/calendar/status", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user?.id) { res.status(401).json({ error: "No autenticado" }); return; }

  // Datos para la tarjeta de configuración guiada en la UI: si Google rechaza
  // la conexión (p. ej. redirect_uri_mismatch), esta es la URI exacta a registrar.
  const configured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
  const callbackUrl = getCalendarCallbackURL();

  if (!configured) {
    res.json({ connected: false, reason: "not_configured", configured, callbackUrl });
    return;
  }

  if (!user.googleCalendarAccessToken) {
    res.json({ connected: false, reason: "no_token", configured, callbackUrl });
    return;
  }

  try {
    const auth = getCalendarAuth(user);
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.calendarList.list({ maxResults: 1 });
    res.json({ connected: true, configured, callbackUrl });
  } catch (err: any) {
    const raw = `${err?.message || ""} ${JSON.stringify(err?.response?.data || {})}`;
    const isExpired = raw.includes("invalid_grant");
    const isScope = err?.code === 403 || raw.includes("insufficient") || raw.includes("Request had insufficient authentication scopes");
    const reason = isExpired ? "expired" : isScope ? "no_scope" : "error";
    res.json({ connected: false, reason, configured, callbackUrl });
  }
});

/** GET /api/calendar/events — returns { events: [...] } for the next 30 days */
router.get("/calendar/events", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user?.id) { res.status(401).json({ error: "No autenticado" }); return; }

  if (!user.googleCalendarAccessToken) {
    res.status(403).json({ error: "no_token", message: "Google Calendar no está conectado. Conéctalo con el botón 'Conectar Calendar' en Reuniones." });
    return;
  }

  try {
    const auth = getCalendarAuth(user);
    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = (response.data.items || []).map((e) => ({
      id: e.id,
      title: e.summary || "(Sin título)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !e.start?.dateTime,
      meetLink: e.hangoutLink
        || e.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri
        || null,
      location: e.location || null,
      description: e.description || null,
    }));

    res.json({ events });
  } catch (err: any) {
    const isScope = err?.code === 403
      || err?.message?.includes("insufficient")
      || err?.message?.includes("access_denied");
    if (isScope) {
      res.status(403).json({ error: "no_scope", message: "Permiso de Calendar no autorizado. Usa 'Conectar Calendar' en Reuniones para conceder acceso." });
    } else {
      console.error("[Calendar] events error:", err?.message);
      res.status(500).json({ error: err?.message || "Error al obtener eventos" });
    }
  }
});

/** POST /api/calendar/disconnect — clears calendar-specific tokens from the user record */
router.post("/calendar/disconnect", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user?.id) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    await db.update(users)
      .set({
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
      })
      .where(eq(users.id, user.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
