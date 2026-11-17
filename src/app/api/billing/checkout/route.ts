import { getEngine, handle, limit, playerId } from "@/server/game";
import { stripe } from "@/server/billing";
import { siteUrl } from "@/server/email";
import { UNLIMITED } from "@/game/rules/plans";
import { GameError } from "@/game/service/types";

// POST /api/billing/checkout -> { url } of a Stripe Checkout page for Digly Unlimited.
// Needs an account, so the purchase has somewhere to live.
export async function POST() {
  return handle(async () => {
    const s = stripe();
    if (!s) throw new GameError("not_open", "Payments aren't set up yet.");
    const pid = await playerId(false);
    const store = getEngine().engine.storeRef();
    const p = pid ? await store.getPlayer(pid) : null;
    if (!p?.username) throw new GameError("forbidden", "Make an account first so Unlimited stays with you.");
    if (p.unlimited) throw new GameError("already_played", "You already have Digly Unlimited.");
    limit(`checkout:${p.id}`, 10, 60 * 60_000);

    const priceId = process.env.STRIPE_PRICE_ID;
    const session = await s.checkout.sessions.create({
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
      metadata: { player_id: p.id, product: "unlimited", username: p.username },
      payment_intent_data: { metadata: { player_id: p.id, product: "unlimited" } },
      customer_email: p.email ?? undefined,
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/?unlimited=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/?unlimited=cancel`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { url: session.url };
  });
}
