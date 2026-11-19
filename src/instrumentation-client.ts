import { attachAnalytics, attachSentry, type SentryLib } from "@/lib/track";
import { CONSENT_EVENT, analyticsAllowed, type Choice } from "@/lib/consent";

// Runs in the browser before the app starts. Error reporting and analytics are
// about 250 KB together, more than the game itself, so they load once the page
// is up and the browser is idle instead of holding up the first screen. Both
// stay off until their keys are set, and neither runs in the offline preview.
const live = process.env.NEXT_PUBLIC_DIGLY_BACKEND !== "local";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

let sentry: SentryLib | null = null;

function loadSentry() {
  if (!dsn) return attachSentry(null);
  void import("@sentry/nextjs")
    .then((S) => {
      S.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        // WebGL hiccups on old devices aren't actionable
        ignoreErrors: ["WebGL context lost", "ResizeObserver loop"],
      });
      sentry = S;
      attachSentry(S);
    })
    .catch(() => attachSentry(null)); // blocked by an ad blocker or offline; the game doesn't need it
}

// Analytics waits for consent where the law asks for it (see src/lib/consent.ts)
async function loadAnalytics() {
  if (!key) return attachAnalytics(null);
  if (!(await analyticsAllowed())) {
    attachAnalytics(null);
    // a later yes from Options starts it without a reload
    const f = (e: Event) => {
      if ((e as CustomEvent<Choice>).detail !== "yes") return;
      window.removeEventListener(CONSENT_EVENT, f);
      void loadAnalytics();
    };
    window.addEventListener(CONSENT_EVENT, f);
    return;
  }
  try {
    const ph = (await import("posthog-js")).default;
    ph.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false, // only the events in src/lib/track.ts
      disable_session_recording: true,
      respect_dnt: true,
    });
    attachAnalytics(ph);
    // turned off or back on later from Options
    window.addEventListener(CONSENT_EVENT, (e) => {
      if ((e as CustomEvent<Choice>).detail === "no") ph.opt_out_capturing();
      else ph.opt_in_capturing();
    });
  } catch {
    attachAnalytics(null);
  }
}

function load() {
  loadSentry();
  void loadAnalytics();
}

if (live && (dsn || key) && typeof window !== "undefined") {
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(load, { timeout: 4000 }) : setTimeout(load, 1500));
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

export function onRouterTransitionStart(href: string, navigationType: string) {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
