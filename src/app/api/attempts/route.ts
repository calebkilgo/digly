import { getEngine, handle, intParam, limit, playerId, readJson, requireAdmin } from "@/server/game";
import { GameError, type AttemptMode, type LevelNo } from "@/game/service/types";

// POST /api/attempts {day, level, mode, vault?} -> starts (or resumes) a level and
// reveals its category. The server clock starts here.
export async function POST(req: Request) {
  return handle(async () => {
    const pid = (await playerId())!;
    limit(`start:${pid}`, 30, 60_000);
    const body = await readJson(req);
    const { engine } = getEngine();
    const mode = body.mode === "practice" ? "practice" : body.mode === "ranked" ? "ranked" : null;
    if (!mode) throw new GameError("bad_request", "Bad mode");
    // a chosen category is the admin demo dig
    let slug: string | undefined;
    if (body.slug !== undefined) {
      await requireAdmin();
      slug = String(body.slug);
    }
    const vault = body.vault === undefined ? undefined : intParam(body.vault);
    // most Vault games need Digly Unlimited (admins always have it)
    let unlimited = false;
    if (mode === "practice") {
      const p = await engine.storeRef().getPlayer(pid);
      unlimited = !!p?.unlimited || !!p?.isAdmin;
    }
    return engine.start(pid, intParam(body.day), intParam(body.level) as LevelNo, mode as AttemptMode, { slug, vault, unlimited });
  });
}
