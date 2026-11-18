import { getEngine, handle, requireAdminPlayer } from "@/server/game";

// GET /api/admin/log -> recent admin actions, newest first.
export async function GET() {
  return handle(async () => {
    await requireAdminPlayer();
    return { log: await getEngine().engine.storeRef().listAdminLog(100) };
  });
}
