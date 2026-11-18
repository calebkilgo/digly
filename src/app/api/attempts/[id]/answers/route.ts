import { getEngine, handle, playerId } from "@/server/game";
import { GameError } from "@/game/service/types";

// GET /api/attempts/:id/answers -> every answer for a finished level.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const pid = await playerId(false);
    if (!pid) throw new GameError("forbidden", "No player");
    const { id } = await ctx.params;
    return { answers: await getEngine().engine.allAnswers(pid, id) };
  });
}
