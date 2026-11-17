import { getEngine, handle, limit, playerId, readJson } from "@/server/game";
import { GameError } from "@/game/service/types";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const pid = await playerId(false);
    if (!pid) throw new GameError("forbidden", "No player");
    limit(`submit:${pid}`, 40, 5_000);
    const { id } = await ctx.params;
    const body = await readJson(req);
    if (typeof body.text !== "string") throw new GameError("bad_request", "Missing text");
    return getEngine().engine.submit(pid, id, body.text);
  });
}
