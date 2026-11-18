// All scoring numbers live in SCORING. Tune them there, nowhere else.
//
// Every level: 40 seconds, name as many valid answers as you can, your best 3
// count. Each answer has a tier (from how niche it is within that prompt).
// Level score = points of your best 3 answers x level multiplier. Answers are
// the only thing that scores; nothing takes points away.

export type TierKey = "copper" | "gold" | "diamond" | "ruby" | "platinum";

export const SCORING = {
  seconds: 40,
  best: 3,
  points: { copper: 20, gold: 50, diamond: 150, ruby: 350, platinum: 1000 } as Record<TierKey, number>,
  multipliers: { 1: 1, 2: 1.25, 3: 1.5 } as Record<1 | 2 | 3, number>,
  // tier cutoffs on the z-score of an answer's difficulty within its prompt
  tierZ: { gold: -1.0, diamond: 0.3, ruby: 1.8 }, // ~16% copper, 46% gold, 35% diamond, 3.6% ruby
};

export interface Scored {
  name: string;
  rarity: number; // 1..100 shown to players (normal CDF of z); Platinum is 100
  tier?: TierKey;
  z?: number;
}

export interface Tier {
  key: TierKey;
  label: string;
  min: number; // display score where the tier starts (fallback when no tier is stored)
  blurb: string;
}

// Highest first. The mins match the z cutoffs: CDF(-1) = 16, CDF(0.3) = 62, CDF(1.8) = 96.
export const TIERS: Tier[] = [
  { key: "platinum", label: "Platinum", min: 100, blurb: "the hardest one" },
  { key: "ruby", label: "Ruby", min: 96, blurb: "very niche" },
  { key: "diamond", label: "Diamond", min: 62, blurb: "niche" },
  { key: "gold", label: "Gold", min: 16, blurb: "a bit niche" },
  { key: "copper", label: "Bronze", min: 1, blurb: "the obvious ones" },
];
const BY_KEY = Object.fromEntries(TIERS.map((t) => [t.key, t])) as Record<TierKey, Tier>;

export function tierFor(rarity: number): Tier {
  return TIERS.find((t) => rarity >= t.min) ?? TIERS[TIERS.length - 1];
}

// The answer's stored tier if it has one (always, from the server), else from its score.
export function tierOf(a: Scored): Tier {
  return a.tier ? BY_KEY[a.tier] : tierFor(a.rarity);
}

export function tierFromZ(z: number): TierKey {
  const c = SCORING.tierZ;
  return z >= c.ruby ? "ruby" : z >= c.diamond ? "diamond" : z >= c.gold ? "gold" : "copper";
}

export function pointsOf(a: Scored) {
  return SCORING.points[tierOf(a).key];
}

// Best n answers: most tier points first, ties to the higher z, then submission order.
export function bestN<T extends Scored>(accepted: T[], n = SCORING.best): T[] {
  return accepted
    .map((a, i) => ({ a, i }))
    .sort((x, y) => pointsOf(y.a) - pointsOf(x.a) || (y.a.z ?? y.a.rarity) - (x.a.z ?? x.a.rarity) || x.i - y.i)
    .slice(0, n)
    .map((x) => x.a);
}

export interface LevelBreakdown {
  gems: number; // points from the best answers
  raw: number; // same as gems (kept so callers can show the pre-multiplier total)
  points: number; // raw x multiplier, rounded
  multiplier: number;
}

export function levelScore(best: Scored[], level: 1 | 2 | 3): LevelBreakdown {
  const gems = best.slice(0, SCORING.best).reduce((s, a) => s + pointsOf(a), 0);
  const raw = gems;
  const multiplier = SCORING.multipliers[level];
  return { gems, raw, points: Math.round(raw * multiplier), multiplier };
}

export function gameScore(levelPoints: number[]) {
  return Math.max(0, levelPoints.reduce((s, p) => s + p, 0));
}

// Rough share of players who find an answer with this display score.
export function foundByPct(rarity: number): number {
  return Math.max(1, Math.min(99, Math.round(101 - rarity)));
}

// Share of other players whose score you beat (ties count half).
export function percentile(score: number, others: number[]): number {
  if (!others.length) return 100;
  let below = 0;
  for (const o of others) below += o < score ? 1 : o === score ? 0.5 : 0;
  return Math.round((below / others.length) * 100);
}

// "~12% find it", "<1% find it", or a real "12% found it" once enough have played.
export function foundLabel(a: { rarity: number; pct?: number; est?: boolean }) {
  const pct = a.pct ?? foundByPct(a.rarity);
  const n = pct < 1 ? "<1" : pct < 10 ? String(Math.round(pct * 10) / 10) : String(Math.round(pct));
  const approx = a.est || a.pct === undefined;
  return approx ? `~${n}% find it` : `${n}% found it`;
}
