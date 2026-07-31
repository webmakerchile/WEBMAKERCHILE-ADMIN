import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { normalizeRole } from "@workspace/roles";
import { clearNetworkRevoked } from "../../lib/connections";
import { createNotification } from "../../lib/notifications";

const router: IRouter = Router();

const ALLOWED_EMAILS = (process.env.ALLOWED_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getCallbackURL() {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
  return "http://localhost:3001/api/auth/google/callback";
}

function getYouTubeCallbackURL() {
  if (process.env.GOOGLE_YOUTUBE_CALLBACK_URL) return process.env.GOOGLE_YOUTUBE_CALLBACK_URL;
  const base = getCallbackURL().replace("/auth/google/callback", "");
  return `${base}/auth/youtube/callback`;
}

export function getCalendarCallbackURL() {
  if (process.env.GOOGLE_CALENDAR_CALLBACK_URL) return process.env.GOOGLE_CALENDAR_CALLBACK_URL;
  const base = getCallbackURL().replace("/auth/google/callback", "");
  return `${base}/auth/google-calendar/callback`;
}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: getCallbackURL(),
      } as any,
      async (accessToken: string, _refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(null, false, { message: "No se pudo obtener el correo de Google" });
          }

          const isAutoApproved = ALLOWED_EMAILS.length > 0 && ALLOWED_EMAILS.includes(email);
          // First email in the allowlist is the super-admin
          const isSuperAdmin = ALLOWED_EMAILS[0] === email;

          const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.googleId, profile.id))
            .limit(1);

          if (existing) {
            // If rejected, deny immediately
            if (existing.approvalStatus === "rejected") {
              return done(null, false, { message: "Acceso rechazado" });
            }

            // Auto-approve if email is in the allowlist
            const updateData: Record<string, any> = {
              lastLoginAt: new Date(),
              // Preserva el nombre personalizado (renombrado desde el panel);
              // solo usa el de Google si el usuario aún no tiene nombre.
              name: existing.name || profile.displayName || null,
              picture: profile.photos?.[0]?.value || existing.picture,
            };
            if (isAutoApproved && existing.approvalStatus !== "approved") {
              updateData.approvalStatus = "approved";
            }
            if (isSuperAdmin && existing.role !== "superadmin") {
              updateData.role = "superadmin";
            }

            await db
              .update(users)
              .set(updateData)
              .where(eq(users.id, existing.id));

            const updatedUser = { ...existing, ...updateData };

            // Pending users: log in but flag as pending so frontend shows waiting screen
            return done(null, updatedUser);
          }

          // New user: auto-approve if in allowlist, otherwise pending
          const [newUser] = await db
            .insert(users)
            .values({
              googleId: profile.id,
              email,
              name: profile.displayName || null,
              picture: profile.photos?.[0]?.value || null,
              role: isSuperAdmin ? "superadmin" : "admin",
              approvalStatus: isAutoApproved ? "approved" : "pending",
              googleAccessToken: null,
              googleRefreshToken: null,
              googleCalendarAccessToken: null,
              googleCalendarRefreshToken: null,
            })
            .returning();

          // Notify the super-admin so the pending request doesn't sit unnoticed.
          if (newUser && newUser.approvalStatus === "pending") {
            try {
              const [superAdmin] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.role, "superadmin"))
                .limit(1);
              if (superAdmin) {
                await createNotification({
                  userId: superAdmin.id,
                  type: "system",
                  title: "Nuevo usuario pendiente de aprobación",
                  body: `${email} solicitó acceso al panel. Revisa Ajustes para aprobarlo o rechazarlo.`,
                  link: "/ajustes",
                });
              }
            } catch (notifyErr: any) {
              console.error("[Auth] No se pudo notificar al super-admin:", notifyErr?.message || notifyErr);
            }
          }

          return done(null, newUser);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    // A rejected user must not keep an operative session: treat as logged out.
    if (user && user.approvalStatus === "rejected") {
      done(null, false);
      return;
    }
    done(null, user || null);
  } catch (error) {
    done(error);
  }
});

router.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"],
  prompt: "select_account",
} as any));

router.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=unauthorized" }),
  (_req: Request, res: Response) => {
    res.redirect("/");
  }
);

