import { describe, expect, it } from "vitest";
import { SEEDS } from "../src/game/data/seeds";
import { AnswerIndex, parseAnswerBlock } from "../src/game/rules/answerIndex";

const idx = (slug: string) => new AnswerIndex(parseAnswerBlock(SEEDS.find((s) => s.slug === slug)!.answers, slug));

describe("generated answer data", () => {
  it("has 42 categories in the rotation, split across the three levels", () => {
    const active = SEEDS.filter((s) => !s.retired && s.retiredFrom === undefined);
    expect(active).toHaveLength(42);
    const per = [1, 2, 3].map((l) => active.filter((s) => s.level === l).length);
    expect(per).toEqual([13, 16, 13]);
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
      ["snakes", "rattler", "Rattlesnake"],
      ["horse-breeds", "arabian horse", "Arabian"],
      ["vegetables", "aubergine", "Eggplant"],
      ["vegetables", "carrots", "Carrot"],
      ["car-brands", "chevy", "Chevrolet"],
      ["constellations", "big bear", ""],
      ["state-capitals", "st paul", "Saint Paul"],
      ["cocktails", "pina colada", "Pina Colada"],
      ["egyptian-gods", "amon ra", "Amun"],
      ["gemstones", "diamonds", "Diamond"],
      ["sea-creatures", "killer whale", "Orca"],
      ["candy", "reeses", "Reese's"],
      ["world-capitals", "washington dc", "Washington, D.C."],
      ["nba-teams", "lakers", "Los Angeles Lakers"],
      ["mlb-teams", "yankees", "New York Yankees"],
      ["us-presidents", "jfk", "John F. Kennedy"],
      ["us-presidents", "lincoln", "Abraham Lincoln"],
      ["us-presidents", "adams", ""],
      ["scientists", "einstein", "Albert Einstein"],
      ["norse-myth", "thor", "Thor"],
      ["clothing", "trousers", "Pants"],
      ["kitchen-tools", "skillet", "Frying Pan"],
      ["olympic-sports", "ping pong", "Table Tennis"],
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
    for (const [slug, common] of [["vegetables", "Carrot"], ["dinosaurs", "Tyrannosaurus"], ["olympic-sports", "Swimming"], ["gemstones", "Diamond"]]) {
      const a = idx(slug).answers.find((x) => x.canonical === common)!;
      expect(a.rarity, slug).toBeLessThan(5);
    }
  });
});

import { RESETS, slugFor } from "../src/game/data/rotation";

describe("rotation", () => {
  it("keeps every day already played exactly as it was", () => {
    expect(slugFor(1, 1)).toBe("dog-breeds");
    expect(slugFor(29, 1)).toBe("dog-breeds");
    expect(slugFor(29, 2)).toBe("african-countries");
    expect(slugFor(29, 3)).toBe("bones");
  });

  it("runs forever on its own: every category once per cycle, no back-to-back repeats", () => {
    const from = RESETS[RESETS.length - 1];
    for (const l of [1, 2, 3] as const) {
      const pool = SEEDS.filter((s) => s.level === l && !s.retired && (s.since ?? 0) <= from && (s.retiredFrom ?? Infinity) > from);
      const cycle = Array.from({ length: pool.length }, (_, i) => slugFor(from + i, l));
      expect(new Set(cycle).size).toBe(pool.length);
      // nothing retired comes back
      for (let d = from; d < from + 400; d++) expect(SEEDS.find((s) => s.slug === slugFor(d, l))!.retiredFrom).toBeUndefined();
      for (let d = 31; d < 30 + 365 * 5; d++) expect(slugFor(d, l)).not.toBe(slugFor(d - 1, l));
    }
  });

  it("only names categories that exist at the right level", () => {
    for (let d = 1; d < 400; d++) for (const l of [1, 2, 3] as const) expect(SEEDS.find((s) => s.slug === slugFor(d, l))?.level).toBe(l);
  });
});

describe("merged prompts", () => {
  const idx = (slug: string) => new AnswerIndex(parseAnswerBlock(SEEDS.find((s) => s.slug === slug)!.answers, slug));

  it("pro teams: nickname or city and nickname, shared names count once, past names are deep", () => {
    const t = idx("pro-teams");
    const name = (q: string) => t.lookup(q)?.answer.canonical ?? null;
    expect(name("Rangers")).toBe("Rangers");
    expect(name("Texas Rangers")).toBe("Rangers");
    expect(name("new york rangers")).toBe("Rangers");
    expect(name("SF Giants")).toBe("Giants");
    expect(name("Niners")).toBe("49ers");
    expect(name("Utah Hockey Club")).toBe("Mammoth");
    expect(name("Boston")).toBeNull();
    expect(name("Seattle")).toBeNull();
    expect(t.lookup("Hartford Whalers")?.answer.deep).toBe(true);
    expect(t.lookup("Yankees")?.answer.deep).toBeUndefined();
    const core = t.answers.filter((a) => !a.deep);
    expect(core).toHaveLength(118); // 124 teams, six nicknames shared
    expect(core.filter((a) => a.plat).map((a) => a.canonical)).toEqual(["Blue Jackets"]);
  });

  it("gods: Egyptian, Greek and Roman in one pool", () => {
    const g = idx("gods");
    expect(g.lookup("Zeus")?.answer.canonical).toBe("Zeus");
    expect(g.lookup("Jupiter")?.answer.canonical).toBe("Jupiter");
    expect(g.lookup("Anubis")?.answer.canonical).toBe("Anubis");
    expect(g.lookup("apep")?.answer.canonical).toBe("Apophis");
    expect(g.answers.filter((a) => a.canonical === "Apollo")).toHaveLength(1);
    expect(g.lookup("Medusa")).toBeNull();
  });
});
