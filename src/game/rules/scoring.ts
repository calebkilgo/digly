export const TOP_N = 3;
export const MAX_SCORE = 300;
export const PLATINUM = 100;

export interface Scored {
  name: string;
  rarity: number;
}

// Rarest n accepted answers, highest first. Ties keep submission order.
export function topN<T extends Scored>(accepted: T[], n: number): T[] {
  return accepted
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.rarity - x.a.rarity || x.i - y.i)
    .slice(0, n)
    .map((x) => x.a);
}

export function topThree<T extends Scored>(accepted: T[]): T[] {
  return topN(accepted, TOP_N);
}

export function finalScore(accepted: Scored[], n = TOP_N): number {
  return topN(accepted, n).reduce((s, a) => s + a.rarity, 0);
}

export interface Tier {
  key: "copper" | "gold" | "diamond" | "platinum";
  label: string;
  min: number;
  blurb: string;
}

// Four ranks. Scores follow a steep curve (see calibrate), so the cutoffs line
// up with share of the answer list: gold is about the top quarter, diamond the
// top 5%, and Platinum is the single rarest answer in the category.
export const TIERS: Tier[] = [
  { key: "platinum", label: "Platinum", min: PLATINUM, blurb: "the rarest one" },
  { key: "diamond", label: "Diamond", min: 90, blurb: "top 5%" },
  { key: "gold", label: "Gold", min: 56, blurb: "top 25%" },
  { key: "copper", label: "Copper", min: 1, blurb: "common" },
];

// Rarity comes from how many players submit an answer, so it maps back to an
// approximate share of players who found it.
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

export function tierFor(rarity: number): Tier {
  return TIERS.find((t) => rarity >= t.min) ?? TIERS[TIERS.length - 1];
}
