import "server-only";

// The site's public address, for links in emails. Never taken from the
// request, so a forged Host header can't redirect reset links.
export function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

// Sends through Resend's HTTP API (resend.com). Without RESEND_API_KEY it
// logs instead, which is fine on your laptop.
export async function sendEmail(to: string, subject: string, text: string, html: string, headers?: Record<string, string>) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Digly <onboarding@resend.dev>";
  if (!key) {
    console.warn(`digly: RESEND_API_KEY not set, email to ${to} not sent:\n${subject}\n${text}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html, ...(headers ? { headers } : {}) }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text().catch(() => "")}`);
  return true;
}

export function resetEmail(username: string, link: string) {
  const text = `Hi ${username},

Someone asked to reset the password for your Digly account. If it was you, open this link within an hour to pick a new one:

${link}

If it wasn't you, ignore this email. Your password stays the same.

Dig deep.
Digly`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1b1030">
<h1 style="font-size:22px;margin:0 0 16px">Reset your Digly password</h1>
<p>Hi ${username},</p>
<p>Someone asked to reset the password for your Digly account. If it was you, use this button within an hour:</p>
<p style="margin:24px 0"><a href="${link}" style="background:#ffc928;color:#1b1030;padding:12px 20px;border:3px solid #1b1030;border-radius:6px;font-weight:700;text-decoration:none">Pick a new password</a></p>
<p style="font-size:13px;color:#6b5f86">If the button doesn't work, paste this into your browser:<br>${link}</p>
<p style="font-size:13px;color:#6b5f86">If it wasn't you, ignore this email. Your password stays the same.</p>
</div>`;
  return { text, html };
}

export function verifyEmail(username: string, link: string) {
  const text = `Hi ${username},

Confirm this is your email for your Digly account by opening this link within 3 days:

${link}

This is how we know password resets reach you. If you didn't make a Digly account, ignore this email.

Dig deep.
Digly`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1b1030">
<h1 style="font-size:22px;margin:0 0 16px">Confirm your email</h1>
<p>Hi ${username},</p>
<p>Confirm this is your email for your Digly account. It's how we know password resets reach you.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#ffc928;color:#1b1030;padding:12px 20px;border:3px solid #1b1030;border-radius:6px;font-weight:700;text-decoration:none">Confirm my email</a></p>
<p style="font-size:13px;color:#6b5f86">If the button doesn't work, paste this into your browser:<br>${link}</p>
<p style="font-size:13px;color:#6b5f86">If you didn't make a Digly account, ignore this email.</p>
</div>`;
  return { text, html };
}
