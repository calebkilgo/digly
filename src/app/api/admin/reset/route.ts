import { getEngine, handle, intParam, readJson, requireAdmin } from "@/server/game";
import { GameError } from "@/game/service/types";

// POST /api/admin/reset { scope: "day", day } | { scope: "all" }
// Testing tool for admins: deletes the admin's OWN runs only. Never anyone else's.
export async function POST(req: Request) {
  return handle(async () => {
    const pid = await requireAdmin();
    const body = await readJson(req);
    const { engine } = getEngine();
    if (body.scope === "day") {
      await engine.storeRef().deleteAttempts(pid, intParam(body.day, engine.today()));
    } else if (body.scope === "all") {
      await engine.storeRef().deleteAttempts(pid, null);
    } else {
      throw new GameError("bad_request", "Bad scope");
    }
    return { ok: true };
  });
}
