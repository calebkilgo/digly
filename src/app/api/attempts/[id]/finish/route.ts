import { SeverityNumber } from "@opentelemetry/api-logs";
import { getEngine, handle, playerId } from "@/server/game";
import { GameError } from "@/game/service/types";
import { logGameEvent } from "@/server/posthogLogs";

// POST /api/attempts/:id/finish -> locks the attempt and reveals rarity.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const pid = await playerId(false);
    if (!pid) throw new GameError("forbidden", "No player");
    const { id } = await ctx.params;
    const result = await getEngine().engine.finish(pid, id);
    logGameEvent("game attempt finished", SeverityNumber.INFO, { action: "attempt_finished" });
    return result;
  });
}
