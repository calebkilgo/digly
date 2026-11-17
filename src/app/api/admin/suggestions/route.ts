import { getEngine, handle, requireAdmin } from "@/server/game";

// GET /api/admin/suggestions -> the latest prompt ideas from players.
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const list = await getEngine().engine.storeRef().listSuggestions(200);
    return { suggestions: list.map((s) => ({ text: s.text, day: s.day, createdAt: s.createdAt })) };
  });
}