router.get("/auth/youtube", requireAuth, requireApproved, async (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: "Google OAuth no configurado" });
    return;
  }

  const csrfState = crypto.randomBytes(16).toString("hex");
  (req.session as any).youtubeCsrf = csrfState;

  await new Promise<void>((resolve) => req.session.save(resolve));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getYouTubeCallbackURL(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: csrfState,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/**
 * Conectar SOLO Google Drive.
 *
 * El scope de Drive se obtenía únicamente por `/auth/youtube`, cuyo botón vive
 * en `/cuentas` — una página a la que ventas no tiene acceso. Resultado: el
 * ejecutivo comercial nunca ha tenido tokens de Drive, y por eso adjuntar,
 * subir la cotización y ver el explorador fallaban siempre con 409.
 *
 * Va aparte de `/auth/youtube` porque pedirle a un comercial permiso para
 * SUBIR VIDEOS A YOUTUBE, solo para que pueda adjuntar un PDF, es
 * desproporcionado y además asusta en la pantalla de consentimiento.
 *
 * Reutiliza a propósito el redirect_uri de YouTube: ya está registrado en la
 * consola de Google, así que esto funciona sin tocar nada allí. Un
 * redirect_uri nuevo sin registrar daría "redirect_uri_mismatch".
 */
router.get("/auth/drive", requireAuth, requireApproved, async (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: "Google OAuth no configurado" });
    return;
  }
  const csrfState = crypto.randomBytes(16).toString("hex");
  (req.session as any).youtubeCsrf = csrfState;
  // Volver a la página desde la que se pidió, no siempre a /cuentas: quien
  // pulsa esto desde el panel ejecutivo no tiene acceso a /cuentas.
  (req.session as any).googleReturnTo = destinoSeguro(req.query.from);
  await new Promise<void>((resolve) => req.session.save(resolve));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getYouTubeCallbackURL(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent",
    state: csrfState,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/**
 * A dónde volver tras conectar. Lista blanca: un `from` libre en la URL sería
 * un redirect abierto hacia cualquier sitio.
 */
export const DESTINOS_CONEXION = ["/cuentas", "/ejecutivo", "/mis-tareas", "/videos", "/drive"] as const;
export function destinoSeguro(from: unknown): string {
  const v = typeof from === "string" ? (from.startsWith("/") ? from : `/${from}`) : "";
  return (DESTINOS_CONEXION as readonly string[]).includes(v) ? v : "/cuentas";
}

router.get("/auth/youtube/callback", requireAuth, requireApproved, async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const user = req.user as any;
  const volverA = (req.session as any).googleReturnTo || "/cuentas";
  delete (req.session as any).googleReturnTo;

  if (error) {
    console.error("[YouTube connect] OAuth error:", error);
    res.redirect(`${volverA}?youtube=error&msg=access_denied`);
    return;
  }

  const storedState = (req.session as any).youtubeCsrf;
  delete (req.session as any).youtubeCsrf;

  if (!storedState || state !== storedState) {
    console.error("[YouTube connect] CSRF state mismatch");
    res.redirect(`${volverA}?youtube=error&msg=csrf_mismatch`);
    return;
  }

  if (!code) {
    res.redirect(`${volverA}?youtube=error&msg=no_code`);
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: getYouTubeCallbackURL(),
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenData.access_token) {
      console.error("[YouTube connect] No access token in response:", JSON.stringify(tokenData));
      res.redirect(`${volverA}?youtube=error&msg=token_failed`);
      return;
    }

    const updateData: Record<string, string | null> = {
      googleAccessToken: tokenData.access_token,
      googleCalendarAccessToken: tokenData.access_token,
    };
    if (tokenData.refresh_token) {
      updateData.googleRefreshToken = tokenData.refresh_token;
      updateData.googleCalendarRefreshToken = tokenData.refresh_token;
    }

    await db.update(users).set(updateData).where(eq(users.id, user.id));

    try { await clearNetworkRevoked(user.id, "youtube"); } catch {}

    console.log("[YouTube connect] Tokens stored for user", user.id);
    res.redirect(`${volverA}?drive=connected`);
  } catch (err: any) {
    console.error("[YouTube connect] Error:", err.message);
    res.redirect(`${volverA}?youtube=error&msg=server_error`);
  }
});

