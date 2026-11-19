import { cookieOpts, endSession, getEngine, handle, limit, playerId, readJson, startSession } from "@/server/game";
import { checkPassword, checkPassword8, checkUsername, dummyHash, hashPassword, newToken, requireEmail, tokenHash } from "@/server/auth";
import { sendVerification } from "@/server/accounts";
import { deleteAnalytics } from "@/server/posthog";
import { PENDING_COOKIE, googleEnabled, readPending } from "@/server/google";
import { cookies } from "next/headers";
import type { PlayerInfo } from "@/game/engine/store";
import { resetEmail, sendEmail, siteUrl } from "@/server/email";
import * as Sentry from "@sentry/nextjs";
import { GameError } from "@/game/service/types";
import { StoreConflict } from "@/game/engine/store";
import { headers } from "next/headers";

// What the page gets to know about the account. Guests get nulls.
function accountView(p: PlayerInfo | null) {
  const acct = !!p?.username;
  return {
    username: p?.username ?? null,
    id: acct ? p!.id : null,
    admin: acct && !!p?.isAdmin,
    email: acct ? (p!.email ?? null) : null,
    unlimited: acct && (!!p?.unlimited || !!p?.isAdmin),
    emailVerified: acct && !!p?.emailVerified,
    google: acct && !!p?.google,
    hasPassword: acct && p?.hasPassword !== false,
    marketing: acct && !!p?.marketing,
    googleEnabled: googleEnabled(),
  };
}

// GET /api/account -> the account, or nulls for a guest
export async function GET() {
  return handle(async () => {
    const pid = await playerId(false);
    const p = pid ? await getEngine().engine.storeRef().getPlayer(pid) : null;
    return accountView(p);
  });
}

