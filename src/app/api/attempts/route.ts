import { SeverityNumber } from "@opentelemetry/api-logs";
import { getEngine, handle, intParam, limit, playerId, readJson } from "@/server/game";
import { GameError, type AttemptMode, type LevelNo } from "@/game/service/types";
import { logGameEvent } from "@/server/posthogLogs";

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
    const day = intParam(body.day);
    const level = intParam(body.level) as LevelNo;
    const attempt = await engine.start(pid, day, level, mode as AttemptMode);
    logGameEvent("game attempt started", SeverityNumber.INFO, { action: "attempt_started", day, level, mode });
    return attempt;
  });
}
