import { getEngine, handle, limit, playerId, readJson } from "@/server/game";
import { stripe } from "@/server/billing";
import { siteUrl } from "@/server/email";
import { NO_REFUND_LINE, PURCHASE_TERMS_VERSION, UNLIMITED } from "@/game/rules/plans";
import { GameError } from "@/game/service/types";
import Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

// POST /api/billing/checkout -> { url } of a Stripe Checkout page for Digly Unlimited.
// Needs an account, so the purchase has somewhere to live.
export async function POST(req: Request) {
  return handle(async () => {
    // the buyer has to tick the no-refund box first; the version they saw is kept with the purchase
    const body = await readJson(req);
    if (body.agree !== true || body.terms !== PURCHASE_TERMS_VERSION) {
      throw new GameError("bad_request", "Please accept the purchase terms first. Reload the page if you just did.");
    }
    const s = stripe();
    if (!s) throw new GameError("not_open", "Payments aren't set up yet.");
    const pid = await playerId(false);
    const store = getEngine().engine.storeRef();
    // fresh, so a purchase that just landed on another server is seen
    const p = pid ? await store.getPlayer(pid, { fresh: true }) : null;
    if (!p?.username) throw new GameError("forbidden", "Make an account first so Unlimited stays with you.");
    if (p.unlimited) throw new GameError("already_played", "You already have Digly Unlimited.");
    limit(`checkout:${p.id}`, 10, 60 * 60_000);

    const priceId = process.env.STRIPE_PRICE_ID;
    let session;
    try {
      session = await s.checkout.sessions.create({
      mode: "payment",
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: UNLIMITED.currency,
                unit_amount: UNLIMITED.priceCents,
                product_data: { name: UNLIMITED.name, description: "Every past dig in the Vault, replay as often as you like. One-time purchase." },
              },
            },
      ],
      client_reference_id: p.id,
      metadata: { player_id: p.id, product: "unlimited", username: p.username, terms_version: PURCHASE_TERMS_VERSION, terms_accepted_at: String(Date.now()) },
      // shown right above Stripe's pay button
      custom_text: { submit: { message: `${NO_REFUND_LINE} This purchase is for the Digly account "${p.username}".` } },
      payment_intent_data: { metadata: { player_id: p.id, product: "unlimited" } },
      customer_email: p.email ?? undefined,
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/?unlimited=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/?unlimited=cancel`,
      });
    } catch (e) {
      // pass Stripe's own reason through (e.g. account not activated, bad price id)
      console.error("stripe checkout failed", e);
      Sentry.captureException(e);
      const msg = e instanceof Stripe.errors.StripeError ? e.message : "Stripe didn't answer. Try again in a minute.";
      throw new GameError("not_open", `Checkout couldn't start: ${msg}`);
    }
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { url: session.url };
  });
}
