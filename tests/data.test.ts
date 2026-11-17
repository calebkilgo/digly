import { describe, expect, it } from "vitest";
import { SEEDS } from "../src/game/data/seeds";
import { AnswerIndex, parseAnswerBlock } from "../src/game/rules/answerIndex";

const idx = (slug: string) => new AnswerIndex(parseAnswerBlock(SEEDS.find((s) => s.slug === slug)!.answers, slug));

describe("generated answer data", () => {
  it("has 29 categories split across the three levels", () => {
    expect(SEEDS).toHaveLength(29);
    const per = [1, 2, 3].map((l) => SEEDS.filter((s) => s.level === l).length);
    expect(per).toEqual([9, 11, 9]);
    for (const s of SEEDS) expect(s.answers.length, s.slug).toBeGreaterThan(100);
  });

  it("matches the answers people actually type", () => {
    const cases: [string, string, string][] = [
      ["programming-languages", "c++", "C++"],
      ["programming-languages", "c#", "C#"],
      ["programming-languages", "c", "C"],
      ["programming-languages", "golang", "Go"],
      ["dinosaurs", "t rex", "Tyrannosaurus"],
      ["dinosaurs", "trex", "Tyrannosaurus"],
      ["nfl-teams", "cowboys", "Dallas Cowboys"],
      ["nfl-teams", "49ers", "San Francisco 49ers"],
      ["knots", "reef knot", "Square Knot"],
      ["horse-breeds", "arabian horse", "Arabian"],
      ["vegetables", "aubergine", "Eggplant"],
      ["vegetables", "carrots", "Carrot"],
      ["car-brands", "chevy", "Chevrolet"],
      ["constellations", "big bear", ""],
      ["state-capitals", "st paul", "Saint Paul"],
      ["cocktails", "pina colada", "Pina Colada"],
      ["egyptian-gods", "amon ra", "Amun"],
      ["gemstones", "diamonds", "Diamond"],
    ];
    for (const [slug, input, want] of cases) {
      const m = idx(slug).lookup(input);
      expect(m?.answer.canonical ?? "", `${slug}: ${input}`).toBe(want);
    }
  });

  it("starting estimates put the obvious answers at the bottom", () => {
    for (const [slug, common] of [["vegetables", "Carrot"], ["dinosaurs", "Tyrannosaurus"], ["sports", "Soccer"], ["gemstones", "Diamond"]]) {
      const a = idx(slug).answers.find((x) => x.canonical === common)!;
      expect(a.rarity, slug).toBeLessThan(5);
    }
  });
});

import { slugFor, ROTATIONS } from "../src/game/data/rotation";

describe("rotation", () => {
  it("keeps every day up to launch of the new pool exactly as it was", () => {
    // spot values from the old stride walk
    expect(slugFor(1, 1)).toBe("dog-breeds");
    expect(slugFor(29, 1)).toBe("dog-breeds");
    expect(slugFor(29, 2)).toBe("african-countries");
    expect(slugFor(29, 3)).toBe("bones");
  });

  it("uses every category once per cycle and never repeats back to back", () => {
    const r = ROTATIONS[1];
    for (const l of [1, 2, 3] as const) {
      const n = r.pools[l].length;
      const cycle = Array.from({ length: n }, (_, i) => slugFor(r.from + i, l));
      expect(new Set(cycle).size).toBe(n);
      for (let d = r.from + 1; d < r.from + 200; d++) expect(slugFor(d, l)).not.toBe(slugFor(d - 1, l));
    }
  });

  it("only names categories that exist", () => {
    for (const r of ROTATIONS) for (const l of [1, 2, 3] as const) for (const s of r.pools[l]) expect(SEEDS.some((x) => x.slug === s && x.level === l), s).toBe(true);
  });
});
