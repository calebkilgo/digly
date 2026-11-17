import { getEngine, handle, intParam, playerId } from "@/server/game";

// GET /api/dig?day=29 -> the day's level slots and where this player stands.
// No categories here: those arrive when a level's clock starts.
export async function GET(req: Request) {
  return handle(async () => {
    const { engine, backend } = getEngine();
    const day = intParam(new URL(req.url).searchParams.get("day"), engine.today());
    const pid = await playerId();
    return { backend, ...(await engine.status(pid!, day)) };
  });
}
