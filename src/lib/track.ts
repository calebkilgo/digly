import type { PostHog } from "posthog-js";

// Types only: the libraries themselves load later (see instrumentation-client.ts).
export type SentryLib = typeof import("@sentry/nextjs");

let ph: PostHog | null = null;
let sentry: SentryLib | null = null;
let ready = false;
// calls made before the libraries arrive, replayed once they do
const early: (() => void)[] = [];

export function attach(s: SentryLib | null, p: PostHog | null) {
  sentry = s;
  ph = p;
  ready = true;
  for (const f of early.splice(0)) f();
}

function later(f: () => void) {
  if (ready) f();
  else if (early.length < 50) early.push(f);
}

// Usage events. Numbers and modes only: answer text never leaves the game.
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
  | "purchase_completed";

export function track(event: TrackEvent, props?: Record<string, string | number | boolean | null>) {
  later(() => {
    try {
      if (ph?.__loaded) ph.capture(event, props);
    } catch {
      // tracking must never break the game
    }
  });
}

export function identify(username: string | null) {
  later(() => {
    try {
      if (ph?.__loaded) {
        if (username) ph.identify(username);
        else ph.reset();
      }
      sentry?.setUser(username ? { username } : null);
    } catch {}
  });
}

export function reportError(e: unknown, where: string) {
  later(() => sentry?.captureException(e, { tags: { where } }));
}
