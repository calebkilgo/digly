import { getEngine, handle, playerId } from "@/server/game";

// GET /api/topics -> the topics this player does best in (strength 100 = average)
export async function GET() {
  return handle(async () => {
    const pid = await playerId(false);
    return { topics: pid ? await getEngine().engine.topics(pid) : [] };
  });
}
