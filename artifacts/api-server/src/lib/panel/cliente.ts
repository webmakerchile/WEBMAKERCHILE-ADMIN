/**
 * Cliente HTTP de la API de integración del panel autoadministrable
 * (www.webmakerlatam.com/admin). Regla de oro del negocio: ESE panel es la
 * única fuente de verdad — este módulo es la única puerta hacia él y vive
 * solo en el servidor (la llave jamás toca el navegador).
 *
 * Reintentos: solo errores transitorios (red, 5xx, y 429 respetando
 * Retry-After). Un 4xx es firme: se propaga como PanelError con el mensaje
 * original del panel para que la ruta lo traduzca sin inventar estados.
 */

const PANEL_BASE = process.env.WEBMAKER_PANEL_URL ?? "https://www.webmakerlatam.com/api/integration/v1";

/** Esperas entre reintentos transitorios (3 reintentos = 4 intentos en total). */
const ESPERAS_MS = [1_000, 3_000, 9_000];

export class PanelError extends Error {
  readonly status: number;
  readonly codigo: string;
  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "PanelError";
    this.status = status;
    this.codigo = codigo;
  }
}

export interface PaginacionPanel {
  limite: number;
  offset: number;
  total: number;
  devueltos: number;
  hayMas: boolean;
  siguiente: string | null;
}

export interface ListadoPanel<T = Record<string, unknown>> {
  ok: boolean;
  recurso: string;
  paginacion: PaginacionPanel;
  datos: T[];
}

type Params = Record<string, string | number | boolean | undefined>;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function llamar<T>(
  metodo: "GET" | "POST" | "PATCH",
  ruta: string,
  opciones: { params?: Params; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const key = process.env.WEBMAKER_PANEL_API_KEY;
  if (!key) {
    throw new PanelError(503, "sin_credencial", "Falta WEBMAKER_PANEL_API_KEY: la conexión con el panel está apagada.");
  }

  const url = new URL(PANEL_BASE + ruta);
  for (const [k, v] of Object.entries(opciones.params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  let ultimo: PanelError | null = null;
  for (let intento = 0; intento < ESPERAS_MS.length + 1; intento++) {
    let res: globalThis.Response;
    try {
      res = await fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(opciones.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
        signal: AbortSignal.timeout(opciones.timeoutMs ?? 30_000),
      });
    } catch (e) {
      // Red caída o timeout: transitorio, reintenta con espera.
      ultimo = new PanelError(502, "panel_inalcanzable", e instanceof Error ? e.message : "No se pudo conectar con el panel");
      if (intento < ESPERAS_MS.length) await dormir(ESPERAS_MS[intento]);
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const cuerpo = (await res.json().catch(() => null)) as { error?: string; mensaje?: string } | null;
    const err = new PanelError(
      res.status,
      cuerpo?.error ?? `http_${res.status}`,
      cuerpo?.mensaje ?? `El panel respondió ${res.status}.`
    );

    if (res.status === 429 && intento < ESPERAS_MS.length) {
      const retry = Number(res.headers.get("retry-after"));
      await dormir(Math.min((Number.isFinite(retry) && retry > 0 ? retry : 5) * 1000, 30_000));
      ultimo = err;
      continue;
    }
    if (res.status >= 500 && intento < ESPERAS_MS.length) {
      await dormir(ESPERAS_MS[intento]);
      ultimo = err;
      continue;
    }
    // 4xx firme (o se agotaron los reintentos de un error HTTP).
    throw err;
  }
  throw ultimo ?? new PanelError(502, "panel_inalcanzable", "No se pudo hablar con el panel tras varios intentos.");
}

export const panelGet = <T>(ruta: string, opciones?: { params?: Params; timeoutMs?: number }) =>
  llamar<T>("GET", ruta, opciones);

export const panelPost = <T>(ruta: string, body: unknown) => llamar<T>("POST", ruta, { body });

export const panelPatch = <T>(ruta: string, body: unknown) => llamar<T>("PATCH", ruta, { body });

/** ¿Hay llave configurada? (permite apagar el sync limpio en entornos sin credencial) */
export const panelConfigurado = (): boolean => Boolean(process.env.WEBMAKER_PANEL_API_KEY);
