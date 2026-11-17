import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";

// Usage events. Numbers and modes only: answer text never leaves the game.
export type TrackEvent =
  | "dig_started"
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
  | "share_clicked";

export function track(event: TrackEvent, props?: Record<string, string | number | boolean | null>) {
  try {
    if (posthog.__loaded) posthog.capture(event, props);
  } catch {
    // tracking must never break the game
  }
}

export function identify(playerId: string, username: string | null = null) {
  try {
    if (posthog.__loaded) posthog.identify(playerId, username ? { username } : undefined);
  } catch {}
  Sentry.setUser({ id: playerId, username: username ?? undefined });
}

export function resetIdentity() {
  try {
    if (posthog.__loaded) posthog.reset();
  } catch {}
  Sentry.setUser(null);
}

export function reportError(e: unknown, where: string) {
  Sentry.captureException(e, { tags: { where } });
}
