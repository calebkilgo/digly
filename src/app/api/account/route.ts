import { endSession, getEngine, handle, limit, playerId, readJson, startSession } from "@/server/game";
import { checkEmail, checkPassword, checkPassword8, checkUsername, dummyHash, hashPassword, newToken, tokenHash } from "@/server/auth";
import { resetEmail, sendEmail, siteUrl } from "@/server/email";
import * as Sentry from "@sentry/nextjs";
import { GameError } from "@/game/service/types";
import { StoreConflict } from "@/game/engine/store";
import { headers } from "next/headers";

// GET /api/account -> { username } (null for guests)
export async function GET() {
  return handle(async () => {
    const pid = await playerId(false);
    const p = pid ? await getEngine().engine.storeRef().getPlayer(pid) : null;
    return {
      username: p?.username ?? null,
      admin: !!p?.username && !!p?.isAdmin,
      email: p?.username ? (p.email ?? null) : null,
      unlimited: !!p?.username && (!!p?.unlimited || !!p?.isAdmin),
    };
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
      const email = checkEmail(body.email);
      // signing up claims this device's guest, so today's runs come along
      const pid = (await playerId())!;
      await store.ensurePlayer(pid);
      try {
        await store.claimAccount(pid, { username, passwordHash: await hashPassword(password), email });
      } catch (e) {
        if (e instanceof StoreConflict) throw new GameError("taken", "That username is taken.");
        throw e;
      }
      await startSession(pid);
      return { username };
    }

    if (body.action === "login") {
      const username = String(body.username ?? "").trim();
      limit(`login:${ip}`, 20, 15 * 60_000);
      limit(`login:${username.toLowerCase()}`, 10, 15 * 60_000);
      const acct = username ? await store.findAccount(username) : null;
      const ok = await checkPassword(String(body.password ?? ""), acct?.passwordHash ?? (await dummyHash()));
      if (!acct || !ok) throw new GameError("bad_login", "Wrong username or password.");
      await startSession(acct.playerId);
      const p = await store.getPlayer(acct.playerId);
      return { username: acct.username, admin: !!p?.isAdmin, unlimited: !!p?.unlimited || !!p?.isAdmin };
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
      // a new password logs out every other device
      await store.deleteSessionsFor(pid);
      await startSession(pid);
      const p = await store.getPlayer(pid);
      return { username: p?.username ?? null, admin: !!p?.isAdmin, email: p?.email ?? null, unlimited: !!p?.unlimited || !!p?.isAdmin };
    }

    if (body.action === "email") {
      const pid = await playerId(false);
      const p = pid ? await store.getPlayer(pid) : null;
      if (!p?.username) throw new GameError("forbidden", "Log in first.");
      const email = checkEmail(body.email);
      await store.setEmail(p.id, email);
      return { username: p.username, admin: !!p.isAdmin, email };
    }

    if (body.action === "delete") {
      const pid = await playerId(false);
      const p = pid ? await store.getPlayer(pid) : null;
      if (!p?.username) throw new GameError("forbidden", "Log in first.");
      // the password is asked again so a borrowed device can't wipe an account
      const acct = await store.findAccount(p.username);
      if (!acct || !(await checkPassword(String(body.password ?? ""), acct.passwordHash))) throw new GameError("bad_login", "Wrong password.");
      await store.deletePlayer(p.id);
      await endSession();
      return { username: null };
    }

    throw new GameError("bad_request", "Unknown action");
  });
}
