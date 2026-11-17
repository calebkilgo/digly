import type { AnswerRecord } from "./answerIndex";
import { tierFromZ, type TierKey } from "./scoring";

// Rarity. Every answer in a prompt's pool has a difficulty rating from 1 to 100
// (1 = nearly everyone says it). Ratings start from the curated value and move
// with real play: the share of past players who found an answer is blended
// with the curated estimate and turned back into a rating.
//
// Within each pool the ratings are treated as normally distributed. Rather than
// trust the raw ratings to be bell-shaped (most long lists aren't), each
// answer's place in the pool is turned into a normal z-score: z = invCDF of its
// position from easiest to hardest. Every prompt then gets the same tier mix
// (about 16% copper, 46% gold, 35% diamond, 3.6% ruby; see SCORING.tierZ), the
// order of answers never changes, and the shown score is CDF(z) x 100. The
// single hardest answer is the Platinum. Ratings only use earlier days, so the
// tiers stay fixed while a day is played.

export interface AnswerStats {
  plays: number; // ranked attempts at this category before the day being scored
  counts: Record<string, number>; // answer id -> attempts that found it
}

export interface LiveRarity {
  rarity: number; // shown score: CDF(z) x 100, Platinum = 100
  tier: TierKey;
  z: number;
  rating: number; // difficulty 1..100
  pct: number; // share of players who find it, 0..100
  estimated: boolean; // true until enough real players have dug this category
}

// The curated estimate counts as this many imaginary players.
export const PRIOR_WEIGHT = 200;
// Below this many real players the % shown is marked as an estimate.
export const MIN_PLAYS_FOR_PCT = 30;

// Rating 1 (everyone says it) .. 100 (nobody does) <-> expected find rate.
export function priorRate(rating: number) {
  const c = Math.min(100, Math.max(1, rating));
  return 0.002 + 0.6 * Math.exp(-0.055 * c);
}
export function ratingFromRate(p: number) {
  return Math.min(100, Math.max(1, Math.log(0.6 / Math.max(p - 0.002, 1e-6)) / 0.055));
}

// Standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1e-7).
export function normCdf(z: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Inverse standard normal CDF (Acklam's rational approximation, error under 1.2e-9).
export function normInv(p: number) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function liveRarity(records: AnswerRecord[], stats: AnswerStats | null): Map<string, LiveRarity> {
  const plays = stats?.plays ?? 0;
  const counts = stats?.counts ?? {};
  const estimated = plays < MIN_PLAYS_FOR_PCT;
  const rated = records.map((r) => {
    const p = ((counts[r.id] ?? 0) + PRIOR_WEIGHT * priorRate(r.curated)) / (plays + PRIOR_WEIGHT);
    // with no plays this gives back the curated rating exactly
    return { r, p, rating: plays ? ratingFromRate(p) : Math.min(100, Math.max(1, r.curated)) };
  });
  const n = rated.length;
  // easiest to hardest; equal ratings keep list order (later-listed counts as harder)
  const order = rated.map((x, i) => ({ x, i })).sort((u, v) => u.x.rating - v.x.rating || u.i - v.i);
  const zOf = new Map(order.map((o, k) => [o.x, normInv((k + 0.5) / n)]));
  // exactly one Platinum: the hardest
  const plat = order[n - 1]?.x;
  const out = new Map<string, LiveRarity>();
  for (const x of rated) {
    const z = zOf.get(x)!;
    const isPlat = x === plat;
    out.set(x.r.id, {
      rarity: isPlat ? 100 : Math.max(1, Math.min(99, Math.round(normCdf(z) * 100))),
      tier: isPlat ? "platinum" : tierFromZ(z),
      z,
      rating: x.rating,
      pct: Math.round(x.p * 1000) / 10,
      estimated,
    });
  }
  return out;
}
