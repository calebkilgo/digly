import { endSession, handle } from "@/server/game";

// DELETE /api/me -> forget this device's guest or session (fresh guest next request).
export async function DELETE() {
  return handle(async () => {
    await endSession();
    return { ok: true };
  });
}
