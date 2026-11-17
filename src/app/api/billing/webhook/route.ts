import { NextResponse } from "next/server";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { getEngine } from "@/server/game";
import { grantFromSession, stripe } from "@/server/billing";

// POST /api/billing/webhook  (Stripe sends events here; signed with STRIPE_WEBHOOK_SECRET)
// Grants Unlimited when a payment completes, takes it back on a refund or dispute.
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  let event: Stripe.Event;
  try {
    // the signature covers the exact bytes, so read the raw body
    event = s.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const store = getEngine().engine.storeRef();
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await grantFromSession(store, event.data.object);
        break;
      case "charge.refunded": {
        const c = event.data.object;
        const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        if (pi && c.refunded) await store.revokeByPaymentIntent(pi);
        break;
      }
      case "charge.dispute.created": {
        const d = event.data.object;
        const pi = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
        if (pi) await store.revokeByPaymentIntent(pi);
        break;
      }
    }
  } catch (e) {
    // a 500 makes Stripe retry later
    console.error(e);
    Sentry.captureException(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
