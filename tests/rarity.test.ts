import { describe, expect, it } from "vitest";
import { parseAnswerBlock } from "../src/game/rules/answerIndex";
import { liveRarity, priorRate, rarityFromRate } from "../src/game/rules/rarity";
import { foundLabel, tierFor } from "../src/game/rules/scoring";
import { SEEDS } from "../src/game/data/seeds";

const recs = parseAnswerBlock(Array.from({ length: 100 }, (_, i) => `Answer ${i} = ${1 + i}`).join("\n"), "t");

describe("live rarity", () => {
  it("scores by find rate on a log scale", () => {
    expect(rarityFromRate(0.6)).toBe(1);
    expect(tierFor(rarityFromRate(0.3)).key).toBe("copper"); // 3 in 10 players
    expect(tierFor(rarityFromRate(0.15)).key).toBe("gold"); // 3 in 20
    expect(tierFor(rarityFromRate(0.009)).key).toBe("diamond"); // under 1 in 100
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
    expect(tierFor(r("Dachshund")).key).toBe("copper");
    for (const n of ["Australian Shepherd", "Cocker Spaniel", "Mastiff", "Bloodhound"]) expect(tierFor(r(n)).key, n).toBe("gold");
    expect(tierFor(r("Kooikerhondje")).key).toBe("diamond");
  });

  it("short, well-known lists still give their rarest answers Diamonds", () => {
    const af = parseAnswerBlock(SEEDS.find((s) => s.slug === "african-countries")!.answers, "a");
    const m = liveRarity(af, null);
    const t = (n: string) => tierFor(m.get(af.find((d) => d.canonical === n)!.id)!.rarity).key;
    expect(t("Egypt")).toBe("copper");
    expect(t("Chad")).toBe("gold");
    expect(t("Djibouti")).toBe("gold");
    expect(t("Cape Verde")).toBe("diamond");
    expect(t("Sao Tome and Principe")).toBe("platinum");
  });

  it("labels the share", () => {
    expect(foundLabel({ rarity: 13, pct: 29.6, est: true })).toBe("~30% find it");
    expect(foundLabel({ rarity: 99, pct: 0.3, est: true })).toBe("~<1% find it");
    expect(foundLabel({ rarity: 40, pct: 6.25 })).toBe("6.3% found it");
  });
});
