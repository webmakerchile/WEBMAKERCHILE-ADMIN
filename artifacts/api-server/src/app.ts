import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import router from "./routes";
import authRouter, { passport, requireAuth, requireApproved } from "./routes/auth";

const app: Express = express();

app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

import { requestId } from "./lib/request-id";
app.use(requestId);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.set("trust proxy", true);

const PgStore = connectPgSimple(session);

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "SESSION_SECRET no está definida. En producción es obligatoria: define la variable de entorno SESSION_SECRET con un valor aleatorio y seguro antes de arrancar el servidor."
  );
}

app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15,
    }),
    secret: SESSION_SECRET || "webmaker-admin-secret-key-dev-only",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      // Optional: set an explicit cookie domain to prevent proxy ambiguity.
      // Leave unset (undefined) in dev so it defaults to the request host.
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/api", authRouter);

import healthRouter from "./routes/health";
app.use("/api", healthRouter);

import { serveTempVideo } from "./routes/instagram/temp-serve";
app.get("/api/instagram/temp-video/:token", serveTempVideo);

import { aiLimiter, publishLimiter, uploadLimiter } from "./lib/rate-limit";
// Apply rate limits to high-cost endpoints. These run before requireAuth so
// keying falls back to IP for unauth'd callers; once a session is loaded the
// keyGenerator switches to user id automatically.
app.use(/^\/api\/(library\/templates\/ai-fill|content\/videos\/[^/]+\/(generate-descriptions|generate-cover)|content\/videos\/bulk-generate-descriptions|analytics\/insights|content\/hashtag-suggestions|gemini\/conversations\/[^/]+\/messages|gemini\/generate-image|gemini\/generate-cover|studio\/ideas\/(generate|[^/]+\/generate-cover)|community\/(sorprendeme|historias\/(generar|detectar-formato|reintentar)|descripciones\/(generar|calcular-slides|reintentar-slide))|hub\/contracts\/(extract-pdf|extract-from-meeting|ai-chat|brief|ai-extract-project)|hub\/projects\/ai-extract-tasks)/, aiLimiter);
app.use(/^\/api\/(youtube|tiktok|instagram|linkedin|x|facebook)\/(upload|publish|upload-from-drive)/, publishLimiter);
app.use(/^\/api\/(studio\/(upload-chunk|upload-video|temp-preview|finalize-upload)|content\/videos\/import-csv|content\/videos\/[^/]+\/(upload-video|link-drive-video)|transcriber\/transcribe)/, uploadLimiter);

// requireApproved runs after requireAuth so pending/rejected accounts only keep
// access to /api/auth/* (mounted above) and public health checks.
app.use("/api", requireAuth, requireApproved, router);

import { Sentry, isSentryEnabled } from "./lib/sentry";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (res.headersSent) return next(err);
    const isFileTooLarge = err.code === "LIMIT_FILE_SIZE";
    res.status(isFileTooLarge ? 413 : 400).json({
      error: isFileTooLarge ? "El archivo supera el tamaño máximo permitido" : err.message,
    });
    return;
  }
  const status = err.status ?? 500;
  if (status >= 500 && isSentryEnabled()) {
    const user = req.user as { id?: string | number } | undefined;
    Sentry.withScope((scope) => {
      scope.setTag("route", req.path);
      scope.setTag("method", req.method);
      if (req.requestId) scope.setTag("request_id", req.requestId);
      if (user?.id !== undefined) scope.setUser({ id: String(user.id) });
      Sentry.captureException(err);
    });
  }
  if (res.headersSent) return next(err);
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(process.cwd(), "artifacts", "admin-panel", "dist", "public");
  app.use(express.static(frontendDist));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
