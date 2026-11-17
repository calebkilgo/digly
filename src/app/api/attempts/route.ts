import { getEngine, handle, intParam, limit, playerId, readJson } from "@/server/game";
import { GameError, type AttemptMode, type LevelNo } from "@/game/service/types";

// POST /api/attempts {day, level, mode} -> starts (or resumes) a level and
// reveals its category. The server clock starts here.
export async function POST(req: Request) {
  return handle(async () => {
    const pid = (await playerId())!;
    limit(`start:${pid}`, 30, 60_000);
    const body = await readJson(req);
    const { engine } = getEngine();
    const mode = body.mode === "practice" ? "practice" : body.mode === "ranked" ? "ranked" : null;
    if (!mode) throw new GameError("bad_request", "Bad mode");
    return engine.start(pid, intParam(body.day), intParam(body.level) as LevelNo, mode as AttemptMode);
  });
}
