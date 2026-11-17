import { AnswerIndex, CORRECTED, parseAnswerBlock, type AnswerRecord } from "../rules/answerIndex";
import { finalScore, topN } from "../rules/scoring";
import { liveRarity, type LiveRarity } from "../rules/rarity";
import { dayNumber, dayStart, formatChallengeNumber } from "../rules/schedule";
import { LEVELS } from "../rules/levels";
import { SEEDS, type ChallengeSeed } from "../data/seeds";
import { slugFor } from "../data/rotation";
import {
  GameError,
  type AttemptMode,
  type AttemptResult,
  type AttemptStart,
  type DayStatus,
  type LevelNo,
  type PublicChallenge,
  type SubmitResult,
  type BoardRow,
} from "../service/types";
import { digSlots } from "../service/slots";
import { StoreConflict, type AttemptRow, type Store } from "./store";

const MAX_SUBMISSIONS = 400; // anti-abuse cap per attempt
const MAX_LEN = 60;
// Submissions travel over the network, so the server accepts a little past
// the clock. The client stops sending at zero on its own.
export const SERVER_GRACE_MS = 1500;

export function seedFor(day: number, level: LevelNo, seeds: ChallengeSeed[] = SEEDS): ChallengeSeed {
  const slug = slugFor(day, level);
  const seed = seeds.find((s) => s.slug === slug);
  if (seed) return seed;
  // custom seed sets in tests: fall back to walking their own pool
  const pool = seeds.filter((s) => s.level === level);
  return pool[(day - 1) % pool.length];
}

interface Indexed {
  index: AnswerIndex;
  byId: Map<string, AnswerRecord>;
}

export class DigEngine {
  private indexes = new Map<string, Indexed>();
  private rarities = new Map<string, Map<string, LiveRarity>>();
  private seq = 0;

  constructor(
    private store: Store,
    private opts: { now?: () => number; seeds?: ChallengeSeed[]; newId?: () => string } = {},
  ) {}

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private newId() {
    if (this.opts.newId) return this.opts.newId();
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `a${this.now().toString(36)}-${++this.seq}`;
  }

  private seeds() {
    return this.opts.seeds ?? SEEDS;
  }

  private indexed(slug: string): Indexed {
    let x = this.indexes.get(slug);
    if (!x) {
      const seed = this.seeds().find((s) => s.slug === slug);
      if (!seed) throw new GameError("not_found", `Unknown challenge ${slug}`);
      const index = new AnswerIndex(parseAnswerBlock(seed.answers, slug));
      x = { index, byId: new Map(index.answers.map((a) => [a.id, a])) };
      this.indexes.set(slug, x);
    }
    return x;
  }

  // Rarity for a category as scored on a given day: built from ranked play on
  // earlier days only, so it never changes while that day is being played.
  async rarity(slug: string, day: number): Promise<Map<string, LiveRarity>> {
    const key = `${slug}:${day}`;
    const hit = this.rarities.get(key);
    if (hit) return hit;
    const { index } = this.indexed(slug);
    let map: Map<string, LiveRarity>;
    try {
      map = liveRarity(index.answers, await this.store.answerStats(slug, day));
    } catch (e) {
      console.error("digly: answer stats failed, using estimates", e);
      return liveRarity(index.answers, null);
    }
    // the day before can still be finishing its last attempts just after midnight
    if (this.now() > dayStart(day) + 3 * 60_000) {
      if (this.rarities.size > 500) this.rarities.clear();
      this.rarities.set(key, map);
    }
    return map;
  }

  storeRef() {
    return this.store;
  }

  today() {
    return dayNumber(this.now());
  }

  challenge(day: number, level: LevelNo, slug?: string): PublicChallenge {
    const seed = (slug && this.seeds().find((s) => s.slug === slug)) || seedFor(day, level, this.seeds());
    const info = LEVELS[level - 1];
    return {
      id: `${day}:${level}:${seed.slug}`,
      day,
      level,
      multiplier: info.mult,
      levelName: info.name,
      scored: info.scored,
      seconds: info.seconds,
      theme: seed.theme,
      number: formatChallengeNumber(day),
      title: seed.title,
      prompt: seed.prompt,
      noun: seed.noun,
      rules: seed.rules,
      opensAt: dayStart(day),
      closesAt: dayStart(day + 1),
      scoringVersion: seed.scoringVersion,
    };
  }

  private checkDay(day: number) {
    if (!Number.isInteger(day) || day < 1) throw new GameError("bad_request", "Bad day");
    if (day > this.today()) throw new GameError("not_open", "That dig hasn't opened yet");
  }

  private expired(row: AttemptRow, now = this.now()) {
    return now > row.expiresAt + SERVER_GRACE_MS;
  }

