import type { AttemptMode } from "../service/types";
import { StoreConflict, type AttemptRow, type BoardTotal, type PlayerInfo, type Purchase, type Store, type Suggestion } from "./store";

export interface MemoryData {
  players: Record<string, { name: string; username?: string; passwordHash?: string; email?: string | null; isAdmin?: boolean; unlimited?: boolean }>;
  purchases?: Record<string, Purchase & { status: "paid" | "refunded" }>;
  sessions?: Record<string, { playerId: string; expiresAt: number }>;
  resets?: Record<string, { playerId: string; expiresAt: number }>;
  attempts: Record<string, AttemptRow>;
  answers: Record<string, string[]>;
  rejects: Record<string, string[]>;
  suggestions?: Suggestion[];
}

const empty = (): MemoryData => ({ players: {}, attempts: {}, answers: {}, rejects: {} });

// In-process store. Used by tests, by `next dev` without Supabase, and
// (via BrowserStore) by the offline preview. Not shared between server
// instances, so never rely on it in production.
export class MemoryStore implements Store {
  protected data: MemoryData;

  constructor(data?: MemoryData) {
    this.data = data ?? empty();
  }

  protected changed() {}

  async ensurePlayer(id: string) {
    if (!this.data.players[id]) {
      this.data.players[id] = { name: "" };
      this.changed();
    }
  }

  async getPlayer(id: string): Promise<PlayerInfo | null> {
    const p = this.data.players[id];
    return p ? { id, username: p.username ?? null, isAdmin: !!p.isAdmin, email: p.email ?? null, unlimited: !!p.unlimited } : null;
  }

  async claimAccount(id: string, a: { username: string; passwordHash: string; email: string | null }) {
    const lower = a.username.toLowerCase();
    if (Object.values(this.data.players).some((p) => p.username?.toLowerCase() === lower)) throw new StoreConflict();
    const p = (this.data.players[id] ??= { name: "" });
    if (p.username) throw new StoreConflict();
    Object.assign(p, { username: a.username, passwordHash: a.passwordHash, email: a.email });
    this.changed();
  }

  async findAccount(username: string) {
    const lower = username.toLowerCase();
    const hit = Object.entries(this.data.players).find(([, p]) => p.username?.toLowerCase() === lower);
    return hit && hit[1].passwordHash ? { playerId: hit[0], username: hit[1].username!, passwordHash: hit[1].passwordHash } : null;
  }

  async createSession(tokenHash: string, playerId: string, expiresAt: number) {
    (this.data.sessions ??= {})[tokenHash] = { playerId, expiresAt };
    this.changed();
  }

  async sessionPlayer(tokenHash: string, now: number) {
    const s = this.data.sessions?.[tokenHash];
    return s && s.expiresAt > now ? s.playerId : null;
  }

  async deleteSession(tokenHash: string) {
    if (this.data.sessions) delete this.data.sessions[tokenHash];
    this.changed();
  }

  async deleteSessionsFor(playerId: string) {
    for (const [k, v] of Object.entries(this.data.sessions ?? {})) if (v.playerId === playerId) delete this.data.sessions![k];
    this.changed();
  }

  async grantUnlimited(p: Purchase) {
    (this.data.purchases ??= {})[p.id] = { ...p, status: "paid" };
    const pl = this.data.players[p.playerId];
    if (pl) pl.unlimited = true;
    this.changed();
  }

  async revokeByPaymentIntent(pi: string) {
    const hit = Object.values(this.data.purchases ?? {}).find((x) => x.paymentIntent === pi);
    if (!hit) return null;
    hit.status = "refunded";
    // keep access if they have another paid purchase
    const stillPaid = Object.values(this.data.purchases ?? {}).some((x) => x.playerId === hit.playerId && x.status === "paid");
    const pl = this.data.players[hit.playerId];
    if (pl && !stillPaid) pl.unlimited = false;
    this.changed();
    return hit.playerId;
  }

  async deletePlayer(playerId: string) {
    await this.deleteAttempts(playerId, null);
    await this.deleteSessionsFor(playerId);
    for (const [k, v] of Object.entries(this.data.resets ?? {})) if (v.playerId === playerId) delete this.data.resets![k];
    delete this.data.players[playerId];
    this.changed();
  }

  async findByLogin(login: string) {
    const l = login.trim().toLowerCase();
    const hit = Object.entries(this.data.players).find(([, p]) => p.username && (p.username.toLowerCase() === l || (p.email ?? "").toLowerCase() === l));
    return hit ? { playerId: hit[0], username: hit[1].username!, email: hit[1].email ?? null } : null;
  }

  async setEmail(playerId: string, email: string | null) {
    const p = this.data.players[playerId];
    if (p) p.email = email;
    this.changed();
  }

  async setPassword(playerId: string, passwordHash: string) {
    const p = this.data.players[playerId];
    if (p) p.passwordHash = passwordHash;
    this.changed();
  }

  async createReset(tokenHash: string, playerId: string, expiresAt: number) {
    (this.data.resets ??= {})[tokenHash] = { playerId, expiresAt };
    this.changed();
  }

