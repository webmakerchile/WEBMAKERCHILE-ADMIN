import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env["VITE_SENTRY_DSN"];
  if (!dsn) {
    console.log("[Sentry] VITE_SENTRY_DSN not set, error monitoring disabled");
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
  initialized = true;
}

export { Sentry };
