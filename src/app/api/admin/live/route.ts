import { getEngine, handle, requireAdminPlayer } from "@/server/game";
import { SERVER_GRACE_MS } from "@/game/engine/engine";
import { VAULT_CHALLENGES } from "@/game/data/vault";

const VAULT = new Set(VAULT_CHALLENGES.map((s) => s.slug));

const HOUR = 3_600_000;
const BUCKET = 5 * 60_000;

// GET /api/admin/live -> who's playing right now, from the levels they've started.
// "Digging now" is everyone with a level still on the clock.
export async function GET() {
  return handle(async () => {
    await requireAdminPlayer();
    const { engine } = getEngine();
    const now = Date.now();
    const rows = await engine.storeRef().recentAttempts(now - HOUR, 5000);
    const live = rows.filter((r) => r.finishedAt === null && r.expiresAt + SERVER_GRACE_MS > now);
    const players = (list: typeof rows) => new Set(list.map((r) => r.playerId)).size;
    const byLevel = ([1, 2, 3] as const).map((l) => players(live.filter((r) => r.level === l)));
    // distinct players starting a level in each 5 minutes of the last hour, oldest first
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const end = now - (11 - i) * BUCKET;
      return players(rows.filter((r) => r.startedAt > end - BUCKET && r.startedAt <= end));
    });
    return {
      at: now,
      diggingNow: players(live),
      ranked: players(live.filter((r) => r.mode === "ranked")),
      practice: players(live.filter((r) => r.mode !== "ranked" && !VAULT.has(r.slug))),
      vault: players(live.filter((r) => r.mode !== "ranked" && VAULT.has(r.slug))),
      byLevel,
      last5: players(rows.filter((r) => r.startedAt > now - 5 * 60_000)),
      last15: players(rows.filter((r) => r.startedAt > now - 15 * 60_000)),
      lastHour: players(rows),
      buckets,
    };
  });
}
