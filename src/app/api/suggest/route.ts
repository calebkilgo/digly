import { getEngine, handle, limit, playerId, readJson } from "@/server/game";

// POST /api/suggest {text} -> stores a prompt idea. No account needed.
export async function POST(req: Request) {
  return handle(async () => {
    const pid = (await playerId())!;
    limit(`suggest:${pid}`, 5, 10 * 60_000);
    const body = await readJson(req);
    await getEngine().engine.suggest(pid, String(body.text ?? ""));
    return { ok: true };
  });
}
