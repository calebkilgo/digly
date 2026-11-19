// A cache of player progress on this device, for streaks and stats. The
// server is the source of truth for ranked digs; this fills in from it.

import type { DigResult, PlayerHistory, RevealedAnswer } from "./service/types";

export interface DayRecord {
  day: number;
  challengeId: string;
  score: number; // dig total across all three levels
  unique: number;
  top: RevealedAnswer[];
  finishedAt: number;
  result?: DigResult; // kept so the results can be reopened
}

export interface Progress {
  version: 1;
  ranked: Record<string, DayRecord>; // keyed by day
  practiceBest: Record<string, number>; // keyed by day
  practiceTitles?: Record<string, string[]>; // categories dug in practice, keyed by day
  vaultBest?: Record<string, number>; // keyed by Vault game number
  vaultTitles?: Record<string, string[]>; // prompts dug in each Vault game
  owner?: string | null; // account this cache belongs to (null: a guest); missing on old caches
}

// Whose progress the device should show for `user`. A cache from another
// account (or from an account after logging out) starts over; a guest's cache
// carries into the account they sign up or log in with, and an old cache with
// no owner is taken to be the current user's.
export function forUser(p: Progress, user: string | null): Progress {
  if (p.owner === user) return p;
  if (p.owner === undefined || p.owner === null) return { ...p, owner: user };
  return { ...EMPTY_PROGRESS, owner: user };
}

export const EMPTY_PROGRESS: Progress = { version: 1, ranked: {}, practiceBest: {} };

export function recordRanked(p: Progress, rec: DayRecord): Progress {
  if (p.ranked[rec.day]) return p; // first completion wins, no overwrites
  return { ...p, ranked: { ...p.ranked, [rec.day]: rec } };
}

export function recordPractice(p: Progress, day: number, score: number, titles?: string[]): Progress {
  const best = Math.max(score, p.practiceBest[day] ?? 0);
  const practiceTitles = titles ? { ...p.practiceTitles, [day]: titles } : p.practiceTitles;
  return { ...p, practiceBest: { ...p.practiceBest, [day]: best }, practiceTitles };
}

// Folds in what the server has for this account. Records already on this
// device win, best scores take the higher of the two, and the same object comes
// back when nothing changed (so nothing re-renders or saves for no reason).
export function mergeHistory(p: Progress, h: PlayerHistory): Progress {
  let changed = false;
  const ranked = { ...p.ranked };
  for (const r of h.ranked) {
    if (ranked[r.day]) continue;
    ranked[r.day] = { day: r.day, challengeId: String(r.day), score: r.score, unique: r.unique, top: [], finishedAt: r.finishedAt };
    changed = true;
  }
  const practiceBest = { ...p.practiceBest };
  const practiceTitles = { ...p.practiceTitles };
  for (const r of h.practice) {
    if (r.best > (practiceBest[r.day] ?? 0)) {
      practiceBest[r.day] = r.best;
      changed = true;
    }
    if (!practiceTitles[r.day]?.length && r.titles.length) {
      practiceTitles[r.day] = r.titles;
      changed = true;
    }
  }
  const vaultBest = { ...p.vaultBest };
  const vaultTitles = { ...p.vaultTitles };
  for (const r of h.vault) {
    if (r.best > (vaultBest[r.game] ?? 0)) {
      vaultBest[r.game] = r.best;
      changed = true;
    }
    if (!vaultTitles[r.game]?.length && r.titles.length) {
      vaultTitles[r.game] = r.titles;
      changed = true;
    }
  }
  return changed ? { ...p, ranked, practiceBest, practiceTitles, vaultBest, vaultTitles } : p;
}

// Current streak counts back from today, or from yesterday if today isn't
// played yet (the streak is still alive until the reset).
export function recordVault(p: Progress, game: number, score: number, titles: string[]): Progress {
  const best = Math.max(score, p.vaultBest?.[game] ?? 0);
  return { ...p, vaultBest: { ...p.vaultBest, [game]: best }, vaultTitles: { ...p.vaultTitles, [game]: titles } };
}

export function currentStreak(p: Progress, today: number): number {
  let d = p.ranked[today] ? today : today - 1;
  let n = 0;
  while (p.ranked[d]) {
    n++;
    d--;
  }
  return n;
}

export function longestStreak(p: Progress): number {
  const days = Object.keys(p.ranked).map(Number).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = -10;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export interface Stats {
  played: number;
  best: number;
  average: number;
  totalAnswers: number;
  history: DayRecord[];
}

export function stats(p: Progress): Stats {
  const history = Object.values(p.ranked).sort((a, b) => a.day - b.day);
  const played = history.length;
  const sum = history.reduce((s, r) => s + r.score, 0);
  return {
    played,
    best: history.reduce((m, r) => Math.max(m, r.score), 0),
    average: played ? Math.round(sum / played) : 0,
    totalAnswers: history.reduce((s, r) => s + r.unique, 0),
    history,
  };
}

// v2: the 5/3/1 level format. Bumping the key also resets everyone's day.
const KEY = "digly.progress.v2";

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROGRESS;
    const p = JSON.parse(raw) as Progress;
    return p.version === 1 ? { ...EMPTY_PROGRESS, ...p } : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable (private mode, sandboxed frame); play continues
  }
}