  // Ranked attempts for a day, with any that ran out of time closed off.
  private async rankedRows(playerId: string, day: number) {
    const rows = await this.store.listAttempts(playerId, day, "ranked");
    for (const r of rows) if (r.finishedAt === null && this.expired(r)) await this.close(r);
    return (await this.store.listAttempts(playerId, day, "ranked")).sort((a, b) => a.level - b.level);
  }

  async status(playerId: string, day: number): Promise<DayStatus> {
    this.checkDay(day);
    const rows = await this.rankedRows(playerId, day);
    const done = rows.filter((r) => r.finishedAt !== null);
    const ranked = await Promise.all(done.map((r) => this.result(r)));
    const finished = new Set(done.map((r) => r.level));
    const next = ([1, 2, 3] as LevelNo[]).find((l) => !finished.has(l)) ?? null;
    return {
      dig: digSlots(day),
      serverNow: this.now(),
      ranked,
      // a dig only takes new ranked levels on its own day
      next: day === this.today() ? next : null,
      total: ranked.reduce((s, r) => s + r.points, 0),
    };
  }

  async start(playerId: string, day: number, level: LevelNo, mode: AttemptMode): Promise<AttemptStart> {
    if (![1, 2, 3].includes(level)) throw new GameError("bad_request", "Bad level");
    if (mode !== "ranked" && mode !== "practice") throw new GameError("bad_request", "Bad mode");
    this.checkDay(day);
    await this.store.ensurePlayer(playerId);
    const now = this.now();
    const ch = this.challenge(day, level);
    const seconds = LEVELS[level - 1].seconds;

    if (mode === "ranked") {
      if (day !== this.today()) throw new GameError("locked", "Ranked digs are for today only");
      const rows = await this.rankedRows(playerId, day);
      const mine = rows.find((r) => r.level === level);
      if (mine) {
        if (mine.finishedAt !== null) throw new GameError("already_played", "You already dug this level today");
        // closed the tab mid-level: pick up where the clock is
        return this.startPayload(mine, this.challenge(day, level, mine.slug), now);
      }
      for (let l = 1; l < level; l++) {
        if (!rows.some((r) => r.level === l && r.finishedAt !== null)) throw new GameError("locked", `Finish level ${l} first`);
      }
    } else {
      const ranked = day === this.today() ? await this.rankedRows(playerId, day) : [];
      const doneToday = ranked.filter((r) => r.finishedAt !== null).length === 3;
      if (day === this.today() && !doneToday) throw new GameError("locked", "Practice opens after the day's ranked dig");
    }

    const row: AttemptRow = {
      id: this.newId(),
      playerId,
      day,
      level,
      mode,
      slug: seedFor(day, level, this.seeds()).slug,
      startedAt: now,
      expiresAt: now + seconds * 1000,
      finishedAt: null,
      score: null,
      points: null,
      uniqueCount: 0,
      submissions: 0,
    };
    try {
      await this.store.insertAttempt(row);
    } catch (e) {
      if (e instanceof StoreConflict) {
        // two tabs raced to start; hand back whichever got in
        const again = (await this.store.listAttempts(playerId, day, "ranked")).find((r) => r.level === level);
        if (again && again.finishedAt === null && !this.expired(again)) return this.startPayload(again, ch, now);
        throw new GameError("already_played", "You already dug this level today");
      }
      throw e;
    }
    return this.startPayload(row, ch, now);
  }

  private async startPayload(row: AttemptRow, ch: PublicChallenge, now: number): Promise<AttemptStart> {
    const { byId } = this.indexed(row.slug);
    const ids = await this.store.listAnswers(row.id);
    return {
      attemptId: row.id,
      challenge: ch,
      mode: row.mode,
      startedAt: row.startedAt,
      expiresAt: row.expiresAt,
      serverNow: now,
      accepted: ids.map((id) => byId.get(id)?.canonical ?? id),
    };
  }

  private async own(playerId: string, attemptId: string) {
    const row = typeof attemptId === "string" && attemptId ? await this.store.getAttempt(attemptId) : null;
    if (!row) throw new GameError("not_found", "Unknown attempt");
    if (row.playerId !== playerId) throw new GameError("forbidden", "Not your attempt");
    return row;
  }

