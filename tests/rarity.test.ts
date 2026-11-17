import { describe, expect, it } from "vitest";
import { parseAnswerBlock } from "../src/game/rules/answerIndex";
import { liveRarity, priorRate, PRIOR_WEIGHT } from "../src/game/rules/rarity";
import { tierFor } from "../src/game/rules/scoring";

const recs = parseAnswerBlock(
  Array.from({ length: 100 }, (_, i) => `Answer ${i} = ${1 + i}`).join("\n"),
  "t",
);

describe("live rarity", () => {
  it("falls back to the estimates with no players", () => {
    const m = liveRarity(recs, null);
    for (const r of recs) expect(m.get(r.id)!.rarity).toBe(r.rarity);
  });

  it("reorders by what players actually find, keeping the gem mix", () => {
    // the estimated-rarest answer turns out to be the most found
    const counts: Record<string, number> = { [recs[99].id]: 90, [recs[0].id]: 0 };
    const m = liveRarity(recs, { plays: 100, counts });
    expect(m.get(recs[99].id)!.rarity).toBe(1);
    expect(m.get(recs[99].id)!.found).toBe(90);
    expect([...m.values()].filter((v) => v.rarity === 100)).toHaveLength(1);
    const tiers = (mm: typeof m) => [...mm.values()].map((v) => tierFor(v.rarity).key).sort().join();
    expect(tiers(m)).toBe(tiers(liveRarity(recs, null)));
  });

  it("a few games can't swing it much", () => {
    const m = liveRarity(recs, { plays: 2, counts: { [recs[99].id]: 2 } });
    expect(m.get(recs[99].id)!.rarity).toBeGreaterThan(50);
    expect(m.get(recs[99].id)!.found).toBeUndefined(); // too few players to show a real %
    expect(PRIOR_WEIGHT).toBeGreaterThan(10);
    expect(priorRate(2)).toBeGreaterThan(priorRate(90));
  });
});
