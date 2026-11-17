import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

// Runs in the browser before the app starts. The offline preview does not send
// analytics because it has no networked backend.
const live = process.env.NEXT_PUBLIC_DIGLY_BACKEND !== "local";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (live && dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // WebGL hiccups on old devices aren't actionable
    ignoreErrors: ["WebGL context lost", "ResizeObserver loop"],
  });
}

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (live && key && host) {
  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    defaults: "2026-08-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
} else if (live && process.env.NODE_ENV === "development") {
  const missingVariable = key ? "NEXT_PUBLIC_POSTHOG_HOST" : "NEXT_PUBLIC_POSTHOG_KEY";
  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
