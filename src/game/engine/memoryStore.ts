import type { AttemptMode } from "../service/types";
import { StoreConflict, submitSteps, type Guess, type NewAccount, type AttemptRow, type BoardTotal, type PlayerInfo, type Purchase, type Store, type Suggestion, type SuggestionStatus, type AdminStats, type AdminLogEntry, type AnswerEdit, type LiveAttempt, type GrowthRow, type PromptBaseline, type TopicSegment } from "./store";

export interface MemoryData {
  players: Record<
    string,
    {
      name: string;
      username?: string;
      passwordHash?: string | null;
      email?: string | null;
      isAdmin?: boolean;
      unlimited?: boolean;
      googleSub?: string | null;
      emailVerified?: boolean;
      marketing?: boolean;
      accountCreatedAt?: number;
    }
  >;
  verifications?: Record<string, { playerId: string; email: string; expiresAt: number }>;
  purchases?: Record<string, Purchase & { status: "paid" | "refunded" }>;
  sessions?: Record<string, { playerId: string; expiresAt: number }>;
  resets?: Record<string, { playerId: string; expiresAt: number }>;
  attempts: Record<string, AttemptRow>;
  answers: Record<string, string[]>;
  rejects: Record<string, string[]>;
  suggestions?: Suggestion[];
  adminLog?: AdminLogEntry[];
  answerEdits?: AnswerEdit[];
}

const empty = (): MemoryData => ({ players: {}, attempts: {}, answers: {}, rejects: {} });

// In-process store. Used by tests, by `next dev` without Supabase, and
// (via BrowserStore) by the offline preview. Not shared between server
// instances, so never rely on it in production.
export class MemoryStore implements Store {
  protected data: MemoryData;

  // devAdmins: usernames that become admins when they sign up (local dev only)
  constructor(
    data?: MemoryData,
    private devAdmins: string[] = [],
  ) {
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
    return p
      ? {
          id,
          username: p.username ?? null,
          isAdmin: !!p.isAdmin,
          email: p.email ?? null,
          unlimited: !!p.unlimited,
          emailVerified: !!p.email && !!p.emailVerified,
          google: !!p.googleSub,
          hasPassword: !!p.passwordHash,
          marketing: !!p.marketing,
        }
      : null;
  }

  async claimAccount(id: string, a: NewAccount) {
    const lower = a.username.toLowerCase();
    if (Object.values(this.data.players).some((p) => p.username?.toLowerCase() === lower)) throw new StoreConflict();
    if (a.googleSub && Object.values(this.data.players).some((p) => p.googleSub === a.googleSub)) throw new StoreConflict();
    const p = (this.data.players[id] ??= { name: "" });
    if (p.username) throw new StoreConflict();
    Object.assign(p, {
      username: a.username,
      passwordHash: a.passwordHash,
      email: a.email,
      googleSub: a.googleSub ?? null,
      emailVerified: !!a.email && !!a.emailVerified,
      marketing: !!a.marketing,
      accountCreatedAt: Date.now(),
    });
    if (this.devAdmins.includes(lower)) p.isAdmin = true;
    this.changed();
  }

  async findByGoogle(sub: string) {
    const hit = Object.entries(this.data.players).find(([, p]) => p.googleSub === sub && p.username);
    return hit ? { playerId: hit[0], username: hit[1].username! } : null;
  }

  async linkGoogle(playerId: string, sub: string) {
    if (Object.entries(this.data.players).some(([id, p]) => p.googleSub === sub && id !== playerId)) throw new StoreConflict();
    const p = this.data.players[playerId];
    if (p) p.googleSub = sub;
    this.changed();
  }

  async emailInUse(email: string, exceptPlayerId?: string) {
    const e = email.toLowerCase();
    return Object.entries(this.data.players).some(([id, p]) => id !== exceptPlayerId && !!p.username && (p.email ?? "").toLowerCase() === e);
  }

  async createEmailVerification(tokenHash: string, playerId: string, email: string, expiresAt: number) {
    (this.data.verifications ??= {})[tokenHash] = { playerId, email, expiresAt };
    this.changed();
  }

  async useEmailVerification(tokenHash: string, now: number) {
    const v = this.data.verifications?.[tokenHash];
    if (!v) return null;
    delete this.data.verifications![tokenHash];
    this.changed();
    return v.expiresAt > now ? { playerId: v.playerId, email: v.email } : null;
  }

