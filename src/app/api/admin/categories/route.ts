import { handle, requireAdmin } from "@/server/game";
import { SEEDS } from "@/game/data/seeds";

// GET /api/admin/categories -> every category, for the admin demo dig picker.
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return { categories: SEEDS.map((s) => ({ slug: s.slug, title: s.title, level: s.level })) };
  });
}
