import { getEngine, handle, requireAdminPlayer } from "@/server/game";
import { LAUNCH_DAY_UTC } from "@/game/rules/schedule";
import { GameError } from "@/game/service/types";

// GET /api/admin/growth -> players per day for the last 30 days, returns, and
// topic segments. Straight from the database (migration 0013).
export async function GET() {
  return handle(async () => {
    await requireAdminPlayer();
    const { engine } = getEngine();
    const store = engine.storeRef();
    const today = engine.today();
    try {
      const [days, segments] = await Promise.all([
        store.growth(LAUNCH_DAY_UTC, Math.max(1, today - 29), today),
        store.topicSegments(engine.topicMap(), 3),
      ]);
      return { today, days, segments, error: null };
    } catch (e) {
      if (e instanceof GameError && e.code === "not_open") return { today, days: [], segments: [], error: e.message };
      throw e;
    }
  });
}
