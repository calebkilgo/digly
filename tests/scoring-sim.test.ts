// Scoring simulation: five kinds of player, many games each, using the real
// SCORING config and scoring functions. Run with `npm run simulate`.
//
// Player model (assumptions, not measurements):
// - Answers found per level ~ Poisson(base x skill). Base = what an average
//   adult manages in 40 s: 6 at Level 1, 3.5 at Level 2, 1.5 at Level 3.
// - Each answer's z (how niche it is in its pool) ~ Normal(player mean, 1.2).
//   Casual players mostly name the obvious answers; experts reach further.
// - Platinum: a small per-answer chance that grows with skill.
import { describe, expect, it } from "vitest";
import { SCORING, bestN, gameScore, levelScore, tierFromZ, type Scored } from "../src/game/rules/scoring";

interface Player {
  name: string;
  count: number; // multiplier on answers found
  zMean: number; // how niche their answers are
  zeroIn?: 1 | 2 | 3; // a level they blank on
}

export const PLAYERS: Player[] = [
  { name: "casual", count: 0.6, zMean: -1.0 },
  { name: "average", count: 1.0, zMean: -0.6 },
  { name: "strong", count: 1.6, zMean: -0.1 },
  { name: "expert", count: 2.2, zMean: 0.4 },
  { name: "strong, zero in L2", count: 1.6, zMean: -0.1, zeroIn: 2 },
];

const BASE: Record<1 | 2 | 3, number> = { 1: 6, 2: 3.5, 3: 1.5 };
const GAMES = 20000;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(p: Player, seed = 7) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
  const poisson = (l: number) => {
    let k = 0;
    let t = Math.exp(-l);
    let s = t;
    const u = r();
    while (u > s && k < 50) {
      k++;
      t *= l / k;
      s += t;
    }
    return k;
  };
  const sums = { 1: 0, 2: 0, 3: 0, total: 0 };
  for (let g = 0; g < GAMES; g++) {
    const pts: number[] = [];
    for (const lv of [1, 2, 3] as const) {
      const n = p.zeroIn === lv ? 0 : poisson(BASE[lv] * p.count);
      const answers: Scored[] = Array.from({ length: n }, () => {
        const z = p.zMean + gauss() * 1.2;
        const plat = r() < 0.002 * Math.max(0.2, 1 + p.zMean * 2);
        return { name: "", rarity: 0, z, tier: plat ? "platinum" : tierFromZ(z) };
      });
      const s = levelScore(bestN(answers), lv).points;
      pts.push(s);
      sums[lv] += s;
    }
    sums.total += gameScore(pts);
  }
  const avg = (x: number) => x / GAMES;
  const total = avg(sums[1] + sums[2] + sums[3]);
  return {
    l1: avg(sums[1]),
    l2: avg(sums[2]),
    l3: avg(sums[3]),
    game: avg(sums.total),
    share: [sums[1], sums[2], sums[3]].map((x) => (total > 0 ? avg(x) / total : 0)),
  };
}

describe("scoring simulation", () => {
  const rows = PLAYERS.map((p) => ({ p, s: simulate(p) }));
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
  const n = (x: number) => x.toFixed(0).padStart(5);

  it("prints each level's score and share of the total", () => {
    const lines = [
      `${GAMES} games per player. Points ${JSON.stringify(SCORING.points)}, multipliers ${JSON.stringify(SCORING.multipliers)},`,
      `clean +${SCORING.cleanBonus}, empty ${SCORING.emptySlot}/slot, cave-in ${SCORING.caveIn}.`,
      "",
      "player                  L1    L2    L3   game   L1%  L2%  L3%",
      ...rows.map(({ p, s }) => `${p.name.padEnd(20)} ${n(s.l1)} ${n(s.l2)} ${n(s.l3)} ${n(s.game)}  ${pct(s.share[0])} ${pct(s.share[1])} ${pct(s.share[2])}`),
    ];
    // what a blank level costs a strong player, level by level
    const strong = rows[2].s.game;
    const cost = ([1, 2, 3] as const).map((lv) => strong - simulate({ ...PLAYERS[2], zeroIn: lv }).game);
    lines.push("", `strong player's loss from a zero: L1 ${n(cost[0])}, L2 ${n(cost[1])}, L3 ${n(cost[2])}`);
    console.log("\n" + lines.join("\n") + "\n");
  });

  it("meets the design goals", () => {
    const get = (name: string) => rows.find((x) => x.p.name === name)!.s;
    const strong = get("strong");
    // Level 3 is the biggest share of a strong player's total, "about 40-50%"
    expect(strong.share[2]).toBeGreaterThanOrEqual(0.38);
    expect(strong.share[2]).toBeLessThanOrEqual(0.52);
    expect(strong.share[2]).toBeGreaterThan(Math.max(strong.share[0], strong.share[1]));
    // Level 1 still matters for an average player
    expect(get("average").share[0]).toBeGreaterThanOrEqual(0.2);
    // a zero clearly hurts, and hurts most in Level 3
    const cost = ([1, 2, 3] as const).map((lv) => strong.game - simulate({ ...PLAYERS[2], zeroIn: lv }).game);
    expect(cost[2]).toBeGreaterThan(cost[1]);
    expect(cost[1]).toBeGreaterThan(cost[0] * 0.8);
    expect(get("strong, zero in L2").game).toBeLessThan(strong.game * 0.8);
    // more skill, more points
    const games = ["casual", "average", "strong", "expert"].map((x) => get(x).game);
    for (let i = 1; i < games.length; i++) expect(games[i]).toBeGreaterThan(games[i - 1]);
  });
});
