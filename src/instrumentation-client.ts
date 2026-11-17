import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

// Runs in the browser before the app starts. Both tools stay off until their
// keys are set, and neither runs in the offline preview build.
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
if (live && key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
    autocapture: false, // only the events in src/lib/track.ts
    disable_session_recording: true,
    respect_dnt: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
