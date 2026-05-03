import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) {
    console.log("[Sentry] SENTRY_DSN not set, error monitoring disabled");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] || "development",
    release: process.env["SENTRY_RELEASE"] || process.env["REPLIT_DEPLOYMENT_ID"],
    tracesSampleRate: 0.1,
  });
  initialized = true;
  console.log("[Sentry] Initialized");
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export { Sentry };
