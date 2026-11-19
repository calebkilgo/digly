import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StoreConflict, submitSteps, type Guess, type GuessOutcome, type NewAccount, type AttemptRow, type BoardTotal, type PlayerInfo, type Purchase, type Store, type Suggestion, type SuggestionStatus, type AdminStats, type AdminLogEntry, type AnswerEdit, type LiveAttempt, type GrowthRow, type PromptBaseline, type TopicSegment } from "@/game/engine/store";
import { GameError, type AttemptMode, type LevelNo } from "@/game/service/types";

interface DbAttempt {
  id: string;
  player_id: string;
  day: number;
  level: number;
  mode: AttemptMode;
  slug: string;
  started_at: number | string;
  expires_at: number | string;
  finished_at: number | string | null;
  score: number | null;
  points: number | null;
  unique_count: number;
  submissions: number;
}

const COLS = "id,player_id,day,level,mode,slug,started_at,expires_at,finished_at,score,points,unique_count,submissions";

// bigint columns can come back as strings
const num = (v: number | string) => Number(v);

function fromDb(r: DbAttempt): AttemptRow {
  return {
    id: r.id,
    playerId: r.player_id,
    day: r.day,
    level: r.level as LevelNo,
    mode: r.mode,
    slug: r.slug,
    startedAt: num(r.started_at),
    expiresAt: num(r.expires_at),
    finishedAt: r.finished_at === null ? null : num(r.finished_at),
    score: r.score,
    points: r.points,
    uniqueCount: r.unique_count,
    submissions: r.submissions,
  };
}

// Small per-instance cache. Vercel keeps an instance warm between requests, so
// a player's next call usually skips the trip. Writes made here clear it, and
// other instances catch up within the TTL.
class Ttl<V> {
  private m = new Map<string, { v: V; until: number }>();
  constructor(private ms: number, private max = 20_000) {}
  get(k: string) {
    const hit = this.m.get(k);
    if (!hit) return undefined;
    if (hit.until < Date.now()) {
      this.m.delete(k);
      return undefined;
    }
    return hit.v;
  }
  set(k: string, v: V) {
    if (this.m.size >= this.max) this.m.clear();
    this.m.set(k, { v, until: Date.now() + this.ms });
  }
  delete(k: string) {
    this.m.delete(k);
  }
  deleteWhere(f: (v: V) => boolean) {
    for (const [k, e] of this.m) if (f(e.v)) this.m.delete(k);
  }
}

// PostgREST and Postgres codes for "no such function"
const missingFn = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";
// "no such column" or table: a migration hasn't been run yet
const missingCol = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204" || e?.code === "42P01" || e?.code === "PGRST205";
const LEGACY_PLAYER = "id,username,is_admin,email,unlimited";
const PLAYER_COLS = `${LEGACY_PLAYER},password_hash,google_sub,email_verified_at,marketing_opt_in`;

