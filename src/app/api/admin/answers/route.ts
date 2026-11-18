import { getEngine, handle, limit, readJson, requireAdminPlayer, requireSameOrigin } from "@/server/game";
import { GameError } from "@/game/service/types";

// GET /api/admin/answers?slug=trees -> the category's full answer list as players get it,
// plus answers an admin removed.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdminPlayer();
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) throw new GameError("bad_request", "Pick a category");
    return getEngine().engine.answerList(slug);
  });
}

// POST /api/admin/answers
//   {slug, action: "add", name, aliases?, rating?}  add an answer, or change one already there
//   {slug, action: "remove", name}                   take one out
//   {slug, action: "undo", key}                      put it back the way the code has it
export async function POST(req: Request) {
  return handle(async () => {
    await requireSameOrigin(req);
    const me = await requireAdminPlayer();
    limit(`admin:${me.id}`, 60, 60_000);
    const body = await readJson(req);
    const slug = String(body.slug ?? "");
    const { engine } = getEngine();
    const store = engine.storeRef();
    const now = Date.now();
    if (body.action === "undo") {
      const key = String(body.key ?? "");
      if (!key) throw new GameError("bad_request", "Bad request");
      await engine.undoAnswerEdit(slug, key);
      await store.addAdminLog({ actor: me.username, action: "answer_undo", detail: `${slug}: ${String(body.name ?? key).slice(0, 60)}`, at: now });
      return { ok: true };
    }
    const aliases = Array.isArray(body.aliases) ? body.aliases.map(String) : [];
    const edit = await engine.editAnswer(me.username, slug, {
      action: String(body.action ?? ""),
      name: String(body.name ?? ""),
      aliases,
      rating: body.rating === undefined ? undefined : Number(body.rating),
      replaces: typeof body.replaces === "string" ? body.replaces : undefined,
    });
    await store.addAdminLog({ actor: me.username, action: `answer_${edit.action}`, detail: `${slug}: ${edit.name}`, at: now });
    return { ok: true };
  });
}
