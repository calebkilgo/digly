import type { AnswerRecord } from "./answerIndex";

// Real rarity. For each answer, the share of past ranked players who found
// it, blended with the starting estimate so a handful of games can't swing
// it. Answers are then ranked by that share and placed on the same curve as
// before, so the gem mix stays the same while the order comes from players.

export interface AnswerStats {
  plays: number; // ranked attempts at this category before the day being scored
  counts: Record<string, number>; // answer id -> attempts that found it
}

export interface LiveRarity {
  rarity: number;
  found?: number; // percent of players who found it, once there's enough data
}

// The starting estimate counts as this many imaginary players.
export const PRIOR_WEIGHT = 50;
// Below this many real players the UI keeps saying "~" estimates.
export const MIN_PLAYS_FOR_PCT = 30;

// Curated 1 (everyone says it) .. 100 (nobody does) -> expected find rate.
export function priorRate(curated: number) {
  const r = 1 - Math.min(100, Math.max(1, curated)) / 100;
  return 0.002 + 0.6 * r * r;
}

export function liveRarity(records: AnswerRecord[], stats: AnswerStats | null): Map<string, LiveRarity> {
  const out = new Map<string, LiveRarity>();
  if (!stats || stats.plays <= 0) {
    for (const r of records) out.set(r.id, { rarity: r.rarity });
    return out;
  }
  const { plays, counts } = stats;
  const rated = records.map((r) => {
    const n = counts[r.id] ?? 0;
    return { r, n, p: (n + PRIOR_WEIGHT * priorRate(r.curated)) / (plays + PRIOR_WEIGHT) };
  });
  // most found first; the estimate breaks exact ties
  rated.sort((a, b) => b.p - a.p || a.r.curated - b.r.curated);
  const last = rated.length - 1;
  rated.forEach((x, i) => {
    const pos = last <= 0 ? 1 : i / last;
    const rarity = i === last ? 100 : Math.max(1, Math.min(99, Math.round(1 + 98 * pos * pos)));
    out.set(x.r.id, { rarity, found: plays >= MIN_PLAYS_FOR_PCT ? Math.round((100 * x.n) / plays) : undefined });
  });
  return out;
}
