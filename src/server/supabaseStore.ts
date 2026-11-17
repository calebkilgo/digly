import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StoreConflict, type AttemptRow, type BoardTotal, type PlayerInfo, type Store } from "@/game/engine/store";
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
    const data = check(await this.db.from("players").select("id,username").eq("id", id).maybeSingle());
    return data ? { id: data.id as string, username: (data.username as string | null) ?? null } : null;
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

  async answerStats(slug: string, beforeDay: number) {
    const data = check(await this.db.rpc("digly_answer_stats", { p_slug: slug, p_before_day: beforeDay })) as {
      plays: number | string;
      counts: Record<string, number | string>;
    } | null;
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(data?.counts ?? {})) counts[k] = Number(v);
    return { plays: Number(data?.plays ?? 0), counts };
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
