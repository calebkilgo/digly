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
    const store = engine.storeRef();
    const owns = async (fresh: boolean) => {
      const p = await store.getPlayer(pid, { fresh });
      return !!p?.unlimited || !!p?.isAdmin;
    };
    const unlimited = mode === "practice" && (await owns(false));
    const day = intParam(body.day);
    const level = intParam(body.level) as LevelNo;
    try {
      return await engine.start(pid, day, level, mode as AttemptMode, { slug, vault, unlimited });
    } catch (e) {
      // the cached copy can be a few seconds behind a purchase made on another server
      if (!(e instanceof GameError && e.code === "locked" && mode === "practice" && !unlimited && (await owns(true)))) throw e;
      return engine.start(pid, day, level, mode as AttemptMode, { slug, vault, unlimited: true });
    }
  });
}
