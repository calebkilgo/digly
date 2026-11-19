import { getEngine, handle, limit, readJson, requireAdminPlayer, requireSameOrigin } from "@/server/game";
import { GameError } from "@/game/service/types";
import type { SuggestionStatus } from "@/game/engine/store";

const STATUSES: SuggestionStatus[] = ["new", "planned", "added", "dismissed"];

// GET /api/admin/suggestions -> the latest prompt ideas from players.
export async function GET() {
  return handle(async () => {
    await requireAdminPlayer();
    const list = await getEngine().engine.storeRef().listSuggestions(300);
    return {
      suggestions: list.map((s) => ({
        id: s.id ?? 0,
        text: s.text,
        day: s.day,
        createdAt: s.createdAt,
        status: s.status ?? "new",
        updatedBy: s.updatedBy ?? null,
        updatedAt: s.updatedAt ?? null,
      })),
    };
  });
}

// POST /api/admin/suggestions {id, status} -> mark an idea; every admin sees it.
export async function POST(req: Request) {
  return handle(async () => {
    await requireSameOrigin(req);
    const me = await requireAdminPlayer();
    limit(`admin:${me.id}`, 60, 60_000);
    const body = await readJson(req);
    const id = Number(body.id);
    const status = String(body.status) as SuggestionStatus;
    if (!Number.isInteger(id) || id < 1 || !STATUSES.includes(status)) throw new GameError("bad_request", "Bad request");
    const store = getEngine().engine.storeRef();
    const now = Date.now();
    const text = await store.setSuggestionStatus(id, status, me.username, now);
    if (text === null) throw new GameError("not_found", "No such idea");
    await store.addAdminLog({ actor: me.username, action: `idea_${status}`, detail: text, at: now });
    return { ok: true };
  });
}
