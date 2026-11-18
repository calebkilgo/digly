import { getEngine, handle, requireAdminPlayer } from "@/server/game";
import { digSlots } from "@/game/service/slots";
import { slugFor } from "@/game/data/rotation";
import { SEEDS } from "@/game/data/seeds";

// GET /api/admin/overview -> headline numbers and today's categories.
export async function GET() {
  return handle(async () => {
    await requireAdminPlayer();
    const { engine, backend } = getEngine();
    const day = engine.today();
    const stats = await engine.storeRef().adminStats(day);
    const categories = ([1, 2, 3] as const).map((l) => {
      const slug = slugFor(day, l);
      return { level: l, slug, title: SEEDS.find((s) => s.slug === slug)?.title ?? slug };
    });
    return { day, number: digSlots(day).number, backend, stats, categories };
  });
}
