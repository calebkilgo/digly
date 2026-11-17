// A cache of player progress on this device, for streaks and stats. The
// server is the source of truth for ranked digs; this fills in from it.

import type { DigResult, RevealedAnswer } from "./service/types";

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

// Current streak counts back from today, or from yesterday if today isn't
// played yet (the streak is still alive until the reset).
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
