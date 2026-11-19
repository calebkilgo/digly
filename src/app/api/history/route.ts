import { getEngine, handle, playerId } from "@/server/game";

// GET /api/history -> everything this player has finished (ranked days,
// practice and Vault runs), so another device can show the same progress.
// Someone with no cookie yet has no history, and no database call is made.
export async function GET() {
  return handle(async () => {
    const pid = await playerId(false);
    if (!pid) return { ranked: [], practice: [], vault: [] };
    return getEngine().engine.history(pid);
  });
}
