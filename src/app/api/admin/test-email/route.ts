import { getEngine, handle, limit, requireAdminPlayer, requireSameOrigin } from "@/server/game";
import { sendEmail, siteUrl } from "@/server/email";
import { GameError } from "@/game/service/types";

// POST /api/admin/test-email -> sends a test email to the admin's own address
// and reports exactly what Resend said, so a broken email setup shows up here
// instead of as silently missing reset links.
export async function POST(req: Request) {
  return handle(async () => {
    await requireSameOrigin(req);
    const me = await requireAdminPlayer();
    limit(`test-email:${me.id}`, 5, 60 * 60_000);
    const p = await getEngine().engine.storeRef().getPlayer(me.id, { fresh: true });
    if (!p?.email) throw new GameError("bad_request", "Add an email to your account first (Options).");
    const from = process.env.EMAIL_FROM || "Digly <onboarding@resend.dev> (default; only reaches the Resend account owner)";
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    try {
      const sent = await sendEmail(
        p.email,
        "Digly test email",
        `This is a test from the Digly admin panel. Email is working.\n\nSent from: ${from}\nLinks point at: ${siteUrl()}`,
        `<p>This is a test from the Digly admin panel. Email is working.</p><p style="color:#6b5f86;font-size:13px">Sent from: ${esc(from)}<br>Links point at: ${esc(siteUrl())}</p>`,
      );
      if (!sent) return { ok: false, to: p.email, detail: "RESEND_API_KEY isn't set for this deployment, so nothing was sent." };
      return { ok: true, to: p.email, detail: `Sent from ${from}. Links in emails point at ${siteUrl()}.` };
    } catch (e) {
      return { ok: false, to: p.email, detail: e instanceof Error ? e.message : String(e) };
    }
  });
}
