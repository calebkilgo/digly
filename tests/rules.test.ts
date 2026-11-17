import { describe, expect, it } from "vitest";
import { normalize, editDistance } from "../src/game/rules/normalize";
import { AnswerIndex, parseAnswerBlock } from "../src/game/rules/answerIndex";
import { finalScore, topThree, tierFor, percentile, foundByPct, MAX_SCORE } from "../src/game/rules/scoring";
import { rankEntries } from "../src/game/rules/leaderboard";
import { isAcceptingSubmissions, expiresAt, ROUND_MS, LATE_GRACE_MS } from "../src/game/rules/timer";
import { dayNumber, nextResetAt, LAUNCH_DAY_UTC } from "../src/game/rules/schedule";
import { SEEDS } from "../src/game/data/seeds";

describe("normalize", () => {
  it("folds case, accents, punctuation and spacing", () => {
    expect(normalize("  Côte d'Ivoire ")).toBe("cote divoire");
    expect(normalize("SHIH-TZU")).toBe("shih tzu");
    expect(normalize("Black & Tan Coonhound")).toBe("black and tan coonhound");
    expect(normalize("St. Bernard")).toBe("saint bernard");
    expect(normalize("The Gambia")).toBe("gambia");
    expect(normalize("!!!")).toBe("");
  });

  it("edit distance handles transpositions", () => {
    expect(editDistance("beagle", "baegle", 1)).toBe(1);
    expect(editDistance("poodle", "poodle")).toBe(0);
    expect(editDistance("abc", "xyz", 1)).toBe(2);
  });
});

const block = `
Labrador Retriever | labrador, lab = 2
Shih Tzu | shitzu = 14
Saint Bernard = 22
Pug = 8
Weimaraner = 45
Norwegian Lundehund | lundehund = 96
`;

describe("answer index", () => {
  const idx = new AnswerIndex(parseAnswerBlock(block, "t"));

  it("matches canonical names and aliases to one answer", () => {
    expect(idx.lookup("labrador retriever")?.answer.canonical).toBe("Labrador Retriever");
    expect(idx.lookup("Lab")?.answer.canonical).toBe("Labrador Retriever");
    expect(idx.lookup("lab")?.kind).toBe("alias");
    expect(idx.lookup("shitzu")?.answer.canonical).toBe("Shih Tzu");
    expect(idx.lookup("shihtzu")?.answer.canonical).toBe("Shih Tzu");
    expect(idx.lookup("st bernard")?.answer.canonical).toBe("Saint Bernard");
  });

  it("accepts simple plurals", () => {
    expect(idx.lookup("pugs")?.kind).toBe("plural");
  });

  it("forgives one typo on long names only", () => {
    expect(idx.lookup("weimeraner")?.answer.canonical).toBe("Weimaraner");
    expect(idx.lookup("pig")).toBeNull();
    expect(idx.lookup("lub")).toBeNull();
  });

  it("rejects unknown and empty input", () => {
    expect(idx.lookup("labradoodle")).toBeNull();
    expect(idx.lookup("   ")).toBeNull();
  });

  it("throws on alias collisions between different answers", () => {
    expect(() => new AnswerIndex(parseAnswerBlock("A | x = 1\nB | x = 2", "c"))).toThrow(/collision/);
  });

  it("every seed builds without collisions", () => {
    for (const s of SEEDS) expect(() => new AnswerIndex(parseAnswerBlock(s.answers, s.slug))).not.toThrow();
  });

  it("African countries seed has all 54 states", () => {
    const s = SEEDS.find((x) => x.slug === "african-countries")!;
    expect(parseAnswerBlock(s.answers, s.slug)).toHaveLength(54);
  });

  it("US states seed has all 50", () => {
    const s = SEEDS.find((x) => x.slug === "us-states")!;
    expect(parseAnswerBlock(s.answers, s.slug)).toHaveLength(50);
  });

  it("elements seed has all 118", () => {
    const s = SEEDS.find((x) => x.slug === "elements")!;
    expect(parseAnswerBlock(s.answers, s.slug)).toHaveLength(118);
  });
});

describe("scoring", () => {
  it("sums the three rarest", () => {
    const a = [
      { name: "a", rarity: 10 },
      { name: "b", rarity: 90 },
      { name: "c", rarity: 40 },
      { name: "d", rarity: 70 },
    ];
    expect(topThree(a).map((x) => x.name)).toEqual(["b", "d", "c"]);
    expect(finalScore(a)).toBe(200);
  });

  it("missing slots count zero", () => {
    expect(finalScore([{ name: "a", rarity: 55 }])).toBe(55);
    expect(finalScore([])).toBe(0);
  });

  it("caps at 300", () => {
    const a = Array.from({ length: 6 }, (_, i) => ({ name: String(i), rarity: 100 }));
    expect(finalScore(a)).toBe(MAX_SCORE);
  });

  it("maps rarity to gem tiers", () => {
    expect(tierFor(1).key).toBe("copper");
    expect(tierFor(40).key).toBe("copper");
    expect(tierFor(60).key).toBe("gold");
    expect(tierFor(85).key).toBe("gold");
    expect(tierFor(95).key).toBe("diamond");
    expect(tierFor(100).key).toBe("platinum");
  });

  it("compares a score against other players", () => {
    expect(percentile(200, [100, 150, 250, 300])).toBe(50);
    expect(percentile(200, [200, 200])).toBe(50);
    expect(percentile(10, [])).toBe(100);
    expect(foundByPct(96)).toBe(5);
    expect(foundByPct(1)).toBe(99);
  });
});

