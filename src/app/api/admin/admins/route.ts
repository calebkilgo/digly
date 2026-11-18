import { getEngine, handle, limit, readJson, requireAdminPlayer, requireSameOrigin } from "@/server/game";
import { GameError } from "@/game/service/types";

// GET /api/admin/admins -> every admin account.
export async function GET() {
  return handle(async () => {
    await requireAdminPlayer();
    return { admins: await getEngine().engine.storeRef().listAdmins() };
  });
}

// POST /api/admin/admins {username, admin} -> give or take away admin.
// You can't remove yourself, so there's always at least one admin.
export async function POST(req: Request) {
  return handle(async () => {
    await requireSameOrigin(req);
    const me = await requireAdminPlayer();
    limit(`admin:${me.id}`, 30, 60_000);
    const body = await readJson(req);
    const username = String(body.username ?? "").trim();
    const admin = body.admin === true;
    if (!username) throw new GameError("bad_request", "Enter a username");
    if (!admin && username.toLowerCase() === me.username.toLowerCase()) throw new GameError("bad_request", "You can't remove your own admin access");
    const store = getEngine().engine.storeRef();
    const id = await store.setAdminByUsername(username, admin);
    if (!id) throw new GameError("not_found", "No account with that username");
    await store.addAdminLog({ actor: me.username, action: admin ? "admin_added" : "admin_removed", detail: username, at: Date.now() });
    return { admins: await store.listAdmins() };
  });
}
