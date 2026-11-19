import { attach, type SentryLib } from "@/lib/track";

// Runs in the browser before the app starts. Error reporting and analytics are
// about 250 KB together, more than the game itself, so they load once the page
// is up and the browser is idle instead of holding up the first screen. Both
// stay off until their keys are set, and neither runs in the offline preview.
const live = process.env.NEXT_PUBLIC_DIGLY_BACKEND !== "local";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

let sentry: SentryLib | null = null;

function load() {
  void Promise.all([dsn ? import("@sentry/nextjs") : null, key ? import("posthog-js") : null])
    .then(([S, P]) => {
      if (S && dsn) {
        S.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
          tracesSampleRate: 0.1,
          // WebGL hiccups on old devices aren't actionable
          ignoreErrors: ["WebGL context lost", "ResizeObserver loop"],
        });
        sentry = S;
      }
      const ph = P?.default ?? null;
      if (ph && key) {
        ph.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          person_profiles: "identified_only",
          capture_pageview: true,
          autocapture: false, // only the events in src/lib/track.ts
          disable_session_recording: true,
          respect_dnt: true,
        });
      }
      attach(sentry, ph);
    })
    .catch(() => {
      // blocked by an ad blocker or offline; the game doesn't need them
    });
}

if (live && (dsn || key) && typeof window !== "undefined") {
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(load, { timeout: 4000 }) : setTimeout(load, 1500));
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

export function onRouterTransitionStart(href: string, navigationType: string) {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
