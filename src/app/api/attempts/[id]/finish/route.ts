import { getEngine, handle, playerId } from "@/server/game";
import { GameError } from "@/game/service/types";

// POST /api/attempts/:id/finish -> locks the attempt and reveals rarity.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const pid = await playerId(false);
    if (!pid) throw new GameError("forbidden", "No player");
    const { id } = await ctx.params;
    return getEngine().engine.finish(pid, id);
  });
}
