import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { Store } from "@/game/engine/store";
import { newToken, tokenHash } from "./auth";
import { sendEmail, siteUrl, verifyEmail } from "./email";

const VERIFY_TTL_MS = 3 * 86_400_000;

// Emails a one-time link that confirms the address. Never throws: a missing
// email service or database update must not stop a sign-up.
export async function sendVerification(store: Store, playerId: string, username: string, email: string) {
  try {
    const token = newToken();
    await store.createEmailVerification(tokenHash(token), playerId, email, Date.now() + VERIFY_TTL_MS);
    const { text, html } = verifyEmail(username, `${siteUrl()}/?verify=${token}`);
    return await sendEmail(email, "Confirm your Digly email", text, html);
  } catch (e) {
    console.error(e);
    Sentry.captureException(e);
    return false;
  }
}
