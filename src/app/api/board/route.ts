import { getEngine, handle, intParam, playerId } from "@/server/game";

export async function GET(req: Request) {
  return handle(async () => {
    const { engine, backend } = getEngine();
    const day = intParam(new URL(req.url).searchParams.get("day"), engine.today());
    const entries = await engine.board(await playerId(false), day);
    return { day, backend, entries };
  });
}
