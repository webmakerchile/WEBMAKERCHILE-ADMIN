import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env["VITE_SENTRY_DSN"];
  if (!dsn) {
    console.log("[Sentry] VITE_SENTRY_DSN not set, error monitoring disabled");
    return;
  }
  const release = import.meta.env["VITE_SENTRY_RELEASE"] || import.meta.env["VITE_APP_VERSION"];
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: release || undefined,
    tracesSampleRate: 0.1,
  });
  initialized = true;
  installFetchInterceptor();
  installUnhandledRejectionHandler();
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export function setSentryUser(user: { id?: string | number; email?: string } | null): void {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id !== undefined ? String(user.id) : undefined,
    email: user.email,
  });
}

export function setSentryRoute(path: string): void {
  if (!initialized) return;
  Sentry.getCurrentScope().setTag("route", path);
}

let lastRequestId: string | null = null;
export function getLastRequestId(): string | null {
  return lastRequestId;
}

function installFetchInterceptor(): void {
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    const rid = res.headers.get("X-Request-Id");
    if (rid) {
      lastRequestId = rid;
      Sentry.getCurrentScope().setTag("request_id", rid);
    }
    return res;
  };
}

function installUnhandledRejectionHandler(): void {
  window.addEventListener("unhandledrejection", (event) => {
    Sentry.captureException(event.reason ?? new Error("Unhandled rejection"));
  });
}

export { Sentry };
