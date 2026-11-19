import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { DigEngine } from "@/game/engine/engine";
import { MemoryStore } from "@/game/engine/memoryStore";
import { GameError } from "@/game/service/types";
import { SupabaseStore } from "./supabaseStore";
import { newToken, tokenHash } from "./auth";

export type Backend = "supabase" | "memory";

// Kept on globalThis: Next can load this module more than once in one server
// (pages and API routes are bundled separately), and with the memory store
// they must share one copy.
const g = globalThis as unknown as { __digly?: { engine: DigEngine; backend: Backend } };

export function getEngine() {
  if (!g.__digly) {
    let engine: DigEngine;
    let backend: Backend;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      engine = new DigEngine(new SupabaseStore(url, key));
      backend = "supabase";
    } else {
      // Fine for local dev. On Vercel each instance would keep its own copy,
      // so set the Supabase env vars before real players arrive.
      if (process.env.NODE_ENV === "production") console.warn("digly: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set, using memory store");
      // DIGLY_DEV_ADMINS=name1,name2 makes those sign-ups admins, for testing
      // the admin panel locally. It does nothing once Supabase is set up.
      const devAdmins = (process.env.DIGLY_DEV_ADMINS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
      engine = new DigEngine(new MemoryStore(undefined, devAdmins));
      backend = "memory";
    }
    g.__digly = { engine, backend };
  }
  return g.__digly;
}

const PID = "digly_pid";
const SID = "digly_sid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_DAYS = 90;

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

// Who is calling. A logged-in account comes from the session cookie. A guest
// is a random id in its own cookie. A guest id that has since become an
// account no longer works on its own: that needs the session.
export async function playerId(create = true): Promise<string | null> {
  const jar = await cookies();
  const { engine } = getEngine();
  const store = engine.storeRef();
  const sid = jar.get(SID)?.value;
  if (sid) {
    const pid = await store.sessionPlayer(tokenHash(sid), Date.now());
    if (pid) return pid;
  }
  const v = jar.get(PID)?.value;
  if (v && UUID.test(v)) {
    const p = await store.getPlayer(v);
    if (!p?.username) return v;
  }
  if (!create) return null;
  const id = crypto.randomUUID();
  jar.set(PID, id, cookieOpts(60 * 60 * 24 * 400));
  return id;
}

// Admin access needs a real logged-in session (a guest cookie never counts)
// and the is_admin flag on that account, checked on every request.
export async function requireAdminPlayer() {
  const jar = await cookies();
  const sid = jar.get(SID)?.value;
  const store = getEngine().engine.storeRef();
  const pid = sid ? await store.sessionPlayer(tokenHash(sid), Date.now()) : null;
  // never cached: losing admin takes effect on the next request
  const p = pid ? await store.getPlayer(pid, { fresh: true }) : null;
  if (!p?.isAdmin || !p.username) throw new GameError("forbidden", "Admins only");
  return { id: p.id, username: p.username };
}

export async function requireAdmin() {
  return (await requireAdminPlayer()).id;
}

// Changes must come from our own pages: a form on another site can't use an
// admin's cookie to make them. Browsers always send Origin on POST.
export async function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = (await headers()).get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new GameError("forbidden", "Bad origin");
}

export async function startSession(pid: string) {
  const jar = await cookies();
  const token = newToken();
  await getEngine().engine.storeRef().createSession(tokenHash(token), pid, Date.now() + SESSION_DAYS * 86_400_000);
  jar.set(SID, token, cookieOpts(SESSION_DAYS * 86_400));
  jar.set(PID, pid, cookieOpts(60 * 60 * 24 * 400));
}

export async function endSession() {
  const jar = await cookies();
  const sid = jar.get(SID)?.value;
  if (sid) await getEngine().engine.storeRef().deleteSession(tokenHash(sid));
  jar.delete(SID);
  jar.delete(PID);
}

// Per-instance sliding window. Good enough to stop a script hammering one
// box; a shared limiter (Upstash or a Postgres table) can replace it later.
const hits = new Map<string, number[]>();
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    throw new GameError("rate_limited", "Slow down");
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 50_000) hits.clear();
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

const STATUS: Record<GameError["code"], number> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  already_played: 409,
  locked: 409,
  not_open: 425,
  rate_limited: 429,
  taken: 409,
  bad_login: 401,
};

// Wraps a route: IP rate limit, JSON out, GameErrors mapped to status codes.
export async function handle(fn: () => Promise<unknown>) {
  try {
    limit(`ip:${await clientIp()}`, 600, 60_000);
    const body = await fn();
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.code, message: e.message }, { status: STATUS[e.code] });
    console.error(e);
    Sentry.captureException(e);
    return NextResponse.json({ error: "server", message: "Something broke underground" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  } catch {
    throw new GameError("bad_request", "Expected JSON");
  }
}

export function intParam(v: unknown, fallback?: number) {
  if (v === undefined || v === null || v === "") {
    if (fallback !== undefined) return fallback;
    throw new GameError("bad_request", "Missing number");
  }
  const n = Number(v);
  if (!Number.isInteger(n)) throw new GameError("bad_request", "Bad number");
  return n;
}