function check<T>(res: { data: T; error: { code?: string; message: string } | null }): T {
  if (res.error) throw new Error(`supabase: ${res.error.message}`);
  return res.data;
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;
  private sessions = new Ttl<string>(60_000);
  private players = new Ttl<PlayerInfo | null>(15_000);
  private known = new Set<string>(); // player rows we know exist
  private oneTripSubmit = true; // off if migration 0011 hasn't been run yet
  private accounts12 = true; // off until migration 0012 (Google, verified email) is run

  private noMigration12(e: unknown) {
    this.accounts12 = false;
    console.warn("digly: run supabase/migrations/0012_accounts.sql for Google sign-in and email verification.", e);
  }

  private need12() {
    if (!this.accounts12) throw new GameError("not_open", "This needs a database update first (migration 0012).");
  }

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async ensurePlayer(id: string) {
    if (this.known.has(id)) return;
    check(await this.db.from("players").upsert({ id }, { onConflict: "id", ignoreDuplicates: true }));
    if (this.known.size > 50_000) this.known.clear();
    this.known.add(id);
    // a cached "no such player" is wrong now
    if (this.players.get(id) === null) this.players.delete(id);
  }

  async getPlayer(id: string, opts?: { fresh?: boolean }): Promise<PlayerInfo | null> {
    if (!opts?.fresh) {
      const hit = this.players.get(id);
      if (hit !== undefined) return hit && { ...hit };
    }
    let res = await this.db.from("players").select(this.accounts12 ? PLAYER_COLS : LEGACY_PLAYER).eq("id", id).maybeSingle();
    if (res.error && missingCol(res.error) && this.accounts12) {
      this.noMigration12(res.error);
      res = await this.db.from("players").select(LEGACY_PLAYER).eq("id", id).maybeSingle();
    }
    const data = check(res) as Record<string, unknown> | null;
    const p = data
      ? {
          id: data.id as string,
          username: (data.username as string | null) ?? null,
          isAdmin: data.is_admin === true,
          email: (data.email as string | null) ?? null,
          unlimited: data.unlimited === true,
          emailVerified: !!data.email && !!data.email_verified_at,
          google: !!data.google_sub,
          // only whether one is set; the hash itself never leaves this method
          hasPassword: this.accounts12 ? !!data.password_hash : true,
          marketing: data.marketing_opt_in === true,
        }
      : null;
    this.players.set(id, p);
    if (p) this.known.add(id);
    return p && { ...p };
  }

  async claimAccount(id: string, a: NewAccount) {
    const now = new Date().toISOString();
    const base: Record<string, unknown> = { username: a.username, password_hash: a.passwordHash, email: a.email, account_created_at: now };
    // a Google account can't exist without 0012; the opt-in and verified flag just wait for it
    if (a.googleSub) this.need12();
    const full = () => ({
      ...base,
      google_sub: a.googleSub ?? null,
      email_verified_at: a.email && a.emailVerified ? now : null,
      marketing_opt_in: !!a.marketing,
      marketing_opt_in_at: a.marketing ? now : null,
    });
    const claim = (row: Record<string, unknown>) => this.db.from("players").update(row).eq("id", id).is("username", null).select("id");
    let res = await claim(this.accounts12 ? full() : base);
    if (res.error && missingCol(res.error) && this.accounts12) {
      this.noMigration12(res.error);
      if (a.googleSub) this.need12();
      res = await claim(base);
    }
    if (res.error?.code === "23505") throw new StoreConflict();
    const rows = check(res);
    if (!rows || rows.length === 0) throw new StoreConflict();
    this.players.delete(id);
  }

  async findAccount(username: string) {
    // ilike for case-insensitive equality; escape its wildcards (usernames allow _)
    const pattern = username.replace(/[\\%_]/g, "\\$&");
    const data = check(await this.db.from("players").select("id,username,password_hash").ilike("username", pattern).limit(1).maybeSingle());
    if (!data || !data.password_hash) return null;
    return { playerId: data.id as string, username: data.username as string, passwordHash: data.password_hash as string };
  }

  async createSession(tokenHash: string, playerId: string, expiresAt: number) {
    check(await this.db.from("sessions").insert({ token_hash: tokenHash, player_id: playerId, expires_at: new Date(expiresAt).toISOString() }));
  }

  async sessionPlayer(tokenHash: string, now: number) {
    const hit = this.sessions.get(tokenHash);
    if (hit) return hit;
    const data = check(
      await this.db.from("sessions").select("player_id").eq("token_hash", tokenHash).gt("expires_at", new Date(now).toISOString()).maybeSingle(),
    );
    if (!data) return null;
    this.sessions.set(tokenHash, data.player_id as string);
    return data.player_id as string;
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
    check(await this.db.from("sessions").delete().eq("token_hash", tokenHash));
  }

  async deleteSessionsFor(playerId: string) {
    this.sessions.deleteWhere((pid) => pid === playerId);
    check(await this.db.from("sessions").delete().eq("player_id", playerId));
  }

  async grantUnlimited(p: Purchase) {
    // upsert on the session id, so a repeated webhook is harmless
    check(
      await this.db.from("purchases").upsert(
        {
          id: p.id,
          player_id: p.playerId,
          product: p.product,
          amount: p.amount,
          currency: p.currency,
          payment_intent: p.paymentIntent,
          terms_version: p.termsVersion ?? null,
          terms_accepted_at: p.termsAcceptedAt ? new Date(p.termsAcceptedAt).toISOString() : null,
          status: "paid",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      ),
    );
    check(await this.db.from("players").update({ unlimited: true, unlimited_at: new Date().toISOString() }).eq("id", p.playerId));
    this.players.delete(p.playerId);
  }

  async revokeByPaymentIntent(pi: string) {
    const rows = check(
      await this.db.from("purchases").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("payment_intent", pi).select("player_id"),
    ) as { player_id: string | null }[];
    const pid = rows?.[0]?.player_id;
    if (!pid) return null;
    const paid = check(await this.db.from("purchases").select("id").eq("player_id", pid).eq("status", "paid").limit(1)) as unknown[];
    if (!paid.length) check(await this.db.from("players").update({ unlimited: false }).eq("id", pid));
    this.players.delete(pid);
    return pid;
  }

  async deletePlayer(playerId: string) {
    // attempts, answers, rejects, sessions and reset links go with it (on delete cascade)
    check(await this.db.from("players").delete().eq("id", playerId));
    this.players.delete(playerId);
    this.known.delete(playerId);
    this.sessions.deleteWhere((pid) => pid === playerId);
  }

  async findByLogin(login: string) {
    const l = login.trim();
    const esc = l.replace(/[\\%_]/g, "\\$&");
    const col = l.includes("@") ? "email" : "username";
    const data = check(await this.db.from("players").select("id,username,email").ilike(col, esc).not("username", "is", null).limit(1).maybeSingle());
    return data ? { playerId: data.id as string, username: data.username as string, email: (data.email as string | null) ?? null } : null;
  }

  async setEmail(playerId: string, email: string | null, verified = false) {
    const row: Record<string, unknown> = { email };
    if (this.accounts12) {
      // a changed address starts unverified; the same address keeps its state
      const cur = await this.getPlayer(playerId, { fresh: true });
      if (verified || (cur?.email ?? null) !== email) row.email_verified_at = email && verified ? new Date().toISOString() : null;
    }
    check(await this.db.from("players").update(row).eq("id", playerId));
    this.players.delete(playerId);
  }

  async findByGoogle(sub: string) {
    if (!this.accounts12) return null;
    const res = await this.db.from("players").select("id,username").eq("google_sub", sub).not("username", "is", null).limit(1).maybeSingle();
    if (res.error && missingCol(res.error)) {
      this.noMigration12(res.error);
      return null;
    }
    const data = check(res);
    return data ? { playerId: data.id as string, username: data.username as string } : null;
  }

  async linkGoogle(playerId: string, sub: string) {
    this.need12();
    const res = await this.db.from("players").update({ google_sub: sub }).eq("id", playerId);
    if (res.error?.code === "23505") throw new StoreConflict();
    check(res);
    this.players.delete(playerId);
  }

  async emailInUse(email: string, exceptPlayerId?: string) {
    let q = this.db.from("players").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).not("username", "is", null).limit(1);
    if (exceptPlayerId) q = q.neq("id", exceptPlayerId);
    const data = check(await q);
    return (data as unknown[]).length > 0;
  }

  async createEmailVerification(tokenHash: string, playerId: string, email: string, expiresAt: number) {
    this.need12();
    check(await this.db.from("email_verifications").insert({ token_hash: tokenHash, player_id: playerId, email, expires_at: new Date(expiresAt).toISOString() }));
  }

  async useEmailVerification(tokenHash: string, now: number) {
    this.need12();
    const data = check(await this.db.from("email_verifications").delete().eq("token_hash", tokenHash).select("player_id,email,expires_at"));
    const row = (data as { player_id: string; email: string; expires_at: string }[] | null)?.[0];
    if (!row) return null;
    return new Date(row.expires_at).getTime() > now ? { playerId: row.player_id, email: row.email } : null;
  }

  async markEmailVerified(playerId: string, email: string) {
    this.need12();
    const data = check(
      await this.db.from("players").update({ email_verified_at: new Date().toISOString() }).eq("id", playerId).ilike("email", email.replace(/[\\%_]/g, "\\$&")).select("id"),
    );
    this.players.delete(playerId);
    return (data as unknown[]).length > 0;
  }

  async setMarketing(playerId: string, on: boolean) {
    this.need12();
    check(await this.db.from("players").update({ marketing_opt_in: on, marketing_opt_in_at: on ? new Date().toISOString() : null }).eq("id", playerId));
    this.players.delete(playerId);
  }

  async setPassword(playerId: string, passwordHash: string) {
    check(await this.db.from("players").update({ password_hash: passwordHash }).eq("id", playerId));
  }

  async createReset(tokenHash: string, playerId: string, expiresAt: number) {
    check(await this.db.from("password_resets").insert({ token_hash: tokenHash, player_id: playerId, expires_at: new Date(expiresAt).toISOString() }));
  }

  async useReset(tokenHash: string, now: number) {
    // delete-and-return makes the link single use even with two clicks at once
    const data = check(await this.db.from("password_resets").delete().eq("token_hash", tokenHash).select("player_id,expires_at"));
    const row = (data as { player_id: string; expires_at: string }[] | null)?.[0];
    if (!row) return null;
    return new Date(row.expires_at).getTime() > now ? row.player_id : null;
  }

  async deleteAttempts(playerId: string, day: number | null) {
    let q = this.db.from("attempts").delete().eq("player_id", playerId);
    if (day !== null) q = q.eq("day", day).eq("mode", "ranked");
    check(await q);
  }

  async answerStats(slug: string, beforeDay: number) {
    const data = check(await this.db.rpc("digly_answer_stats", { p_slug: slug, p_before_day: beforeDay })) as {
      plays: number | string;
      counts: Record<string, number | string>;
    } | null;
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(data?.counts ?? {})) counts[k] = Number(v);
    return { plays: Number(data?.plays ?? 0), counts };
  }

  async addSuggestion(s: Suggestion) {
    check(
      await this.db.from("prompt_suggestions").insert({
        player_id: s.playerId,
        text: s.text,
        day: s.day,
        created_at: new Date(s.createdAt).toISOString(),
      }),
    );
  }

  async listSuggestions(limit: number) {
    const data = check(
      await this.db
        .from("prompt_suggestions")
        .select("id, player_id, text, day, created_at, status, updated_by, updated_at")
        .order("created_at", { ascending: false })
        .limit(limit),
    );
    type Row = { id: number; player_id: string | null; text: string; day: number; created_at: string; status: SuggestionStatus; updated_by: string | null; updated_at: string | null };
    return (data as Row[]).map((r) => ({
      id: Number(r.id),
      playerId: r.player_id,
      text: r.text,
      day: r.day,
      createdAt: Date.parse(r.created_at),
      status: r.status,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at ? Date.parse(r.updated_at) : null,
    }));
  }

  async setSuggestionStatus(id: number, status: SuggestionStatus, by: string, at: number) {
    const data = check(
      await this.db
        .from("prompt_suggestions")
        .update({ status, updated_by: by, updated_at: new Date(at).toISOString() })
        .eq("id", id)
        .select("text"),
    );
    return (data as { text: string }[])[0]?.text ?? null;
  }

  async adminStats(day: number): Promise<AdminStats> {
    const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const r = await q;
      if (r.error) throw new Error(`supabase: ${r.error.message}`);
      return r.count ?? 0;
    };
    const head = { count: "exact" as const, head: true };
    const [players, accounts, unlimited, diggersToday, finishedToday] = await Promise.all([
      count(this.db.from("players").select("id", head)),
      count(this.db.from("players").select("id", head).not("username", "is", null)),
      count(this.db.from("players").select("id", head).eq("unlimited", true)),
      count(this.db.from("attempts").select("id", head).eq("day", day).eq("mode", "ranked").eq("level", 1)),
      count(this.db.from("attempts").select("id", head).eq("day", day).eq("mode", "ranked").eq("level", 3).not("finished_at", "is", null)),
    ]);
    return { players, accounts, unlimited, diggersToday, finishedToday };
  }

  // the 0013 functions; a clear message instead of a 500 until it's run
  private async rpc0013<T>(fn: string, args: Record<string, unknown>) {
    const res = await this.db.rpc(fn, args);
    if (res.error && (res.error.code === "PGRST202" || res.error.code === "42883"))
      throw new GameError("not_open", "Run supabase/migrations/0013_growth_topics.sql to see these numbers.");
    return (check(res) ?? []) as T[];
  }

  async growth(launchMs: number, fromDay: number, toDay: number): Promise<GrowthRow[]> {
    const rows = await this.rpc0013<Record<string, number>>("digly_growth", { p_launch_ms: launchMs, p_from: fromDay, p_to: toDay });
    return rows.map((r) => ({
      day: r.day,
      players: r.players,
      newPlayers: r.new_players,
      accounts: r.accounts,
      rankedStarted: r.ranked_started,
      rankedFinished: r.ranked_finished,
      backD1: r.back_d1,
      backD7: r.back_d7,
    }));
  }

  async promptBaselines(): Promise<PromptBaseline[]> {
    const rows = await this.rpc0013<{ slug: string; level: number; avg_points: number; plays: number }>("digly_prompt_baselines", {});
    return rows.map((r) => ({ slug: r.slug, level: r.level, avgPoints: Number(r.avg_points), plays: r.plays }));
  }

  async topicSegments(topics: Record<string, string>, minPlays: number): Promise<TopicSegment[]> {
    return this.rpc0013<TopicSegment>("digly_topic_segments", { p_topics: topics, p_min_plays: minPlays });
  }

  async listAdmins() {
    const data = check(await this.db.from("players").select("id, username").eq("is_admin", true).not("username", "is", null).order("username"));
    return (data as { id: string; username: string }[]).map((r) => ({ id: r.id, username: r.username }));
  }

  async setAdminByUsername(username: string, admin: boolean) {
    const pattern = username.replace(/[\\%_]/g, "\\$&");
    const hit = check(await this.db.from("players").select("id").ilike("username", pattern).limit(1).maybeSingle());
    if (!hit) return null;
    check(await this.db.from("players").update({ is_admin: admin }).eq("id", hit.id));
    this.players.delete(hit.id as string);
    return hit.id as string;
  }

  async addAdminLog(e: AdminLogEntry) {
    check(await this.db.from("admin_log").insert({ actor: e.actor, action: e.action, detail: e.detail, created_at: new Date(e.at).toISOString() }));
  }

  async listAdminLog(limit: number) {
    const data = check(await this.db.from("admin_log").select("actor, action, detail, created_at").order("created_at", { ascending: false }).limit(limit));
    return (data as { actor: string; action: string; detail: string; created_at: string }[]).map((r) => ({
      actor: r.actor,
      action: r.action,
      detail: r.detail,
      at: Date.parse(r.created_at),
    }));
  }

  async recentAttempts(since: number, limit: number): Promise<LiveAttempt[]> {
    const data = check(
      await this.db
        .from("attempts")
        .select("player_id, level, mode, slug, started_at, expires_at, finished_at")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(limit),
    );
    type Row = { player_id: string; level: number; mode: AttemptMode; slug: string; started_at: number | string; expires_at: number | string; finished_at: number | string | null };
    return (data as Row[]).map((r) => ({
      playerId: r.player_id,
      level: r.level as LevelNo,
      mode: r.mode,
      slug: r.slug,
      startedAt: Number(r.started_at),
      expiresAt: Number(r.expires_at),
      finishedAt: r.finished_at === null ? null : Number(r.finished_at),
    }));
  }

  async listAnswerEdits(slug: string) {
    const data = check(await this.db.from("answer_edits").select("slug, key, action, name, aliases, rating, actor, updated_at").eq("slug", slug));
    return (data as { slug: string; key: string; action: "add" | "remove"; name: string; aliases: string[] | null; rating: number; actor: string; updated_at: string }[]).map((r) => ({
      slug: r.slug,
      key: r.key,
      action: r.action,
      name: r.name,
      aliases: r.aliases ?? [],
      rating: Number(r.rating),
      actor: r.actor,
      at: Date.parse(r.updated_at),
    }));
  }

  async putAnswerEdit(e: AnswerEdit) {
    check(
      await this.db.from("answer_edits").upsert(
        { slug: e.slug, key: e.key, action: e.action, name: e.name, aliases: e.aliases, rating: e.rating, actor: e.actor, updated_at: new Date(e.at).toISOString() },
        { onConflict: "slug,key" },
      ),
    );
  }

  async deleteAnswerEdit(slug: string, key: string) {
    check(await this.db.from("answer_edits").delete().eq("slug", slug).eq("key", key));
  }

  async topRejects(slug: string, limit: number) {
    const data = check(await this.db.rpc("digly_top_rejects", { p_slug: slug, p_limit: limit }));
    return (data as { text: string; n: number | string }[]).map((r) => ({ text: r.text, n: Number(r.n) }));
  }

  async insertAttempt(row: AttemptRow) {
    const res = await this.db.from("attempts").insert({
      id: row.id,
      player_id: row.playerId,
      day: row.day,
      level: row.level,
      mode: row.mode,
      slug: row.slug,
      started_at: row.startedAt,
      expires_at: row.expiresAt,
    });
    if (res.error?.code === "23505") throw new StoreConflict();
    check(res);
  }

  async getAttempt(id: string) {
    const data = check(await this.db.from("attempts").select(COLS).eq("id", id).maybeSingle());
    return data ? fromDb(data as DbAttempt) : null;
  }

  async listAttempts(playerId: string, day: number, mode: AttemptMode) {
    const data = check(await this.db.from("attempts").select(COLS).eq("player_id", playerId).eq("day", day).eq("mode", mode));
    return (data as DbAttempt[]).map(fromDb);
  }

  async listFinishedAttempts(playerId: string) {
    const data = check(
      await this.db.from("attempts").select(COLS).eq("player_id", playerId).not("finished_at", "is", null).order("started_at").limit(5000),
    );
    return (data as DbAttempt[]).map(fromDb);
  }

  async bumpSubmissions(id: string) {
    const data = check(await this.db.rpc("digly_bump_submissions", { p_id: id }));
    return data === null ? Infinity : Number(data);
  }

  async addAnswer(attemptId: string, answerId: string) {
    const res = await this.db.from("attempt_answers").insert({ attempt_id: attemptId, answer_id: answerId });
    if (res.error?.code === "23505") return false;
    check(res);
    return true;
  }

  async listAnswers(attemptId: string) {
    const data = check(await this.db.from("attempt_answers").select("answer_id").eq("attempt_id", attemptId).order("seq"));
    return (data as { answer_id: string }[]).map((r) => r.answer_id);
  }

  async addReject(attemptId: string, text: string) {
    const res = await this.db.from("attempt_rejects").insert({ attempt_id: attemptId, text });
    if (res.error && res.error.code !== "23505") check(res);
  }

  async listRejects(attemptId: string) {
    const data = check(await this.db.from("attempt_rejects").select("text").eq("attempt_id", attemptId).order("seq").limit(200));
    return (data as { text: string }[]).map((r) => r.text);
  }

  async listAnswersMany(ids: string[]) {
    const out = new Map<string, string[]>(ids.map((id) => [id, []]));
    if (!ids.length) return out;
    const data = check(await this.db.from("attempt_answers").select("attempt_id,answer_id").in("attempt_id", ids).order("seq"));
    for (const r of data as { attempt_id: string; answer_id: string }[]) out.get(r.attempt_id)?.push(r.answer_id);
    return out;
  }

  async listRejectsMany(ids: string[]) {
    const out = new Map<string, string[]>(ids.map((id) => [id, []]));
    if (!ids.length) return out;
    const data = check(await this.db.from("attempt_rejects").select("attempt_id,text").in("attempt_id", ids).order("seq").limit(200 * ids.length));
    for (const r of data as { attempt_id: string; text: string }[]) {
      const list = out.get(r.attempt_id);
      if (list && list.length < 200) list.push(r.text);
    }
    return out;
  }

  async submitGuess(g: Guess): Promise<GuessOutcome> {
    if (this.oneTripSubmit) {
      const res = await this.db.rpc("digly_submit", {
        p_id: g.attemptId,
        p_player: g.playerId,
        p_now: g.now,
        p_grace: g.graceMs,
        p_max: g.max,
        p_answer: g.answerId,
        p_text: g.text,
      });
      if (!res.error) return res.data as GuessOutcome;
      if (!missingFn(res.error)) check(res);
      this.oneTripSubmit = false;
      console.warn("digly: digly_submit is missing, run supabase/migrations/0011_speed.sql. Using the slower path for now.");
    }
    return submitSteps(this, g);
  }

  async finishAttempt(id: string, f: { finishedAt: number; score: number; points: number; uniqueCount: number }) {
    const data = check(
      await this.db.rpc("digly_finish_attempt", {
        p_id: id,
        p_finished_at: f.finishedAt,
        p_score: f.score,
        p_points: f.points,
        p_unique: f.uniqueCount,
      }),
    );
    return data === true;
  }

  async dayBoard(day: number, limit: number): Promise<BoardTotal[]> {
    const data = check(await this.db.rpc("digly_day_board", { p_day: day, p_limit: limit }));
    return (data as { player_id: string; name: string; points: number | string; uniq: number | string }[]).map((r) => ({
      playerId: r.player_id,
      name: r.name,
      points: Number(r.points),
      unique: Number(r.uniq),
    }));
  }
}
