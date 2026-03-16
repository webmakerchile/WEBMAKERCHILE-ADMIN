import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  picture: text("picture"),
  role: text("role").notNull().default("admin"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  tiktokOpenId: text("tiktok_open_id"),
  tiktokAccessToken: text("tiktok_access_token"),
  tiktokRefreshToken: text("tiktok_refresh_token"),
  tiktokTokenExpiresAt: timestamp("tiktok_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at").defaultNow().notNull(),
});
