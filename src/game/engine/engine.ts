import { AnswerIndex, CORRECTED, parseAnswerBlock, type AnswerRecord } from "../rules/answerIndex";
import { bestN, levelScore, type Scored } from "../rules/scoring";
import { liveRarity, type LiveRarity } from "../rules/rarity";
import { buildQuickCheck, type QuickCheck } from "../rules/quickCheck";
import { dayNumber, dayStart, formatChallengeNumber } from "../rules/schedule";
import { LEVELS } from "../rules/levels";
import { SEEDS, type ChallengeSeed } from "../data/seeds";
import { slugFor } from "../data/rotation";
import { vaultGameOpen, vaultOpen } from "../rules/plans";
import { VAULT_CHALLENGES, vaultSlug } from "../data/vault";
import {
  GameError,
  type AttemptMode,
  type AttemptResult,
  type AttemptStart,
  type DayStatus,
  type LevelNo,
  type PublicChallenge,
  type SubmitResult,
  type FullAnswer,
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
  num: Map<string, number>; // answer id -> position, as used by QuickCheck
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

  // daily categories plus the Vault's own prompts
  private findSeed(slug: string) {
    return this.seeds().find((s) => s.slug === slug) ?? VAULT_CHALLENGES.find((s) => s.slug === slug);
  }

  private indexed(slug: string): Indexed {
    let x = this.indexes.get(slug);
    if (!x) {
      const seed = this.findSeed(slug);
      if (!seed) throw new GameError("not_found", `Unknown challenge ${slug}`);
      const index = new AnswerIndex(parseAnswerBlock(seed.answers, slug));
      x = { index, byId: new Map(index.answers.map((a) => [a.id, a])), num: new Map(index.answers.map((a, i) => [a.id, i])) };
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
    const seed = (slug && this.findSeed(slug)) || seedFor(day, level, this.seeds());
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

  // `slug` picks a specific category (the admin demo dig). The caller checks
  // the player is allowed; here it's only ever an unranked practice run.
  // `vault`: a Vault game number; its prompts replace the day's categories.
  // `unlimited`: the player owns Digly Unlimited (the route looks it up).
  async start(
    playerId: string,
    day: number,
    level: LevelNo,
    mode: AttemptMode,
    opts: { slug?: string; vault?: number; unlimited?: boolean } = {},
  ): Promise<AttemptStart> {
    const { vault, unlimited = false } = opts;
    let { slug } = opts;
    if (![1, 2, 3].includes(level)) throw new GameError("bad_request", "Bad level");
    if (mode !== "ranked" && mode !== "practice") throw new GameError("bad_request", "Bad mode");
    this.checkDay(day);
    await this.store.ensurePlayer(playerId);
    const now = this.now();
    if (vault !== undefined) {
      const vs = Number.isInteger(vault) && [1, 2, 3].includes(level) ? vaultSlug(vault, level) : null;
      if (mode !== "practice" || !vs || slug !== undefined) throw new GameError("bad_request", "Bad Vault game");
      if (day !== this.today()) throw new GameError("bad_request", "Vault games are played on today's date");
      if (!vaultGameOpen(vault, unlimited)) throw new GameError("locked", "Digly Unlimited opens every Vault game.");
      slug = vs;
    } else if (slug !== undefined) {
      const seed = this.findSeed(slug);
      if (mode !== "practice" || !seed || seed.level !== level) throw new GameError("bad_request", "Bad demo category");
    }
    const ch = this.challenge(day, level, slug);
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
    } else if (slug === undefined) {
      // replaying a past day's categories (the old Vault)
      if (!vaultOpen(day, this.today(), unlimited)) throw new GameError("locked", "Digly Unlimited opens every past dig.");
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
      slug: slug ?? seedFor(day, level, this.seeds()).slug,
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

  private quickCheck(row: AttemptRow): QuickCheck {
    const { index } = this.indexed(row.slug);
    return buildQuickCheck(row.id, index.answers.map((a) => [a.normalized, ...a.aliases]));
  }

  private async startPayload(row: AttemptRow, ch: PublicChallenge, now: number): Promise<AttemptStart> {
    const { byId, num } = this.indexed(row.slug);
    const ids = await this.store.listAnswers(row.id);
    return {
      check: this.quickCheck(row),
      found: ids.map((id) => num.get(id) ?? -1),
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
    // runs in the background behind the browser's instant check, so keep it to as few database calls as possible
    const row = await this.own(playerId, attemptId);
    if (row.finishedAt !== null || this.expired(row)) return { status: "expired" };
    const trimmed = String(text ?? "").trim().slice(0, MAX_LEN);
    if (!trimmed) return { status: "empty" };
    if ((await this.store.bumpSubmissions(row.id)) > MAX_SUBMISSIONS) return { status: "rejected" };

    const match = this.indexed(row.slug).index.lookup(trimmed);
    if (!match) {
      await this.store.addReject(row.id, trimmed);
      return { status: "rejected" };
    }
    const added = await this.store.addAnswer(row.id, match.answer.id);
    const num = this.indexed(row.slug).num.get(match.answer.id);
    if (!added) return { status: "duplicate", canonical: match.answer.canonical, num };
    return { status: "accepted", canonical: match.answer.canonical, num, corrected: CORRECTED.includes(match.kind) };
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
    const s = levelScore(bestN(accepted.map((a) => this.scored(a, live))), row.level);
    await this.store.finishAttempt(row.id, {
      finishedAt: Math.min(this.now(), row.expiresAt),
      score: s.raw,
      points: s.points,
      uniqueCount: accepted.length,
    });
  }

  private scored(a: AnswerRecord, live: Map<string, LiveRarity>): Scored {
    const l = live.get(a.id)!;
    return { name: a.canonical, rarity: l.rarity, tier: l.tier, z: Math.round(l.z * 1000) / 1000 };
  }

  // Rebuilt from the stored answers every time, so finish() is idempotent.
  private async result(row: AttemptRow): Promise<AttemptResult> {
    const { index, byId } = this.indexed(row.slug);
    const live = await this.rarity(row.slug, row.day);
    const reveal = (a: AnswerRecord) => {
      const l = live.get(a.id)!;
      return { ...this.scored(a, live), pct: l.pct, ...(l.estimated ? { est: true } : {}) };
    };
    const ids = await this.store.listAnswers(row.id);
    const got = new Set(ids);
    const accepted = ids
      .map((id) => byId.get(id))
      .filter((a): a is AnswerRecord => !!a)
      .map(reveal);
    const info = LEVELS[row.level - 1];
    const all = [...index.answers].sort((a, b) => live.get(b.id)!.rating - live.get(a.id)!.rating);
    const niche = new Set(["diamond", "ruby", "platinum"]);
    const missed = all.filter((a) => !got.has(a.id) && niche.has(live.get(a.id)!.tier)).slice(0, 12);
    // rotate through the rare pool so it isn't always the same few
    const offset = accepted.length % Math.max(1, missed.length);
    const pick = [...missed.slice(offset), ...missed.slice(0, offset)].slice(0, 4);
    const top = bestN(accepted);
    const s = levelScore(top, row.level);
    return {
      attemptId: row.id,
      challengeId: `${row.day}:${row.level}:${row.slug}`,
      challenge: this.challenge(row.day, row.level, row.slug),
      mode: row.mode,
      level: row.level,
      multiplier: info.mult,
      score: row.score ?? s.raw,
      points: row.points ?? s.points,
      top,
      accepted,
      rejected: await this.store.listRejects(row.id),
      missed: pick.map(reveal),
      rarest: all.slice(0, 20).map((a) => ({ ...reveal(a), found: got.has(a.id) })),
      finishedAt: row.finishedAt ?? Math.min(this.now(), row.expiresAt),
    };
  }

  // Every answer in a finished level's list, rarest first, marking the ones
  // this attempt found. Only after the level ends, so it can't be used to cheat.
  async allAnswers(playerId: string, attemptId: string): Promise<FullAnswer[]> {
    let row = await this.own(playerId, attemptId);
    if (row.finishedAt === null) {
      if (!this.expired(row)) throw new GameError("locked", "Finish the level first");
      await this.close(row);
      row = (await this.store.getAttempt(attemptId))!;
    }
    const { index } = this.indexed(row.slug);
    const live = await this.rarity(row.slug, row.day);
    const got = new Set(await this.store.listAnswers(row.id));
    return [...index.answers]
      .sort((a, b) => live.get(b.id)!.rating - live.get(a.id)!.rating)
      .map((a) => {
        const l = live.get(a.id)!;
        return { ...this.scored(a, live), pct: l.pct, ...(l.estimated ? { est: true } : {}), found: got.has(a.id) };
      });
  }

  // A prompt idea from a player. Kept short and plain; links aren't allowed.
  async suggest(playerId: string | null, raw: string) {
    const text = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 120) throw new GameError("bad_request", "Keep it between 2 and 120 characters.");
    if (/https?:|www\.|<|>/i.test(text)) throw new GameError("bad_request", "Just the prompt, no links.");
    if (playerId) await this.store.ensurePlayer(playerId);
    await this.store.addSuggestion({ playerId, text, day: this.today(), createdAt: this.now() });
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
