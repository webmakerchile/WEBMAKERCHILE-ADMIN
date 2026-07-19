import { Router, type IRouter, type Request, type Response } from "express";
import {
  getCredential,
  setCredential,
  deleteCredential,
  listCredentialStatuses,
  KNOWN_CREDENTIAL_KEYS,
} from "../../lib/credentials";

const router: IRouter = Router();

const CREDENTIAL_LABELS: Record<string, { label: string; network: string; secret: boolean }> = {
  TIKTOK_CLIENT_KEY:          { label: "Client Key",         network: "tiktok",    secret: false },
  TIKTOK_CLIENT_SECRET:       { label: "Client Secret",      network: "tiktok",    secret: true  },
  INSTAGRAM_ACCESS_TOKEN:     { label: "Access Token",       network: "instagram", secret: true  },
  INSTAGRAM_USER_ID:          { label: "User ID",            network: "instagram", secret: false },
  INSTAGRAM_APP_SECRET:       { label: "App Secret",         network: "instagram", secret: true  },
  FACEBOOK_APP_ID:            { label: "App ID",             network: "facebook",  secret: false },
  FACEBOOK_APP_SECRET:        { label: "App Secret",         network: "facebook",  secret: true  },
  FACEBOOK_PAGE_ID:           { label: "Page ID",            network: "facebook",  secret: false },
  FACEBOOK_PAGE_ACCESS_TOKEN: { label: "Page Access Token",  network: "facebook",  secret: true  },
  LINKEDIN_CLIENT_ID:         { label: "Client ID",          network: "linkedin",  secret: false },
  LINKEDIN_CLIENT_SECRET:     { label: "Client Secret",      network: "linkedin",  secret: true  },
  X_CLIENT_ID:                { label: "Client ID",          network: "x",         secret: false },
  X_CLIENT_SECRET:            { label: "Client Secret",      network: "x",         secret: true  },
};

router.get("/credentials", async (_req: Request, res: Response) => {
  const statuses = await listCredentialStatuses();
  const result = statuses.map((s) => ({
    ...s,
    ...CREDENTIAL_LABELS[s.key],
  }));
  res.json(result);
});

router.put("/credentials/:key", async (req: Request, res: Response) => {
  const key = String(req.params.key);
  if (!(KNOWN_CREDENTIAL_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ error: "Clave de credencial no reconocida" });
    return;
  }
  const { value } = req.body;
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "El valor no puede estar vacío" });
    return;
  }
  const email = (req.user as any)?.email ?? "unknown";
  await setCredential(key, value.trim(), email);
  res.json({ ok: true, key });
});

router.delete("/credentials/:key", async (req: Request, res: Response) => {
  const key = String(req.params.key);
  if (!(KNOWN_CREDENTIAL_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ error: "Clave de credencial no reconocida" });
    return;
  }
  await deleteCredential(key);
  res.json({ ok: true, key });
});

router.get("/credentials/:key/verify", async (req: Request, res: Response) => {
  const key = String(req.params.key);
  if (!(KNOWN_CREDENTIAL_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ error: "Clave de credencial no reconocida" });
    return;
  }
  const value = await getCredential(key);
  res.json({ key, hasValue: !!value, length: value.length });
});

export default router;
