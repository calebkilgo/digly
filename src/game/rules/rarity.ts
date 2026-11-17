import type { AnswerRecord } from "./answerIndex";

// Real rarity. Each answer's score comes from the share of players expected to
// find it, so it doesn't depend on how long the answer list is. Before players
// exist that share is an estimate; after, it's the real find rate blended with
// the estimate so a handful of games can't swing it.

export interface AnswerStats {
  plays: number; // ranked attempts at this category before the day being scored
  counts: Record<string, number>; // answer id -> attempts that found it
}

export interface LiveRarity {
  rarity: number;
  pct: number; // share of players who find it, 0..100
  estimated: boolean; // true until enough real players have dug this category
}

// The starting estimate counts as this many imaginary players.
export const PRIOR_WEIGHT = 200;
// Below this many real players the % shown is marked as an estimate.
export const MIN_PLAYS_FOR_PCT = 30;

// Curated 1 (everyone says it) .. 100 (nobody does) -> expected find rate.
export function priorRate(curated: number) {
  const r = 1 - Math.min(100, Math.max(1, curated)) / 100;
  return 0.002 + 0.6 * r * r;
}

// Find rate -> score on a log scale. 60% of players or more scores 1;
// 0.25% or fewer scores 99. Diamond (90+) is roughly 1 in 230 players.
const P_TOP = 0.6;
const P_FLOOR = 0.0025;
export function rarityFromRate(p: number) {
  const s = (100 * Math.log(P_TOP / Math.max(p, 1e-9))) / Math.log(P_TOP / P_FLOOR);
  return Math.max(1, Math.min(99, Math.round(s)));
}

export function liveRarity(records: AnswerRecord[], stats: AnswerStats | null): Map<string, LiveRarity> {
  const plays = stats?.plays ?? 0;
  const counts = stats?.counts ?? {};
  const estimated = plays < MIN_PLAYS_FOR_PCT;
  const rated = records.map((r) => {
    const p = ((counts[r.id] ?? 0) + PRIOR_WEIGHT * priorRate(r.curated)) / (plays + PRIOR_WEIGHT);
    return { r, p };
  });
  // the single least-found answer is the Platinum; the estimate breaks ties
  let plat = rated[0];
  for (const x of rated) if (x.p < plat.p || (x.p === plat.p && x.r.curated >= plat.r.curated)) plat = x;
  const out = new Map<string, LiveRarity>();
  for (const x of rated) {
    out.set(x.r.id, {
      rarity: x === plat ? 100 : rarityFromRate(x.p),
      pct: Math.round(x.p * 1000) / 10,
      estimated,
    });
  }
  return out;
}
