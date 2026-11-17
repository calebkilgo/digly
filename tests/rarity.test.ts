import { describe, expect, it } from "vitest";
import { parseAnswerBlock } from "../src/game/rules/answerIndex";
import { liveRarity, priorRate, rarityFromRate } from "../src/game/rules/rarity";
import { foundLabel, tierFor } from "../src/game/rules/scoring";
import { SEEDS } from "../src/game/data/seeds";

const recs = parseAnswerBlock(Array.from({ length: 100 }, (_, i) => `Answer ${i} = ${1 + i}`).join("\n"), "t");

describe("live rarity", () => {
  it("scores by find rate on a log scale", () => {
    expect(rarityFromRate(0.6)).toBe(1);
    expect(rarityFromRate(0.3)).toBe(13);
    expect(rarityFromRate(0.03)).toBe(55);
    expect(tierFor(rarityFromRate(0.004)).key).toBe("diamond");
    expect(rarityFromRate(0.0001)).toBe(99);
  });

  it("doesn't change an answer's score when obscure answers are added to the list", () => {
    const small = parseAnswerBlock("Bloodhound = 30\nPoodle = 4\nMudi = 97", "d");
    const big = parseAnswerBlock("Bloodhound = 30\nPoodle = 4\nMudi = 97\n" + Array.from({ length: 300 }, (_, i) => `Obscure ${i} = ${80 + (i % 19)}`).join("\n"), "d");
    const a = liveRarity(small, null).get("d:bloodhound")!.rarity;
    const b = liveRarity(big, null).get("d:bloodhound")!.rarity;
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(10);
  });

  it("uses real find rates once players exist, and has exactly one Platinum", () => {
    const counts: Record<string, number> = { [recs[99].id]: 900 };
    const m = liveRarity(recs, { plays: 1000, counts });
    expect(m.get(recs[99].id)!.rarity).toBeLessThan(5); // everyone found the "rare" one
    expect(m.get(recs[99].id)!.estimated).toBe(false);
    expect([...m.values()].filter((v) => v.rarity === 100)).toHaveLength(1);
  });

  it("a few games barely move it", () => {
    const before = liveRarity(recs, null).get(recs[95].id)!.rarity;
    const after = liveRarity(recs, { plays: 2, counts: { [recs[95].id]: 2 } }).get(recs[95].id)!;
    expect(after.estimated).toBe(true);
    expect(before - after.rarity).toBeLessThan(40);
    expect(priorRate(2)).toBeGreaterThan(priorRate(90));
  });

  it("dog breeds land where a player would expect", () => {
    const dogs = parseAnswerBlock(SEEDS.find((s) => s.slug === "dog-breeds")!.answers, "dog-breeds");
    const m = liveRarity(dogs, null);
    const r = (n: string) => m.get(dogs.find((d) => d.canonical === n)!.id)!.rarity;
    expect(r("Labrador Retriever")).toBeLessThan(3);
    expect(r("Bloodhound")).toBeGreaterThan(8);
    expect(tierFor(r("Kooikerhondje")).key).toBe("gold");
  });

  it("labels the share", () => {
    expect(foundLabel({ rarity: 13, pct: 29.6, est: true })).toBe("~30% find it");
    expect(foundLabel({ rarity: 99, pct: 0.3, est: true })).toBe("~<1% find it");
    expect(foundLabel({ rarity: 40, pct: 6.25 })).toBe("6.3% found it");
  });
});
