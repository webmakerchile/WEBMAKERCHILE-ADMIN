/**
 * Generic server-to-server forwarder for the webmakerlatam.com "wmc" live
 * passthrough integration.
 *
 * This panel owns NO data for this integration: every call is forwarded
 * as-is (method, sub-path, query, body) to the origin's service API, which
 * stays the sole owner of schema, business logic (IVA, comisiones, cupones,
 * numeración, tokens, email, deadlines) and side effects. We only attach the
 * service key and relay the response back verbatim (status, content-type,
 * body) — we never reinterpret it.
 *
 * `public/*` sub-paths are a special case: they hit the origin's public
 * (keyless) API instead of the keyed service API, because that origin route
 * has no CORS and the browser can't call it directly. No key is attached.
 */

const DEFAULT_SERVICE_BASE_URL = "https://webmakerlatam.com/api/service";
const DEFAULT_PUBLIC_BASE_URL = "https://webmakerlatam.com/api/public";
const TIMEOUT_MS = 15_000;

function serviceBaseUrl(): string {
  return (process.env.WMC_SERVICE_BASE_URL || DEFAULT_SERVICE_BASE_URL).replace(/\/+$/, "");
}

function publicBaseUrl(): string {
  return (process.env.WMC_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
}

export type WmcForwardResult = {
  status: number;
  body: Buffer;
  contentType: string | null;
};

export type WmcForwardInput = {
  method: string;
  /** Path AFTER /api/wmc/, no leading slash, e.g. "proposals/123". */
  subPath: string;
  query: Record<string, unknown>;
  body: unknown;
  hasBody: boolean;
};

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(base: string, subPath: string, query: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) qs.append(key, String(item));
    } else {
      qs.append(key, String(value));
    }
  }
  const search = qs.toString();
  return `${base}/${subPath}${search ? `?${search}` : ""}`;
}

export async function forwardToWmc(input: WmcForwardInput): Promise<WmcForwardResult> {
  const isPublic = input.subPath === "public" || input.subPath.startsWith("public/");
  const url = isPublic
    ? buildUrl(publicBaseUrl(), input.subPath.replace(/^public\/?/, ""), input.query)
    : buildUrl(serviceBaseUrl(), input.subPath, input.query);

  const headers: Record<string, string> = {};
  if (!isPublic) {
    headers["X-Service-Key"] = process.env.WMC_SERVICE_KEY || "";
  }
  let payload: string | undefined;
  if (input.hasBody) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(input.body ?? {});
  }

  const method = input.method.toUpperCase();
  const isRetryableRead = method === "GET";
  const attempt = () => fetchWithTimeout(url, { method, headers, body: payload });

  let res: Response;
  try {
    res = await attempt();
  } catch (firstError) {
    if (!isRetryableRead) throw firstError;
    // Exactly one retry, reads only, network failure only (not on a real
    // non-2xx response from the origin — that already resolved above).
    res = await attempt();
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    status: res.status,
    body: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type"),
  };
}
