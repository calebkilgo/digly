import { getEngine } from "@/server/game";
import { checkUnsubscribe } from "@/server/marketing";

// The unsubscribe link in marketing emails. GET shows a page; POST is the
// one-click unsubscribe that mail apps send (List-Unsubscribe-Post).
async function unsubscribe(req: Request) {
  const url = new URL(req.url);
  const pid = url.searchParams.get("u") ?? "";
  const ok = !!pid && checkUnsubscribe(pid, url.searchParams.get("t") ?? "");
  if (ok) {
    try {
      await getEngine().engine.storeRef().setMarketing(pid, false);
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  return ok;
}

export async function GET(req: Request) {
  const ok = await unsubscribe(req);
  const msg = ok ? "You're unsubscribed. Digly won't send you news emails. Password and account emails still arrive." : "That unsubscribe link didn't work. Turn off news emails in Options in the game instead.";
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Digly</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#1b1030"><h1 style="font-size:22px">Digly</h1><p>${msg}</p><p><a href="/">Back to the game</a></p></body>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const ok = await unsubscribe(req);
  return new Response(null, { status: ok ? 200 : 400 });
}