  async markEmailVerified(playerId: string, email: string) {
    const p = this.data.players[playerId];
    if (!p || (p.email ?? "").toLowerCase() !== email.toLowerCase()) return false;
    p.emailVerified = true;
    this.changed();
    return true;
  }

  async setMarketing(playerId: string, on: boolean) {
    const p = this.data.players[playerId];
    if (p) p.marketing = on;
    this.changed();
  }

  async findAccount(username: string) {
    const lower = username.toLowerCase();
    const hit = Object.entries(this.data.players).find(([, p]) => p.username?.toLowerCase() === lower);
    return hit && hit[1].passwordHash ? { playerId: hit[0], username: hit[1].username!, passwordHash: hit[1].passwordHash as string } : null;
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
    for (const [k, v] of Object.entries(this.data.verifications ?? {})) if (v.playerId === playerId) delete this.data.verifications![k];
    delete this.data.players[playerId];
    this.changed();
  }

  async findByLogin(login: string) {
    const l = login.trim().toLowerCase();
    const hit = Object.entries(this.data.players).find(([, p]) => p.username && (p.username.toLowerCase() === l || (p.email ?? "").toLowerCase() === l));
    return hit ? { playerId: hit[0], username: hit[1].username!, email: hit[1].email ?? null } : null;
  }

