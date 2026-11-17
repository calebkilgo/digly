import { endSession, getEngine, handle, limit, playerId, readJson, startSession } from "@/server/game";
import { checkEmail, checkPassword, checkPassword8, checkUsername, dummyHash, hashPassword } from "@/server/auth";
import { GameError } from "@/game/service/types";
import { StoreConflict } from "@/game/engine/store";
import { headers } from "next/headers";

// GET /api/account -> authenticated account identity (null for guests)
export async function GET() {
  return handle(async () => {
    const pid = await playerId(false);
    const p = pid ? await getEngine().engine.storeRef().getPlayer(pid) : null;
    return { playerId: p?.username ? pid : null, username: p?.username ?? null };
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
      return { playerId: null, username: null };
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
      return { playerId: pid, username };
    }

    if (body.action === "login") {
      const username = String(body.username ?? "").trim();
      limit(`login:${ip}`, 20, 15 * 60_000);
      limit(`login:${username.toLowerCase()}`, 10, 15 * 60_000);
      const acct = username ? await store.findAccount(username) : null;
      const ok = await checkPassword(String(body.password ?? ""), acct?.passwordHash ?? (await dummyHash()));
      if (!acct || !ok) throw new GameError("bad_login", "Wrong username or password.");
      await startSession(acct.playerId);
      return { playerId: acct.playerId, username: acct.username };
    }

    throw new GameError("bad_request", "Unknown action");
  });
}
