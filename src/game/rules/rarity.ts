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
// Most players name the same dozen or so answers, so the share falls off fast:
// 1 -> ~57%, 10 -> ~35%, 25 -> ~15%, 50 -> ~4%, 75 -> ~1%, 100 -> ~0.6%.
export function priorRate(curated: number) {
  const c = Math.min(100, Math.max(1, curated));
  return 0.002 + 0.6 * Math.exp(-0.055 * c);
}

// Find rate -> score, interpolated on a log scale between these points.
// Copper is for what a big share of players say; Gold starts at 1 in 5;
// Diamond at 1 in 100.
const CURVE: [number, number][] = [
  [0.5, 1],
  [0.2, 56],
  [0.01, 90],
  [0.0025, 99],
];
export function rarityFromRate(p: number) {
  if (p >= CURVE[0][0]) return 1;
  for (let i = 1; i < CURVE.length; i++) {
    const [p1, s1] = CURVE[i - 1];
    const [p2, s2] = CURVE[i];
    if (p >= p2) {
      const t = (Math.log(p1) - Math.log(p)) / (Math.log(p1) - Math.log(p2));
      return Math.max(1, Math.min(99, Math.round(s1 + t * (s2 - s1))));
    }
  }
  return 99;
}

export function liveRarity(records: AnswerRecord[], stats: AnswerStats | null): Map<string, LiveRarity> {
  const plays = stats?.plays ?? 0;
  const counts = stats?.counts ?? {};
  const estimated = plays < MIN_PLAYS_FOR_PCT;
  const rated = records.map((r) => ({ r, p: ((counts[r.id] ?? 0) + PRIOR_WEIGHT * priorRate(r.curated)) / (plays + PRIOR_WEIGHT) }));

  // Place within the category, most found first. On short, well-known lists
  // (African countries, US states) nearly everything is found by over 1% of
  // players, so the find rate alone would leave almost no Diamonds. Each answer
  // gets the better of its find-rate score and its place in its own list,
  // which always gives a category's rarest few their Diamonds.
  const byRate = [...rated].sort((a, b) => b.p - a.p || a.r.curated - b.r.curated);
  const last = Math.max(1, byRate.length - 1);
  const place = new Map(byRate.map((x, i) => [x, Math.round(1 + 98 * (i / last) ** 2)]));

  // the single least-found answer is the Platinum
  const plat = byRate[byRate.length - 1];
  const out = new Map<string, LiveRarity>();
  for (const x of rated) {
    out.set(x.r.id, {
      rarity: x === plat ? 100 : Math.max(rarityFromRate(x.p), place.get(x)!),
      pct: Math.round(x.p * 1000) / 10,
      estimated,
    });
  }
  return out;
}