  async setEmail(playerId: string, email: string | null, verified = false) {
    const p = this.data.players[playerId];
    if (p) {
      if ((p.email ?? null) !== email || verified) p.emailVerified = !!email && verified;
      p.email = email;
    }
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

  async listFinishedAttempts(playerId: string) {
    return Object.values(this.data.attempts)
      .filter((a) => a.playerId === playerId && a.finishedAt !== null)
      .sort((a, b) => a.startedAt - b.startedAt)
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

  async listAnswersMany(ids: string[]) {
    return new Map(ids.map((id) => [id, [...(this.data.answers[id] ?? [])]]));
  }

  async listRejectsMany(ids: string[]) {
    return new Map(ids.map((id) => [id, [...(this.data.rejects[id] ?? [])]]));
  }

  submitGuess(g: Guess) {
    return submitSteps(this, g);
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
    const list = (this.data.suggestions ??= []);
    list.push({ ...s, id: list.length + 1, status: "new" });
    this.changed();
  }

  async listSuggestions(limit: number) {
    return [...(this.data.suggestions ?? [])].reverse().slice(0, limit);
  }

  async setSuggestionStatus(id: number, status: SuggestionStatus, by: string, at: number) {
    const s = this.data.suggestions?.find((x) => x.id === id);
    if (!s) return null;
    Object.assign(s, { status, updatedBy: by, updatedAt: at });
    this.changed();
    return s.text;
  }

  async adminStats(day: number): Promise<AdminStats> {
    const ps = Object.values(this.data.players);
    const ranked = Object.values(this.data.attempts).filter((a) => a.day === day && a.mode === "ranked");
    return {
      players: ps.length,
      accounts: ps.filter((p) => p.username).length,
      unlimited: ps.filter((p) => p.unlimited).length,
      diggersToday: ranked.filter((a) => a.level === 1).length,
      finishedToday: ranked.filter((a) => a.level === 3 && a.finishedAt !== null).length,
    };
  }

  async growth(launchMs: number, fromDay: number, toDay: number): Promise<GrowthRow[]> {
    const dayOf = (t: number) => Math.floor((t - launchMs) / 86_400_000) + 1;
    const act = new Map<string, Set<number>>();
    for (const a of Object.values(this.data.attempts)) {
      const set = act.get(a.playerId) ?? new Set<number>();
      set.add(dayOf(a.startedAt));
      act.set(a.playerId, set);
    }
    const first = new Map([...act].map(([pid, ds]) => [pid, Math.min(...ds)]));
    const attempts = Object.values(this.data.attempts);
    const rows: GrowthRow[] = [];
    for (let day = fromDay; day <= toDay; day++) {
      const cohort = [...first].filter(([, d0]) => d0 === day).map(([pid]) => pid);
      rows.push({
        day,
        players: [...act.values()].filter((ds) => ds.has(day)).length,
        newPlayers: cohort.length,
        accounts: Object.values(this.data.players).filter((p) => p.accountCreatedAt !== undefined && dayOf(p.accountCreatedAt) === day).length,
        rankedStarted: attempts.filter((a) => a.day === day && a.mode === "ranked" && a.level === 1).length,
        rankedFinished: attempts.filter((a) => a.day === day && a.mode === "ranked" && a.level === 3 && a.finishedAt !== null).length,
        backD1: cohort.filter((pid) => act.get(pid)!.has(day + 1)).length,
        backD7: cohort.filter((pid) => act.get(pid)!.has(day + 7)).length,
      });
    }
    return rows;
  }

  async promptBaselines(): Promise<PromptBaseline[]> {
    const by = new Map<string, PromptBaseline>();
    for (const a of Object.values(this.data.attempts)) {
      if (a.finishedAt === null || a.points === null) continue;
      const k = `${a.slug}|${a.level}`;
      const b = by.get(k) ?? { slug: a.slug, level: a.level, avgPoints: 0, plays: 0 };
      b.avgPoints = (b.avgPoints * b.plays + a.points) / (b.plays + 1);
      b.plays++;
      by.set(k, b);
    }
    return [...by.values()];
  }

  async topicSegments(topics: Record<string, string>, minPlays: number): Promise<TopicSegment[]> {
    const base = new Map((await this.promptBaselines()).filter((b) => b.avgPoints > 0).map((b) => [`${b.slug}|${b.level}`, b.avgPoints]));
    const per = new Map<string, Map<string, { n: number; sum: number }>>();
    for (const a of Object.values(this.data.attempts)) {
      const avg = a.finishedAt !== null && a.points !== null ? base.get(`${a.slug}|${a.level}`) : undefined;
      if (avg === undefined) continue;
      const t = topics[a.slug] ?? "other";
      const m = per.get(a.playerId) ?? new Map();
      const x = m.get(t) ?? { n: 0, sum: 0 };
      x.n++;
      x.sum += a.points! / avg;
      m.set(t, x);
      per.set(a.playerId, m);
    }
    const plays = new Map<string, number>();
    const players = new Map<string, number>();
    for (const m of per.values()) {
      let best: [string, number] | null = null;
      for (const [t, x] of m) {
        plays.set(t, (plays.get(t) ?? 0) + x.n);
        const r = x.sum / x.n;
        if (x.n >= minPlays && (!best || r > best[1] || (r === best[1] && t < best[0]))) best = [t, r];
      }
      if (best) players.set(best[0], (players.get(best[0]) ?? 0) + 1);
    }
    return [...plays]
      .map(([topic, n]) => ({ topic, plays: n, players: players.get(topic) ?? 0 }))
      .sort((a, b) => b.plays - a.plays || a.topic.localeCompare(b.topic));
  }

  async listAdmins() {
    return Object.entries(this.data.players)
      .filter(([, p]) => p.isAdmin && p.username)
      .map(([id, p]) => ({ id, username: p.username! }));
  }

  async setAdminByUsername(username: string, admin: boolean) {
    const hit = Object.entries(this.data.players).find(([, p]) => p.username?.toLowerCase() === username.toLowerCase());
    if (!hit) return null;
    hit[1].isAdmin = admin;
    this.changed();
    return hit[0];
  }

  async addAdminLog(e: AdminLogEntry) {
    (this.data.adminLog ??= []).push(e);
    this.changed();
  }

  async listAdminLog(limit: number) {
    return [...(this.data.adminLog ?? [])].reverse().slice(0, limit);
  }

  async recentAttempts(since: number, limit: number): Promise<LiveAttempt[]> {
    return Object.values(this.data.attempts)
      .filter((a) => a.startedAt >= since)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit)
      .map((a) => ({ playerId: a.playerId, level: a.level, mode: a.mode, slug: a.slug, startedAt: a.startedAt, expiresAt: a.expiresAt, finishedAt: a.finishedAt }));
  }

  async listAnswerEdits(slug: string) {
    return (this.data.answerEdits ?? []).filter((e) => e.slug === slug).map((e) => ({ ...e, aliases: [...e.aliases] }));
  }

  async putAnswerEdit(e: AnswerEdit) {
    const list = (this.data.answerEdits ??= []).filter((x) => !(x.slug === e.slug && x.key === e.key));
    list.push({ ...e, aliases: [...e.aliases] });
    this.data.answerEdits = list;
    this.changed();
  }

  async deleteAnswerEdit(slug: string, key: string) {
    this.data.answerEdits = (this.data.answerEdits ?? []).filter((x) => !(x.slug === slug && x.key === key));
    this.changed();
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
