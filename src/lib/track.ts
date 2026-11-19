import type { PostHog } from "posthog-js";

// Types only: the libraries themselves load later (see instrumentation-client.ts).
export type SentryLib = typeof import("@sentry/nextjs");

let ph: PostHog | null = null;
let sentry: SentryLib | null = null;
let sentryReady = false;
// "wait" until analytics is loaded or refused (consent, Global Privacy Control)
let phState: "wait" | "on" | "off" = "wait";
// calls made before the libraries arrive, replayed once they do
const early: (() => void)[] = [];
const earlyPh: (() => void)[] = [];

export function attachSentry(s: SentryLib | null) {
  sentry = s;
  sentryReady = true;
  for (const f of early.splice(0)) f();
}

// null turns analytics off and drops anything waiting
let screenNow: string | null = null;

export function attachAnalytics(p: PostHog | null) {
  ph = p;
  phState = p ? "on" : "off";
  try {
    if (p && screenNow) p.register({ screen: screenNow });
  } catch {}
  const queued = earlyPh.splice(0);
  if (p) for (const f of queued) f();
}

function later(f: () => void) {
  if (sentryReady) f();
  else if (early.length < 50) early.push(f);
}

function laterPh(f: () => void) {
  if (phState === "on") f();
  else if (phState === "wait" && earlyPh.length < 50) earlyPh.push(f);
}

// Usage events. Numbers, modes and prompt slugs only: answer text never leaves the game.
export type TrackEvent =
  | "dig_started"
  | "prompt_suggested"
  | "level_finished"
  | "dig_finished"
  | "start_failed"
  | "account_created"
  | "logged_in"
  | "logged_out"
  | "post_prompt_shown"
  | "board_viewed"
  | "vault_opened"
  | "answers_viewed"
  | "share_clicked"
  | "checkout_started"
  | "purchase_completed"
  | "email_verified"
  | "account_deleted"
  | "screen_viewed"
  | "level_quit";

export function track(event: TrackEvent, props?: Record<string, string | number | boolean | null>) {
  laterPh(() => {
    try {
      if (ph?.__loaded) ph.capture(event, props);
    } catch {
      // tracking must never break the game
    }
  });
}

// Rides along on every later event, including the automatic $pageleave, so
// "where did they leave" is the screen they were on.
export function setScreen(screen: string) {
  screenNow = screen;
  laterPh(() => {
    try {
      if (ph?.__loaded) ph.register({ screen });
    } catch {}
  });
}

let known: string | null = null;

// id is the account's player id (never reused, so deleting it is clean)
export function identify(id: string | null, username?: string | null) {
  const prev = known;
  known = id;
  laterPh(() => {
    try {
      if (!ph?.__loaded) return;
      if (id) ph.identify(id, username ? { username } : undefined);
      // only a real log out starts a fresh id; a guest's page load keeps theirs
      else if (prev) ph.reset();
    } catch {}
  });
  later(() => {
    try {
      sentry?.setUser(username ? { username } : null);
    } catch {}
  });
}

// challenge ids are `${day}:${level}:${slug}`
export const promptSlug = (challengeId: string) => challengeId.split(":").slice(2).join(":");

export function reportError(e: unknown, where: string) {
  later(() => sentry?.captureException(e, { tags: { where } }));
}
