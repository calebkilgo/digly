import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "./email";

// Every marketing email (news, new Vault packs) must carry a one-click
// unsubscribe link and a postal address (CAN-SPAM, PECR/GDPR). Game emails
// like password resets don't need them. Only send marketing to players with
// marketing_opt_in = true.

const secret = () => `digly-unsub:${process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev"}`;
const sign = (pid: string) => createHmac("sha256", secret()).update(pid).digest("base64url").slice(0, 32);

export function unsubscribeUrl(playerId: string) {
  return `${siteUrl()}/api/unsubscribe?u=${encodeURIComponent(playerId)}&t=${sign(playerId)}`;
}

export function checkUnsubscribe(playerId: string, token: string) {
  const want = Buffer.from(sign(playerId));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

export function mailingAddress() {
  return process.env.DIGLY_MAILING_ADDRESS || "";
}

// Append to the text and html of a marketing email.
export function marketingFooter(playerId: string) {
  const url = unsubscribeUrl(playerId);
  const addr = mailingAddress();
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    text: `\n\nYou get this because you opted in to Digly news. Unsubscribe: ${url}${addr ? `\n${addr}` : ""}`,
    html: `<p style="font-size:12px;color:#6b5f86">You get this because you opted in to Digly news. <a href="${url}">Unsubscribe</a>${addr ? `<br>${esc(addr)}` : ""}</p>`,
    // for the List-Unsubscribe and List-Unsubscribe-Post headers (one click in Gmail and Apple Mail)
    headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
