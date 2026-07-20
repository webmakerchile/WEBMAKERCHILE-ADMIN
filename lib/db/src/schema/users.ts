import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  picture: text("picture"),
  role: text("role").notNull().default("admin"),
  /** Collaboration role: 'editor' (default) or 'reviewer' (can approve videos). */
  teamRole: text("team_role").notNull().default("editor"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  tiktokOpenId: text("tiktok_open_id"),
  tiktokAccessToken: text("tiktok_access_token"),
  tiktokRefreshToken: text("tiktok_refresh_token"),
  tiktokTokenExpiresAt: timestamp("tiktok_token_expires_at"),
  linkedinPersonUrn: text("linkedin_person_urn"),
  linkedinOrgUrn: text("linkedin_org_urn"),
  linkedinAccessToken: text("linkedin_access_token"),
  linkedinRefreshToken: text("linkedin_refresh_token"),
  linkedinTokenExpiresAt: timestamp("linkedin_token_expires_at"),
  linkedinName: text("linkedin_name"),
  linkedinPicture: text("linkedin_picture"),
  xUserId: text("x_user_id"),
  xUsername: text("x_username"),
  xAccessToken: text("x_access_token"),
  xRefreshToken: text("x_refresh_token"),
  xTokenExpiresAt: timestamp("x_token_expires_at"),
  facebookPageId: text("facebook_page_id"),
  facebookPageName: text("facebook_page_name"),
  facebookPagePicture: text("facebook_page_picture"),
  facebookPageAccessToken: text("facebook_page_access_token"),
  facebookUserAccessToken: text("facebook_user_access_token"),
  facebookTokenExpiresAt: timestamp("facebook_token_expires_at"),
  /**
   * Comma-separated list of networks whose connection has been observed as
   * revoked by the provider (e.g. 401/invalid_grant on a refresh attempt).
   * Cleared on successful re-auth in the OAuth callback.
   */
  revokedNetworks: text("revoked_networks").notNull().default(""),
  googleCalendarAccessToken: text("google_calendar_access_token"),
  googleCalendarRefreshToken: text("google_calendar_refresh_token"),
  googleCalendarTokenExpiry: timestamp("google_calendar_token_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at").defaultNow().notNull(),
});
