import { describe, expect, it } from "vitest";
import { parseAnswerBlock } from "../src/game/rules/answerIndex";
import { liveRarity, normCdf, normInv, priorRate, ratingFromRate } from "../src/game/rules/rarity";
import { foundLabel } from "../src/game/rules/scoring";

// 200 answers with roughly normal ratings (mean 50, sd 15)
const normalPool = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 200; i++) {
    const q = (i + 0.5) / 200;
    // inverse normal by bisection on normCdf
    let lo = -4, hi = 4;
    for (let k = 0; k < 60; k++) (normCdf((lo + hi) / 2) < q ? (lo = (lo + hi) / 2) : (hi = (lo + hi) / 2));
    lines.push(`Answer ${i} = ${Math.max(1, Math.min(100, 50 + 15 * lo)).toFixed(2)}`);
  }
  return parseAnswerBlock(lines.join("\n"), "t");
})();

describe("rarity tiers from z-scores", () => {
  it("normal ratings give the target tier shares and one Platinum", () => {
    const m = liveRarity(normalPool, null);
    const share = (k: string) => [...m.values()].filter((v) => v.tier === k).length / normalPool.length;
    expect(share("copper")).toBeCloseTo(0.16, 1);
    expect(share("gold")).toBeCloseTo(0.44, 1);
    expect(share("diamond")).toBeCloseTo(0.33, 1);
    expect(share("ruby") + share("platinum")).toBeCloseTo(0.07, 1);
    expect(share("platinum") * normalPool.length).toBe(1);
  });

  it("hits the target mix even when ratings aren't bell-shaped", () => {
    const flat = parseAnswerBlock(Array.from({ length: 300 }, (_, i) => `Flat ${i} = ${40 + (i % 60)}`).join("\n"), "f");
    const m = liveRarity(flat, null);
    const share = (k: string) => [...m.values()].filter((v) => v.tier === k).length / flat.length;
    expect(share("copper")).toBeCloseTo(0.16, 1);
    expect(share("ruby") + share("platinum")).toBeCloseTo(0.07, 1);
  });

  it("shows CDF(z) x 100 as the score, Platinum as 100", () => {
    const m = liveRarity(normalPool, null);
    for (const v of m.values()) {
      if (v.tier === "platinum") expect(v.rarity).toBe(100);
      else expect(v.rarity).toBe(Math.max(1, Math.min(99, Math.round(normCdf(v.z) * 100))));
    }
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.5)).toBeCloseTo(0.9332, 3);
    expect(normInv(0.9332)).toBeCloseTo(1.5, 3);
    expect(normInv(0.01)).toBeCloseTo(-2.3263, 3);
  });

  it("real find rates move ratings, and a few games barely do", () => {
    expect(ratingFromRate(priorRate(37))).toBeCloseTo(37, 6);
    const r = normalPool[199];
    const before = liveRarity(normalPool, null).get(r.id)!;
    const few = liveRarity(normalPool, { plays: 2, counts: { [r.id]: 2 } }).get(r.id)!;
    expect(few.estimated).toBe(true);
    expect(before.rating - few.rating).toBeLessThan(30);
    expect(few.tier).not.toBe("copper");
    const many = liveRarity(normalPool, { plays: 2000, counts: { [r.id]: 1500 } }).get(r.id)!;
    expect(many.tier).toBe("copper");
    expect(many.estimated).toBe(false);
  });

  it("labels the share", () => {
    expect(foundLabel({ rarity: 13, pct: 29.6, est: true })).toBe("~30% find it");
    expect(foundLabel({ rarity: 99, pct: 0.3, est: true })).toBe("~<1% find it");
    expect(foundLabel({ rarity: 40, pct: 6.25 })).toBe("6.3% found it");
  });
});
