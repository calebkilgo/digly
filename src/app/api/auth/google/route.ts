import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newToken } from "@/server/auth";
import { siteUrl } from "@/server/email";
import { cookieOpts } from "@/server/game";
import { OAUTH_COOKIE, OAUTH_PATH, authUrl, fakeGoogle, googleEnabled, redirectUri } from "@/server/google";

// GET /api/auth/google?intent=login|link -> off to Google's account picker.
// The state and PKCE verifier wait in a short-lived cookie for the callback.
export async function GET(req: Request) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/?google=off", siteUrl()));
  const url = new URL(req.url);
  const intent = url.searchParams.get("intent") === "link" ? "link" : "login";
  const state = newToken();
  const verifier = newToken();
  (await cookies()).set(OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, verifier, intent })).toString("base64url"), {
    ...cookieOpts(600),
    path: OAUTH_PATH,
  });
  if (fakeGoogle() && url.searchParams.get("fake")) {
    return NextResponse.redirect(`${redirectUri()}?code=${encodeURIComponent(`fake:${url.searchParams.get("fake")}`)}&state=${state}`);
  }
  return NextResponse.redirect(authUrl(state, verifier));
}
