import crypto from "crypto";
import { db } from "@workspace/db";
import { platformCredentials } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ALGORITHM = "aes-256-gcm";

export const KNOWN_CREDENTIAL_KEYS = [
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_USER_ID",
  "INSTAGRAM_APP_SECRET",
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
] as const;

export type CredentialKey = (typeof KNOWN_CREDENTIAL_KEYS)[number];

function getEncryptionKey(): Buffer {
  const raw = (process.env.CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  if (raw.length >= 16) {
    return crypto.createHash("sha256").update(raw).digest();
  }
  return crypto
    .createHash("sha256")
    .update("webmaker-latam-cred-key-fallback")
    .digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const [ivB64, authTagB64, cipherB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(cipherB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

const cache = new Map<string, { value: string; ts: number }>();
const CACHE_TTL_MS = 60_000;

export async function getCredential(key: string): Promise<string> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const [row] = await db
      .select()
      .from(platformCredentials)
      .where(eq(platformCredentials.key, key))
      .limit(1);
    if (row) {
      const value = decrypt(row.encryptedValue);
      cache.set(key, { value, ts: Date.now() });
      return value;
    }
  } catch (err: any) {
    console.error(`[Credentials] Error reading ${key}:`, err?.message);
  }
  return (process.env[key] || "").trim();
}

export async function setCredential(
  key: string,
  value: string,
  updatedBy?: string,
): Promise<void> {
  if (!(KNOWN_CREDENTIAL_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown credential key: ${key}`);
  }
  const encrypted = encrypt(value);
  await db
    .insert(platformCredentials)
    .values({ key, encryptedValue: encrypted, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: platformCredentials.key,
      set: {
        encryptedValue: encrypted,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      },
    });
  cache.set(key, { value, ts: Date.now() });
}

export async function deleteCredential(key: string): Promise<void> {
  await db
    .delete(platformCredentials)
    .where(eq(platformCredentials.key, key));
  cache.delete(key);
}

export type CredentialStatus = {
  key: string;
  hasValue: boolean;
  isFromDb: boolean;
  source: "db" | "env" | "none";
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function listCredentialStatuses(): Promise<CredentialStatus[]> {
  const rows = await db
    .select({
      key: platformCredentials.key,
      updatedAt: platformCredentials.updatedAt,
      updatedBy: platformCredentials.updatedBy,
    })
    .from(platformCredentials);

  const dbMap = new Map(rows.map((r) => [r.key, r]));

  return KNOWN_CREDENTIAL_KEYS.map((key) => {
    const row = dbMap.get(key);
    const hasEnv = !!(process.env[key] || "").trim();
    const isFromDb = !!row;
    const hasValue = isFromDb || hasEnv;
    return {
      key,
      hasValue,
      isFromDb,
      source: isFromDb ? "db" : hasEnv ? "env" : "none",
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}
