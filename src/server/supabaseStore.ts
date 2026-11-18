import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StoreConflict, type AttemptRow, type BoardTotal, type PlayerInfo, type Purchase, type Store, type Suggestion, type SuggestionStatus, type AdminStats, type AdminLogEntry, type AnswerEdit, type LiveAttempt } from "@/game/engine/store";
import type { AttemptMode, LevelNo } from "@/game/service/types";

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

function check<T>(res: { data: T; error: { code?: string; message: string } | null }): T {
  if (res.error) throw new Error(`supabase: ${res.error.message}`);
  return res.data;
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async ensurePlayer(id: string) {
    check(await this.db.from("players").upsert({ id }, { onConflict: "id", ignoreDuplicates: true }));
  }

  async getPlayer(id: string): Promise<PlayerInfo | null> {
    const data = check(await this.db.from("players").select("id,username,is_admin,email,unlimited").eq("id", id).maybeSingle());
    return data
      ? {
          id: data.id as string,
          username: (data.username as string | null) ?? null,
          isAdmin: data.is_admin === true,
          email: (data.email as string | null) ?? null,
          unlimited: data.unlimited === true,
        }
      : null;
  }

  async claimAccount(id: string, a: { username: string; passwordHash: string; email: string | null }) {
    const res = await this.db
      .from("players")
      .update({ username: a.username, password_hash: a.passwordHash, email: a.email, account_created_at: new Date().toISOString() })
      .eq("id", id)
      .is("username", null)
      .select("id");
    if (res.error?.code === "23505") throw new StoreConflict();
    const rows = check(res);
    if (!rows || rows.length === 0) throw new StoreConflict();
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
    const data = check(
      await this.db.from("sessions").select("player_id").eq("token_hash", tokenHash).gt("expires_at", new Date(now).toISOString()).maybeSingle(),
    );
    return data ? (data.player_id as string) : null;
  }

  async deleteSession(tokenHash: string) {
    check(await this.db.from("sessions").delete().eq("token_hash", tokenHash));
  }

  async deleteSessionsFor(playerId: string) {
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
  }

  async revokeByPaymentIntent(pi: string) {
    const rows = check(
      await this.db.from("purchases").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("payment_intent", pi).select("player_id"),
    ) as { player_id: string | null }[];
    const pid = rows?.[0]?.player_id;
    if (!pid) return null;
    const paid = check(await this.db.from("purchases").select("id").eq("player_id", pid).eq("status", "paid").limit(1)) as unknown[];
    if (!paid.length) check(await this.db.from("players").update({ unlimited: false }).eq("id", pid));
    return pid;
  }

  async deletePlayer(playerId: string) {
    // attempts, answers, rejects, sessions and reset links go with it (on delete cascade)
    check(await this.db.from("players").delete().eq("id", playerId));
  }

  async findByLogin(login: string) {
    const l = login.trim();
    const esc = l.replace(/[\\%_]/g, "\\$&");
    const col = l.includes("@") ? "email" : "username";
    const data = check(await this.db.from("players").select("id,username,email").ilike(col, esc).not("username", "is", null).limit(1).maybeSingle());
    return data ? { playerId: data.id as string, username: data.username as string, email: (data.email as string | null) ?? null } : null;
  }

  async setEmail(playerId: string, email: string | null) {
    check(await this.db.from("players").update({ email }).eq("id", playerId));
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
        .select("id"),
    );
    return (data as unknown[]).length > 0;
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

  async listAdmins() {
    const data = check(await this.db.from("players").select("id, username").eq("is_admin", true).not("username", "is", null).order("username"));
    return (data as { id: string; username: string }[]).map((r) => ({ id: r.id, username: r.username }));
  }

  async setAdminByUsername(username: string, admin: boolean) {
    const pattern = username.replace(/[\\%_]/g, "\\$&");
    const hit = check(await this.db.from("players").select("id").ilike("username", pattern).limit(1).maybeSingle());
    if (!hit) return null;
    check(await this.db.from("players").update({ is_admin: admin }).eq("id", hit.id));
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
