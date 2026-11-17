import { getEngine, handle, playerId } from "@/server/game";
import { grantFromSession, stripe } from "@/server/billing";
import { GameError } from "@/game/service/types";

// GET /api/billing/confirm?session_id=... Called when the player lands back from
// Stripe, so Unlimited shows up right away even if the webhook is a few seconds behind.
export async function GET(req: Request) {
  return handle(async () => {
    const s = stripe();
    const id = new URL(req.url).searchParams.get("session_id") ?? "";
    if (!s || !/^cs_[A-Za-z0-9_]+$/.test(id)) throw new GameError("bad_request", "Bad session");
    const pid = await playerId(false);
    if (!pid) throw new GameError("forbidden", "Log in first.");
    const session = await s.checkout.sessions.retrieve(id);
    // only the buyer can confirm their own purchase
    if ((session.client_reference_id || session.metadata?.player_id) !== pid) throw new GameError("forbidden", "Not your purchase.");
    const granted = await grantFromSession(getEngine().engine.storeRef(), session);
    return { unlimited: granted };
  });
}
