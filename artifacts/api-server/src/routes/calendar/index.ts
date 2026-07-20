import { Router, type IRouter, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getOAuth2Client(user: any) {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  oauth2Client.on("tokens", async (tokens) => {
    try {
      const updateData: Record<string, any> = {};
      if (tokens.access_token) updateData.googleAccessToken = tokens.access_token;
      if (tokens.refresh_token) updateData.googleRefreshToken = tokens.refresh_token;
      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, user.id));
      }
    } catch { /* ignore */ }
  });
  return oauth2Client;
}

router.get("/calendar/status", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user?.id) { res.status(401).json({ error: "No autenticado" }); return; }

  if (user.calendarEnabled === "false") {
    res.json({ connected: false, reason: "disabled" });
    return;
  }

  if (!user.googleAccessToken) {
    res.json({ connected: false, reason: "no_token" });
    return;
  }

  try {
    const auth = getOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.calendarList.list({ maxResults: 1 });
    res.json({ connected: true });
  } catch (err: any) {
    const reason = err?.code === 403 || err?.message?.includes("insufficient") ? "no_scope" : "error";
    res.json({ connected: false, reason });
  }
});

router.get("/calendar/events", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user?.id) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!user.googleAccessToken) {
    res.status(403).json({ error: "no_token", message: "No hay token de Google conectado" });
    return;
  }

  try {
    const auth = getOAuth2Client(user);
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
      meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri || null,
      location: e.location || null,
      description: e.description || null,
    }));

    res.json({ events });
  } catch (err: any) {
    if (err?.code === 403 || err?.message?.includes("insufficient") || err?.message?.includes("access_denied")) {
      res.status(403).json({ error: "no_scope", message: "Permiso de Calendar no autorizado. Vuelve a iniciar sesión." });
    } else {
      console.error("[Calendar] events error:", err?.message);
      res.status(500).json({ error: err?.message || "Error al obtener eventos" });
    }
  }
});

router.post("/calendar/disconnect", async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user?.id) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    await db.update(users).set({ calendarEnabled: "false" }).where(eq(users.id, user.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
