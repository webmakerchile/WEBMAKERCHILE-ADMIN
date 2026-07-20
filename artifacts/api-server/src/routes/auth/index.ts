import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { clearNetworkRevoked } from "../../lib/connections";

const router: IRouter = Router();

const ALLOWED_EMAILS = (process.env.ALLOWED_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getCallbackURL() {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
  return "http://localhost:3000/api/auth/google/callback";
}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: getCallbackURL(),
        accessType: "offline",
        prompt: "consent",
      } as any,
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(null, false, { message: "No se pudo obtener el correo de Google" });
          }

          if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) {
            return done(null, false, { message: "Correo no autorizado" });
          }

          const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.googleId, profile.id))
            .limit(1);

          if (existing) {
            const updateData: Record<string, any> = {
              lastLoginAt: new Date(),
              name: profile.displayName || existing.name,
              picture: profile.photos?.[0]?.value || existing.picture,
              googleAccessToken: accessToken,
            };
            if (refreshToken) {
              updateData.googleRefreshToken = refreshToken;
            }

            await db
              .update(users)
              .set(updateData)
              .where(eq(users.id, existing.id));
            // Fresh Google token → clear any stale YouTube "revoked" flag.
            try { await clearNetworkRevoked(existing.id, "youtube"); } catch {}
            return done(null, { ...existing, ...updateData });
          }

          const [newUser] = await db
            .insert(users)
            .values({
              googleId: profile.id,
              email,
              name: profile.displayName || null,
              picture: profile.photos?.[0]?.value || null,
              googleAccessToken: accessToken,
              googleRefreshToken: refreshToken || null,
            })
            .returning();

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
    done(null, user || null);
  } catch (error) {
    done(error);
  }
});

router.get("/auth/google", passport.authenticate("google", {
  scope: [
    "profile",
    "email",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/drive",
  ],
  accessType: "offline",
  prompt: "consent",
} as any));

router.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=unauthorized" }),
  (_req: Request, res: Response) => {
    res.redirect("/");
  }
);

const TEST_USERNAME = "tiktok_reviewer";
const TEST_PASSWORD = "WebMaker2026!Review";

router.post("/auth/test-login", async (req: Request, res: Response) => {
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
      teamRole: user.teamRole || "editor",
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

export function requireAuthRedirect(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.redirect("/");
}

export { passport };
export default router;
