import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "./email";

// Sign in with Google (OAuth 2.0 authorization code flow with PKCE). Set
// GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel; without them the button
// stays hidden. Google must list `${SITE_URL}/api/auth/google/callback` as an
// authorized redirect URI.

// Dev and tests only: pretends to be Google so the whole flow can be tried
// without credentials. Never on in production.
export const fakeGoogle = () => process.env.NODE_ENV !== "production" && process.env.DIGLY_FAKE_GOOGLE === "1";

export const OAUTH_COOKIE = "digly_goauth";
export const OAUTH_PATH = "/api/auth/google";
export const PENDING_COOKIE = "digly_gpending";

export function googleEnabled() {
  return fakeGoogle() || (!!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return `${siteUrl()}/api/auth/google/callback`;
}

const b64url = (b: Buffer) => b.toString("base64url");

export function pkceChallenge(verifier: string) {
  return b64url(createHash("sha256").update(verifier).digest());
}

export function authUrl(state: string, verifier: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export interface GoogleUser {
  sub: string; // Google's permanent id for the person
  email: string | null; // only when Google has verified it
}

// Swaps the one-time code for the person's id token. The token comes straight
// from Google over TLS in exchange for our client secret, so reading its claims
// without checking the signature is what Google's docs allow for this flow.
// The audience, issuer and expiry are still checked.
export async function exchangeCode(code: string, verifier: string): Promise<GoogleUser> {
  if (fakeGoogle() && code.startsWith("fake:")) {
    const [, sub, email] = code.split(":");
    return { sub, email: email || null };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}: ${await res.text().catch(() => "")}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("google: no id_token");
  const claims = JSON.parse(Buffer.from(id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
  };
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("google: wrong audience");
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("google: wrong issuer");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("google: token expired");
  if (!claims.sub) throw new Error("google: no subject");
  const verified = claims.email_verified === true || claims.email_verified === "true";
  return { sub: claims.sub, email: verified && claims.email ? claims.email.toLowerCase() : null };
}

// A new Google user picks a username before the account exists. Who they are
// rides along in a short-lived signed cookie until then.
const key = () => createHash("sha256").update(`digly-google-pending:${process.env.AUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET || ""}`).digest();

export function signPending(u: GoogleUser, ttlMs = 15 * 60_000) {
  const body = b64url(Buffer.from(JSON.stringify({ ...u, exp: Date.now() + ttlMs })));
  return `${body}.${b64url(createHmac("sha256", key()).update(body).digest())}`;
}

export function readPending(token: string | undefined): GoogleUser | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleUser & { exp: number };
    return v.exp > Date.now() && typeof v.sub === "string" ? { sub: v.sub, email: v.email ?? null } : null;
  } catch {
    return null;
  }
}
