import { describe, expect, it } from "vitest";
import { SEEDS } from "../src/game/data/seeds";
import { AnswerIndex, parseAnswerBlock } from "../src/game/rules/answerIndex";

const idx = (slug: string) => new AnswerIndex(parseAnswerBlock(SEEDS.find((s) => s.slug === slug)!.answers, slug));

describe("generated answer data", () => {
  it("has 45 categories split across the three levels", () => {
    expect(SEEDS).toHaveLength(45);
    const per = [1, 2, 3].map((l) => SEEDS.filter((s) => s.level === l).length);
    expect(per).toEqual([13, 18, 14]);
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
      ["countries", "usa", "United States"],
      ["countries", "holland", "Netherlands"],
      ["world-capitals", "washington dc", "Washington, D.C."],
      ["nba-teams", "lakers", "Los Angeles Lakers"],
      ["mlb-teams", "yankees", "New York Yankees"],
      ["us-presidents", "jfk", "John F. Kennedy"],
      ["us-presidents", "lincoln", "Abraham Lincoln"],
      ["us-presidents", "adams", ""],
      ["scientists", "einstein", "Albert Einstein"],
      ["norse-myth", "thor", "Thor"],
      ["animals", "puppy", "Dog"],
      ["jobs", "cop", "Police Officer"],
      ["body-parts", "teeth", "Tooth"],
      ["music-genres", "hip hop", "Hip Hop"],
      ["board-games", "settlers of catan", "Catan"],
      ["cheeses", "gouda", "Gouda"],
      ["birds", "bald eagle", "Eagle"],
      ["birds", "snowy owl", "Owl"],
      ["birds", "northern cardinal", "Northern Cardinal"],
      ["scientists", "brown", ""],
      ["bones", "anvil", "Incus"],
      ["languages", "farsi", "Persian"],
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

import { slugFor } from "../src/game/data/rotation";

describe("rotation", () => {
  it("keeps every day already played exactly as it was", () => {
    expect(slugFor(1, 1)).toBe("dog-breeds");
    expect(slugFor(29, 1)).toBe("dog-breeds");
    expect(slugFor(29, 2)).toBe("african-countries");
    expect(slugFor(29, 3)).toBe("bones");
  });

  it("runs forever on its own: every category once per cycle, no back-to-back repeats", () => {
    for (const l of [1, 2, 3] as const) {
      const n = SEEDS.filter((s) => s.level === l).length;
      const cycle = Array.from({ length: n }, (_, i) => slugFor(30 + i, l));
      expect(new Set(cycle).size).toBe(n);
      for (let d = 31; d < 30 + 365 * 5; d++) expect(slugFor(d, l)).not.toBe(slugFor(d - 1, l));
    }
  });

  it("only names categories that exist at the right level", () => {
    for (let d = 1; d < 400; d++) for (const l of [1, 2, 3] as const) expect(SEEDS.find((s) => s.slug === slugFor(d, l))?.level).toBe(l);
  });
});