router.get("/auth/google-calendar", requireAuth, requireApproved, async (req: Request, res: Response) => {
  // Volver a la página desde donde se inició la conexión (Reuniones por defecto).
  const returnTo = req.query.from === "cuentas" ? "/cuentas" : "/ejecutivo";

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    // Navegación de enlace: redirigir con el motivo visible en vez de responder JSON.
    res.redirect(`${returnTo}?calendar=error&msg=not_configured`);
    return;
  }

  const csrfState = crypto.randomBytes(16).toString("hex");
  (req.session as any).calendarCsrf = csrfState;
  (req.session as any).calendarReturnTo = returnTo;
  await new Promise<void>((resolve) => req.session.save(resolve));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getCalendarCallbackURL(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
    state: csrfState,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/auth/google-calendar/callback", requireAuth, requireApproved, async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const user = req.user as any;

  const returnTo = (req.session as any).calendarReturnTo === "/cuentas" ? "/cuentas" : "/ejecutivo";
  delete (req.session as any).calendarReturnTo;

  if (error) {
    console.error("[Calendar connect] OAuth error:", error);
    const msg = error === "access_denied" ? "access_denied" : "oauth_error";
    res.redirect(`${returnTo}?calendar=error&msg=${msg}&detail=${encodeURIComponent(String(error))}`);
    return;
  }

  const storedState = (req.session as any).calendarCsrf;
  delete (req.session as any).calendarCsrf;

  if (!storedState || state !== storedState) {
    console.error("[Calendar connect] CSRF state mismatch");
    res.redirect(`${returnTo}?calendar=error&msg=csrf_mismatch`);
    return;
  }

  if (!code) {
    res.redirect(`${returnTo}?calendar=error&msg=no_code`);
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: getCalendarCallbackURL(),
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenData.access_token) {
      console.error("[Calendar connect] No access token:", JSON.stringify(tokenData));
      const detail = typeof tokenData.error === "string" ? `&detail=${encodeURIComponent(tokenData.error)}` : "";
      res.redirect(`${returnTo}?calendar=error&msg=token_failed${detail}`);
      return;
    }

    const updateData: Record<string, string | null | Date> = {
      googleCalendarAccessToken: tokenData.access_token,
    };
    if (tokenData.refresh_token) {
      updateData.googleCalendarRefreshToken = tokenData.refresh_token;
    }
    if (tokenData.expiry_date) {
      updateData.googleCalendarTokenExpiry = new Date(tokenData.expiry_date);
    } else if (tokenData.expires_in) {
      updateData.googleCalendarTokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    }

    await db.update(users).set(updateData).where(eq(users.id, user.id));

    console.log("[Calendar connect] Tokens stored for user", user.id);
    res.redirect(`${returnTo}?calendar=connected`);
  } catch (err: any) {
    console.error("[Calendar connect] Error:", err.message);
    res.redirect(`${returnTo}?calendar=error&msg=server_error`);
  }
});

const TEST_USERNAME = "tiktok_reviewer";
const TEST_PASSWORD = "WebMaker2026!Review";

router.post("/auth/test-login", async (req: Request, res: Response) => {
  // Cuenta de prueba para revisores: deshabilitada en producción salvo opt-in explícito.
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_LOGIN !== "1") {
    res.status(404).json({ error: "No disponible" });
    return;
  }
  try {
    const { username, password } = req.body || {};
    if (username !== TEST_USERNAME || password !== TEST_PASSWORD) {
      res.status(401).json({ error: "Credenciales incorrectas" });
      return;
    }

    const testGoogleId = "test-reviewer-account";
    const testEmail = "reviewer@webmakerchile.com";

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.googleId, testGoogleId))
      .limit(1);

    let testUser;
    if (existing) {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, existing.id));
      testUser = { ...existing, lastLoginAt: new Date() };
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          googleId: testGoogleId,
          email: testEmail,
          name: "TikTok Reviewer",
          picture: null,
          role: "admin",
          approvalStatus: "approved",
          googleAccessToken: null,
          googleRefreshToken: null,
        })
        .returning();
      testUser = newUser;
    }

    req.login(testUser, (err) => {
      if (err) {
        res.status(500).json({ error: "Error al iniciar sesión" });
        return;
      }
      res.json({ success: true, user: { id: testUser.id, email: testEmail, name: "TikTok Reviewer" } });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/auth/me", (req: Request, res: Response) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const user = req.user as any;
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
      // Rol normalizado: mapea los roles antiguos y garantiza que el
      // superadministrador siempre entre como CEO (nunca se queda fuera).
      teamRole: normalizeRole(user.teamRole, user.role === "superadmin"),
      approvalStatus: user.approvalStatus || "approved",
      hasYoutubeAccess: !!(user.googleAccessToken && user.googleRefreshToken),
    });
  } else {
    res.status(401).json({ error: "No autenticado" });
  }
});

router.post("/auth/logout", (req: Request, res: Response) => {
  req.logout(() => {
    req.session?.destroy(() => {
      res.json({ success: true });
    });
  });
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "No autenticado" });
}

/**
 * Enforce approval server-side: a pending/rejected user must not have API
 * access beyond /api/auth/*. Mount AFTER requireAuth. Superadmin always passes.
 */
export function requireApproved(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { role?: string; approvalStatus?: string } | undefined;
  if (user?.role === "superadmin") {
    return next();
  }
  const status = user?.approvalStatus || "approved";
  if (status === "approved") {
    return next();
  }
  if (status === "rejected") {
    res.status(403).json({ error: "Acceso denegado: tu cuenta fue rechazada" });
    return;
  }
  res.status(403).json({ error: "Tu cuenta está pendiente de aprobación" });
}

export { passport };
export default router;
