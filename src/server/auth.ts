import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { GameError } from "@/game/service/types";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 64;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return got.length === want.length && timingSafeEqual(got, want);
}

// A real hash to compare against when the username doesn't exist, so both
// cases take the same time.
let dummy: Promise<string> | null = null;
export function dummyHash() {
  return (dummy ??= hashPassword("not-a-real-password"));
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const RESERVED = new Set(["you", "guest", "admin", "administrator", "anonymous", "digly", "moderator", "mod", "staff", "support", "system", "null", "undefined"]);
const RUDE = /(fuck|shit|cunt|nigg|fag|bitch|whore|slut|rape|nazi|hitler|porn|penis|vagina|dick|cock)/i;

export function checkUsername(raw: unknown) {
  const u = String(raw ?? "").trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(u)) throw new GameError("bad_request", "Usernames are 3 to 16 letters, numbers or underscores.");
  if (RESERVED.has(u.toLowerCase())) throw new GameError("taken", "That username is reserved.");
  if (RUDE.test(u)) throw new GameError("bad_request", "Pick a different username.");
  return u;
}

export function checkPassword8(raw: unknown) {
  const p = String(raw ?? "");
  if (p.length < 8) throw new GameError("bad_request", "Passwords need at least 8 characters.");
  if (p.length > 128) throw new GameError("bad_request", "That password is too long.");
  return p;
}

// sign-ups need an email: it's how password resets reach them
export function requireEmail(raw: unknown) {
  const e = checkEmail(raw);
  if (!e) throw new GameError("bad_request", "Add your email. It's how you reset your password.");
  return e;
}

export function checkEmail(raw: unknown) {
  const e = String(raw ?? "").trim();
  if (!e) return null;
  if (e.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new GameError("bad_request", "That email doesn't look right.");
  return e.toLowerCase();
}
