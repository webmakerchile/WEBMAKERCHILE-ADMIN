import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import router from "./routes";
import authRouter, { passport, requireAuth } from "./routes/auth";

const app: Express = express();

app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.set("trust proxy", 1);

const PgStore = connectPgSimple(session);

app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15,
    }),
    secret: process.env.SESSION_SECRET || "webmaker-admin-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
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

app.use("/api", requireAuth, router);

export default app;
