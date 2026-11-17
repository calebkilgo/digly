import "server-only";
import Stripe from "stripe";
import { UNLIMITED } from "@/game/rules/plans";
import type { Store } from "@/game/engine/store";

let client: Stripe | null = null;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return (client ??= new Stripe(key));
}

// Grants Unlimited from a paid Checkout session. Safe to call more than once
// (the webhook and the return-from-Stripe check can both land).
export async function grantFromSession(store: Store, s: Stripe.Checkout.Session) {
  const pid = s.client_reference_id || s.metadata?.player_id;
  if (!pid || s.metadata?.product !== "unlimited" || s.payment_status !== "paid") return false;
  await store.grantUnlimited({
    id: s.id,
    playerId: pid,
    product: "unlimited",
    amount: s.amount_total ?? UNLIMITED.priceCents,
    currency: s.currency ?? UNLIMITED.currency,
    paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
  });
  return true;
}