  async submit(playerId: string, attemptId: string, text: string): Promise<SubmitResult> {
    const row = await this.own(playerId, attemptId);
    const count = async () => (await this.store.listAnswers(row.id)).length;
    if (row.finishedAt !== null || this.expired(row)) return { status: "expired", acceptedCount: await count() };
    const trimmed = String(text ?? "").trim().slice(0, MAX_LEN);
    if (!trimmed) return { status: "empty", acceptedCount: await count() };
    if ((await this.store.bumpSubmissions(row.id)) > MAX_SUBMISSIONS) return { status: "rejected", acceptedCount: await count() };

    const match = this.indexed(row.slug).index.lookup(trimmed);
    if (!match) {
      await this.store.addReject(row.id, trimmed);
      return { status: "rejected", acceptedCount: await count() };
    }
    const added = await this.store.addAnswer(row.id, match.answer.id);
    const n = (await this.store.listAnswers(row.id)).length;
    if (!added) return { status: "duplicate", canonical: match.answer.canonical, acceptedCount: n };
    return { status: "accepted", canonical: match.answer.canonical, corrected: CORRECTED.includes(match.kind), acceptedCount: n };
  }

  async finish(playerId: string, attemptId: string): Promise<AttemptResult> {
    const row = await this.own(playerId, attemptId);
    if (row.finishedAt === null) await this.close(row);
    const fresh = (await this.store.getAttempt(row.id))!;
    return this.result(fresh);
  }

  private async close(row: AttemptRow) {
    const { byId } = this.indexed(row.slug);
    const live = await this.rarity(row.slug, row.day);
    const accepted = (await this.store.listAnswers(row.id)).map((id) => byId.get(id)).filter((a): a is AnswerRecord => !!a);
    const info = LEVELS[row.level - 1];
    const score = finalScore(accepted.map((a) => ({ name: a.canonical, rarity: live.get(a.id)!.rarity })), info.scored);
    await this.store.finishAttempt(row.id, {
      finishedAt: Math.min(this.now(), row.expiresAt),
      score,
      points: score * info.mult,
      uniqueCount: accepted.length,
    });
  }

  // Rebuilt from the stored answers every time, so finish() is idempotent.
  private async result(row: AttemptRow): Promise<AttemptResult> {
    const { index, byId } = this.indexed(row.slug);
    const live = await this.rarity(row.slug, row.day);
    const reveal = (a: AnswerRecord) => {
      const l = live.get(a.id)!;
      return l.found === undefined ? { name: a.canonical, rarity: l.rarity } : { name: a.canonical, rarity: l.rarity, pct: l.found };
    };
    const ids = await this.store.listAnswers(row.id);
    const got = new Set(ids);
    const accepted = ids
      .map((id) => byId.get(id))
      .filter((a): a is AnswerRecord => !!a)
      .map(reveal);
    const info = LEVELS[row.level - 1];
    const all = [...index.answers].sort((a, b) => live.get(b.id)!.rarity - live.get(a.id)!.rarity);
    const missed = all.filter((a) => !got.has(a.id) && live.get(a.id)!.rarity >= 56).slice(0, 12);
    // rotate through the rare pool so it isn't always the same few
    const offset = accepted.length % Math.max(1, missed.length);
    const pick = [...missed.slice(offset), ...missed.slice(0, offset)].slice(0, 4);
    const score = row.score ?? finalScore(accepted, info.scored);
    return {
      attemptId: row.id,
      challengeId: `${row.day}:${row.level}:${row.slug}`,
      challenge: this.challenge(row.day, row.level, row.slug),
      mode: row.mode,
      level: row.level,
      multiplier: info.mult,
      score,
      points: row.points ?? score * info.mult,
      top: topN(accepted, info.scored),
      accepted,
      rejected: await this.store.listRejects(row.id),
      missed: pick.map(reveal),
      rarest: all.slice(0, 20).map((a) => ({ ...reveal(a), found: got.has(a.id) })),
      finishedAt: row.finishedAt ?? Math.min(this.now(), row.expiresAt),
    };
  }

  async topRejects(slug: string, limit = 100) {
    return this.store.topRejects(slug, limit);
  }

  async board(playerId: string | null, day: number, limit = 100): Promise<BoardRow[]> {
    this.checkDay(day);
    const rows = await this.store.dayBoard(day, limit);
    // never send player ids: a guest id is also that guest's login cookie
    const out: BoardRow[] = rows.map((r, i) => ({ id: `r${i}`, name: r.name, score: r.points, unique: r.unique, isYou: r.playerId === playerId, posted: true }));
    // a guest sees their own score in place, marked as not posted
    if (playerId && !out.some((r) => r.isYou)) {
      const me = await this.store.getPlayer(playerId);
      const done = (await this.rankedRows(playerId, day)).filter((r) => r.finishedAt !== null);
      if (me && !me.username && done.length) {
        out.push({
          id: "guest",
          name: "Guest",
          score: done.reduce((s, r) => s + (r.points ?? 0), 0),
          unique: done.reduce((s, r) => s + r.uniqueCount, 0),
          isYou: true,
          posted: false,
        });
      }
    }
    return out;
  }

  answerCount(slug: string) {
    return this.indexed(slug).index.answers.length;
  }
}