// POST /api/account { action: "signup" | "login" | "logout", ... }
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const store = getEngine().engine.storeRef();
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";

    if (body.action === "logout") {
      await endSession();
      return { username: null };
    }

    if (body.action === "signup") {
      limit(`signup:${ip}`, 5, 60 * 60_000);
      const username = checkUsername(body.username);
      const password = checkPassword8(body.password);
      const email = requireEmail(body.email);
      if (await store.emailInUse(email)) throw new GameError("taken", "That email already has an account. Log in, or reset its password.");
      // signing up claims this device's guest, so today's runs come along
      const pid = (await playerId())!;
      await store.ensurePlayer(pid);
      try {
        await store.claimAccount(pid, { username, passwordHash: await hashPassword(password), email, marketing: body.marketing === true });
      } catch (e) {
        if (e instanceof StoreConflict) throw new GameError("taken", "That username is taken.");
        throw e;
      }
      await startSession(pid);
      await sendVerification(store, pid, username, email);
      return accountView(await store.getPlayer(pid, { fresh: true }));
    }

    // a new Google user picks their username (Google's details wait in a signed cookie)
    if (body.action === "google_finish") {
      limit(`signup:${ip}`, 5, 60 * 60_000);
      const jar = await cookies();
      const g = readPending(jar.get(PENDING_COOKIE)?.value);
      if (!g?.email) throw new GameError("bad_request", "That Google sign-in timed out. Try Continue with Google again.");
      const username = checkUsername(body.username);
      if (await store.emailInUse(g.email)) throw new GameError("taken", "That email already has an account. Log in, then connect Google in Options.");
      const pid = (await playerId())!;
      await store.ensurePlayer(pid);
      try {
        await store.claimAccount(pid, { username, passwordHash: null, email: g.email, googleSub: g.sub, emailVerified: true, marketing: body.marketing === true });
      } catch (e) {
        if (e instanceof StoreConflict) throw new GameError("taken", "That username is taken.");
        throw e;
      }
      jar.set(PENDING_COOKIE, "", cookieOpts(0));
      await startSession(pid);
      return accountView(await store.getPlayer(pid, { fresh: true }));
    }

    // the link in a verification email (?verify=...)
    if (body.action === "verify") {
      limit(`verify:${ip}`, 20, 60 * 60_000);
      const v = await store.useEmailVerification(tokenHash(String(body.token ?? "")), Date.now());
      if (!v || !(await store.markEmailVerified(v.playerId, v.email)))
        throw new GameError("bad_login", "That link has expired or was already used. Send a new one from Options.");
      const pid = await playerId(false);
      return { verified: true, mine: pid === v.playerId };
    }

    if (body.action === "resend_verify") {
      const pid = await playerId(false);
      const p = pid ? await store.getPlayer(pid, { fresh: true }) : null;
      if (!p?.username) throw new GameError("forbidden", "Log in first.");
      if (!p.email) throw new GameError("bad_request", "Add an email first.");
      if (p.emailVerified) return accountView(p);
      limit(`resend:${p.id}`, 3, 60 * 60_000);
      await sendVerification(store, p.id, p.username, p.email);
      return accountView(p);
    }

    if (body.action === "marketing") {
      const pid = await playerId(false);
      const p = pid ? await store.getPlayer(pid) : null;
      if (!p?.username) throw new GameError("forbidden", "Log in first.");
      await store.setMarketing(p.id, body.on === true);
      return accountView(await store.getPlayer(p.id, { fresh: true }));
    }

    if (body.action === "login") {
      const username = String(body.username ?? "").trim();
      limit(`login:${ip}`, 20, 15 * 60_000);
      limit(`login:${username.toLowerCase()}`, 10, 15 * 60_000);
      const acct = username ? await store.findAccount(username) : null;
      const ok = await checkPassword(String(body.password ?? ""), acct?.passwordHash ?? (await dummyHash()));
      if (!acct || !ok) throw new GameError("bad_login", "Wrong username or password.");
      await startSession(acct.playerId);
      return accountView(await store.getPlayer(acct.playerId, { fresh: true }));
    }

    // Always answers the same way, so it can't be used to find which accounts exist.
    if (body.action === "forgot") {
      const login = String(body.login ?? "").trim().slice(0, 200);
      limit(`forgot:${ip}`, 5, 60 * 60_000);
      if (login) limit(`forgot:${login.toLowerCase()}`, 3, 60 * 60_000);
      const acct = login ? await store.findByLogin(login) : null;
      if (acct?.email) {
        const token = newToken();
        await store.createReset(tokenHash(token), acct.playerId, Date.now() + 60 * 60_000);
        const { text, html } = resetEmail(acct.username, `${siteUrl()}/?reset=${token}`);
        try {
          await sendEmail(acct.email, "Reset your Digly password", text, html);
        } catch (e) {
          console.error(e);
          Sentry.captureException(e);
        }
      }
      return { ok: true };
    }

    if (body.action === "reset") {
      limit(`reset:${ip}`, 10, 60 * 60_000);
      const password = checkPassword8(body.password);
      const pid = await store.useReset(tokenHash(String(body.token ?? "")), Date.now());
      if (!pid) throw new GameError("bad_login", "That reset link has expired or was already used. Ask for a new one.");
      await store.setPassword(pid, await hashPassword(password));
      // the link reached their inbox, so the address is confirmed too
      try {
        const p0 = await store.getPlayer(pid, { fresh: true });
        if (p0?.email && !p0.emailVerified) await store.markEmailVerified(pid, p0.email);
      } catch {
        // before migration 0012 there's nothing to mark
      }
      // a new password logs out every other device
      await store.deleteSessionsFor(pid);
      await startSession(pid);
      return accountView(await store.getPlayer(pid, { fresh: true }));
    }

    if (body.action === "email") {
      const pid = await playerId(false);
      const p = pid ? await store.getPlayer(pid) : null;
      if (!p?.username) throw new GameError("forbidden", "Log in first.");
      const email = requireEmail(body.email);
      if (email === p.email) return accountView(p);
      if (await store.emailInUse(email, p.id)) throw new GameError("taken", "Another account already uses that email.");
      await store.setEmail(p.id, email);
      await sendVerification(store, p.id, p.username, email);
      return accountView(await store.getPlayer(p.id, { fresh: true }));
    }

    if (body.action === "delete") {
      const pid = await playerId(false);
      const p = pid ? await store.getPlayer(pid) : null;
      if (!p?.username) throw new GameError("forbidden", "Log in first.");
      // the password is asked again so a borrowed device can't wipe an account;
      // a Google-only account types its username instead
      const acct = await store.findAccount(p.username);
      if (acct) {
        if (!(await checkPassword(String(body.password ?? ""), acct.passwordHash))) throw new GameError("bad_login", "Wrong password.");
      } else if (String(body.confirm ?? "").trim().toLowerCase() !== p.username.toLowerCase()) {
        throw new GameError("bad_login", "Type your username to confirm.");
      }
      await store.deletePlayer(p.id);
      await endSession();
      // analytics knew them by player id (older events by username)
      await deleteAnalytics([p.id, p.username]);
      return { username: null };
    }

    throw new GameError("bad_request", "Unknown action");
  });
}