describe("timer", () => {
  it("accepts within the window plus grace, rejects after", () => {
    const end = expiresAt(1000);
    expect(end).toBe(1000 + ROUND_MS);
    expect(isAcceptingSubmissions(end, end)).toBe(true);
    expect(isAcceptingSubmissions(end, end + LATE_GRACE_MS)).toBe(true);
    expect(isAcceptingSubmissions(end, end + LATE_GRACE_MS + 1)).toBe(false);
  });
});

describe("schedule", () => {
  it("resets at 00:00 UTC", () => {
    expect(dayNumber(LAUNCH_DAY_UTC)).toBe(1);
    expect(dayNumber(LAUNCH_DAY_UTC + 86_399_999)).toBe(1);
    expect(nextResetAt(LAUNCH_DAY_UTC + 5)).toBe(LAUNCH_DAY_UTC + 86_400_000);
  });
});

describe("leaderboard", () => {
  it("ranks by score, then unique answers, sharing full ties", () => {
    const r = rankEntries([
      { id: "a", name: "a", score: 200, unique: 10 },
      { id: "b", name: "b", score: 250, unique: 3 },
      { id: "c", name: "c", score: 200, unique: 12 },
      { id: "d", name: "d", score: 200, unique: 10 },
      { id: "e", name: "e", score: 120, unique: 30 },
    ]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
      ["d", 3],
      ["e", 5],
    ]);
  });
});

describe("calibrated rarity", () => {
  it("every category has exactly one Platinum and only a few Diamonds", () => {
    for (const s of SEEDS) {
      const recs = parseAnswerBlock(s.answers, s.slug);
      expect(recs.filter((r) => r.rarity === 100), s.slug).toHaveLength(1);
      const diamonds = recs.filter((r) => tierFor(r.rarity).key === "diamond").length;
      expect(diamonds, s.slug).toBeGreaterThan(0);
      expect(diamonds / recs.length, s.slug).toBeLessThan(0.07);
      // rarer curated values never score lower
      const sorted = [...recs].sort((a, b) => a.curated - b.curated);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].rarity).toBeGreaterThanOrEqual(sorted[i - 1].rarity);
    }
  });

  it("most answers are common and gold or better is about a quarter", () => {
    const recs = parseAnswerBlock(SEEDS[0].answers, SEEDS[0].slug);
    const goldUp = recs.filter((r) => r.rarity >= 56).length / recs.length;
    expect(goldUp).toBeGreaterThan(0.18);
    expect(goldUp).toBeLessThan(0.32);
  });
});

describe("answer correction", () => {
  const dogs = new AnswerIndex(parseAnswerBlock(SEEDS.find((s) => s.slug === "dog-breeds")!.answers, "d"));
  const africa = new AnswerIndex(parseAnswerBlock(SEEDS.find((s) => s.slug === "african-countries")!.answers, "a"));
  const langs = new AnswerIndex(parseAnswerBlock(SEEDS.find((s) => s.slug === "languages")!.answers, "l"));

  it("fixes sound-alike spellings", () => {
    expect(dogs.lookup("chiwawa")?.answer.canonical).toBe("Chihuahua");
    expect(dogs.lookup("chiwawa")?.kind).toBe("sounds-like");
    expect(dogs.lookup("dashund")?.answer.canonical).toBe("Dachshund");
    expect(dogs.lookup("rottwiler")?.answer.canonical).toBe("Rottweiler");
  });

  it("strips filler words and fixes word order", () => {
    expect(dogs.lookup("beagle dog")?.answer.canonical).toBe("Beagle");
    expect(dogs.lookup("retriever labrador")?.answer.canonical).toBe("Labrador Retriever");
    expect(africa.lookup("the country of chad")?.answer.canonical).toBe("Chad");
  });

  it("accepts a distinctive first word", () => {
    expect(dogs.lookup("rhodesian")?.answer.canonical).toBe("Rhodesian Ridgeback");
    expect(dogs.lookup("great")).toBeNull();
    expect(dogs.lookup("german")).toBeNull();
  });

  it("fixes longer typos but stays strict on short or ambiguous ones", () => {
    expect(langs.lookup("portugese")?.answer.canonical).toBe("Portuguese");
    expect(dogs.lookup("pig")).toBeNull();
    expect(africa.lookup("nigeri")).toBeNull(); // Niger or Nigeria?
    expect(dogs.lookup("labradoodle")).toBeNull();
  });
});

