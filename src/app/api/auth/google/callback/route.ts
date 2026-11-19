import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { siteUrl } from "@/server/email";
import { cookieOpts, getEngine, playerId, startSession } from "@/server/game";
import { OAUTH_COOKIE, OAUTH_PATH, PENDING_COOKIE, exchangeCode, signPending, type GoogleUser } from "@/server/google";
import { StoreConflict } from "@/game/engine/store";

// GET /api/auth/google/callback?code=..&state=.. (Google sends people here)
// Logs in a linked account, links Google to the logged-in account, or starts a
// new account, which then needs a username (/?google=pick).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const back = (result: string) => {
    jar.set(OAUTH_COOKIE, "", { ...cookieOpts(0), path: OAUTH_PATH });
    return NextResponse.redirect(new URL(`/?google=${result}`, siteUrl()));
  };

  let saved: { state: string; verifier: string; intent: "login" | "link" } | null = null;
  try {
    saved = JSON.parse(Buffer.from(jar.get(OAUTH_COOKIE)?.value ?? "", "base64url").toString("utf8"));
  } catch {
    saved = null;
  }
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!saved?.state || url.searchParams.get("state") !== saved.state || !code) return back("error");

  let user: GoogleUser;
  try {
    user = await exchangeCode(code, saved.verifier);
  } catch (e) {
    console.error(e);
    Sentry.captureException(e);
    return back("error");
  }

  try {
    const store = getEngine().engine.storeRef();
    const linked = await store.findByGoogle(user.sub);

    if (saved.intent === "link") {
      const pid = await playerId(false);
      const me = pid ? await store.getPlayer(pid, { fresh: true }) : null;
      if (!me?.username) return back("error");
      if (linked && linked.playerId !== me.id) return back("taken");
      if (!linked) await store.linkGoogle(me.id, user.sub);
      // Google has confirmed this address, so it can fill in or verify the account's
      if (user.email && !me.email && !(await store.emailInUse(user.email, me.id))) await store.setEmail(me.id, user.email, true);
      else if (user.email && me.email === user.email && !me.emailVerified) await store.markEmailVerified(me.id, user.email);
      return back("linked");
    }

    if (linked) {
      await startSession(linked.playerId);
      return back("in");
    }
    if (!user.email) return back("noemail");
    // that email already has an account: log in to it (or reset its password), then connect Google
    if (await store.emailInUse(user.email)) return back("exists");
    jar.set(PENDING_COOKIE, signPending(user), cookieOpts(15 * 60));
    return back("pick");
  } catch (e) {
    if (e instanceof StoreConflict) return back("taken");
    console.error(e);
    Sentry.captureException(e);
    return back("error");
  }
}
