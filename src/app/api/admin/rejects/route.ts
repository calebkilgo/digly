import { timingSafeEqual } from "node:crypto";
import { getEngine, handle } from "@/server/game";
import { GameError } from "@/game/service/types";
import { SEEDS } from "@/game/data/seeds";

// GET /api/admin/rejects?slug=dog-breeds&key=...  (needs DIGLY_ADMIN_KEY)
// The most common inputs that didn't match, plus how many have played the
// category. Real answers that show up here go into data/answers/<slug>.txt.
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const want = process.env.DIGLY_ADMIN_KEY ?? "";
    const got = url.searchParams.get("key") ?? "";
    const okKey = want.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
    if (!okKey) throw new GameError("forbidden", "Admin key required");
    const { engine } = getEngine();
    const slug = url.searchParams.get("slug");
    if (!slug) return { slugs: SEEDS.map((s) => s.slug) };
    if (!SEEDS.some((s) => s.slug === slug)) throw new GameError("not_found", "Unknown category");
    const stats = await engine.storeRef().answerStats(slug, engine.today() + 1);
    return { slug, plays: stats.plays, answersInList: engine.answerCount(slug), rejects: await engine.topRejects(slug, 200) };
  });
}