  async useReset(tokenHash: string, now: number) {
    const r = this.data.resets?.[tokenHash];
    if (!r) return null;
    delete this.data.resets![tokenHash];
    this.changed();
    return r.expiresAt > now ? r.playerId : null;
  }

  async insertAttempt(row: AttemptRow) {
    if (row.mode === "ranked") {
      const clash = Object.values(this.data.attempts).some(
        (a) => a.mode === "ranked" && a.playerId === row.playerId && a.day === row.day && a.level === row.level,
      );
      if (clash) throw new StoreConflict();
    }
    this.data.attempts[row.id] = { ...row };
    this.changed();
  }

  async getAttempt(id: string) {
    const a = this.data.attempts[id];
    return a ? { ...a } : null;
  }

  async listAttempts(playerId: string, day: number, mode: AttemptMode) {
    return Object.values(this.data.attempts)
      .filter((a) => a.playerId === playerId && a.day === day && a.mode === mode)
      .map((a) => ({ ...a }));
  }

  async bumpSubmissions(id: string) {
    const a = this.data.attempts[id];
    if (!a) return Infinity;
    a.submissions++;
    this.changed();
    return a.submissions;
  }

  async addAnswer(attemptId: string, answerId: string) {
    const list = (this.data.answers[attemptId] ??= []);
    if (list.includes(answerId)) return false;
    list.push(answerId);
    this.changed();
    return true;
  }

  async listAnswers(attemptId: string) {
    return [...(this.data.answers[attemptId] ?? [])];
  }

  async addReject(attemptId: string, text: string) {
    const list = (this.data.rejects[attemptId] ??= []);
    if (!list.includes(text) && list.length < 200) {
      list.push(text);
      this.changed();
    }
  }

  async listRejects(attemptId: string) {
    return [...(this.data.rejects[attemptId] ?? [])];
  }

  async finishAttempt(id: string, f: { finishedAt: number; score: number; points: number; uniqueCount: number }) {
    const a = this.data.attempts[id];
    if (!a || a.finishedAt !== null) return false;
    Object.assign(a, f);
    this.changed();
    return true;
  }

  async dayBoard(day: number, limit: number): Promise<BoardTotal[]> {
    const totals = new Map<string, BoardTotal>();
    for (const a of Object.values(this.data.attempts)) {
      const username = this.data.players[a.playerId]?.username;
      if (a.mode !== "ranked" || a.day !== day || a.finishedAt === null || !username) continue;
      const t = totals.get(a.playerId) ?? { playerId: a.playerId, name: username, points: 0, unique: 0 };
      t.points += a.points ?? 0;
      t.unique += a.uniqueCount;
      totals.set(a.playerId, t);
    }
    return [...totals.values()].sort((a, b) => b.points - a.points || b.unique - a.unique).slice(0, limit);
  }

  async deleteAttempts(playerId: string, day: number | null) {
    for (const [id, a] of Object.entries(this.data.attempts)) {
      if (a.playerId !== playerId) continue;
      if (day !== null && (a.day !== day || a.mode !== "ranked")) continue;
      delete this.data.attempts[id];
      delete this.data.answers[id];
      delete this.data.rejects[id];
    }
    this.changed();
  }

  async answerStats(slug: string, beforeDay: number) {
    return memoryStats(this.data, slug, beforeDay);
  }

  async addSuggestion(s: Suggestion) {
    (this.data.suggestions ??= []).push(s);
    this.changed();
  }

  async listSuggestions(limit: number) {
    return [...(this.data.suggestions ?? [])].reverse().slice(0, limit);
  }

  async topRejects(slug: string, limit: number) {
    const tally = new Map<string, number>();
    for (const a of Object.values(this.data.attempts)) {
      if (a.slug !== slug) continue;
      for (const t of this.data.rejects[a.id] ?? []) {
        const k = t.toLowerCase();
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
    }
    return [...tally].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n).slice(0, limit);
  }
}

export function memoryStats(data: MemoryData, slug: string, beforeDay: number) {
  let plays = 0;
  const counts: Record<string, number> = {};
  for (const a of Object.values(data.attempts)) {
    if (a.mode !== "ranked" || a.slug !== slug || a.day >= beforeDay) continue;
    plays++;
    for (const id of data.answers[a.id] ?? []) counts[id] = (counts[id] ?? 0) + 1;
  }
  return { plays, counts };
}

// MemoryStore saved to localStorage, for the static preview with no server.
export class BrowserStore extends MemoryStore {
  constructor(private key = "digly.engine.v1") {
    let data: MemoryData | undefined;
    try {
      const raw = localStorage.getItem(key);
      if (raw) data = JSON.parse(raw);
    } catch {
      data = undefined;
    }
    super(data);
  }

  protected changed() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // storage full or blocked; the run still works for this tab
    }
  }

  reset() {
    this.data = { players: {}, attempts: {}, answers: {}, rejects: {}, sessions: {} };
    this.changed();
  }

  resetDay(day: number) {
    for (const [id, a] of Object.entries(this.data.attempts)) {
      if (a.day === day && a.mode === "ranked") {
        delete this.data.attempts[id];
        delete this.data.answers[id];
        delete this.data.rejects[id];
      }
    }
    this.changed();
  }
}
