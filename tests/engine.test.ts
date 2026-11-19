import { beforeEach, describe, expect, it } from "vitest";
import { DigEngine, SERVER_GRACE_MS, seedFor } from "../src/game/engine/engine";
import { digSlots } from "../src/game/service/slots";
import { MemoryStore } from "../src/game/engine/memoryStore";
import { dayStart } from "../src/game/rules/schedule";
import { digTotal } from "../src/game/rules/levels";
import { SEEDS } from "../src/game/data/seeds";
import { GameError } from "../src/game/service/types";
import { SCORING, levelScore, pointsOf } from "../src/game/rules/scoring";
import { parseAnswerBlock } from "../src/game/rules/answerIndex";

const DAY = 29;
let clock = dayStart(DAY) + 3_600_000;
let n = 0;
let store: MemoryStore;
let eng: DigEngine;

beforeEach(() => {
  clock = dayStart(DAY) + 3_600_000;
  n = 0;
  store = new MemoryStore();
  eng = new DigEngine(store, { now: () => clock, newId: () => `t${++n}` });
});

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof GameError ? e.code : String(e);
  }
}

// plays a level to the end with the given answers
async function play(pid: string, level: 1 | 2 | 3, answers: string[], mode: "ranked" | "practice" = "ranked", day = DAY) {
  const st = await eng.start(pid, day, level, mode);
  for (const a of answers) await eng.submit(pid, st.attemptId, a);
  return eng.finish(pid, st.attemptId);
}

describe("dig slots", () => {
  it("never carry a category", () => {
    const d = digSlots(DAY);
    expect(d.levels.map((l) => [l.level, l.multiplier, l.scored, l.seconds])).toEqual([
      [1, SCORING.multipliers[1], 3, 45],
      [2, SCORING.multipliers[2], 3, 45],
      [3, SCORING.multipliers[3], 3, 45],
    ]);
    expect(JSON.stringify(d)).not.toMatch(/title|prompt|slug/);
  });

  it("every day draws each level from its own pool", () => {
    for (let d = 1; d <= 40; d++) for (const l of [1, 2, 3] as const) expect(seedFor(d, l).level).toBe(l);
  });
});

describe("ranked attempts", () => {
  it("reveal the category only on start, and rarity only on finish", async () => {
    const s = await eng.status("p", DAY);
    expect(JSON.stringify(s)).not.toMatch(/prompt/);
    const st = await eng.start("p", DAY, 1, "ranked");
    expect(st.challenge.prompt.length).toBeGreaterThan(3);
    expect(st.expiresAt - st.startedAt).toBe(45_000);
    const slug = seedFor(DAY, 1).slug;
    const first = SEEDS.find((x) => x.slug === slug)!.answers.trim().split("\n")[0].split(/[|=]/)[0].trim();
    const r = await eng.submit("p", st.attemptId, first);
    expect(r.status).toBe("accepted");
    expect(JSON.stringify(r)).not.toMatch(/rarity/);
  });

  it("go in level order, once per day", async () => {
    expect(await code(eng.start("p", DAY, 2, "ranked"))).toBe("locked");
    await play("p", 1, []);
    expect(await code(eng.start("p", DAY, 1, "ranked"))).toBe("already_played");
    expect(await code(eng.start("p", DAY, 3, "ranked"))).toBe("locked");
    await play("p", 2, []);
    await play("p", 3, []);
    const s = await eng.status("p", DAY);
    expect(s.next).toBeNull();
    expect(s.ranked.map((r) => r.level)).toEqual([1, 2, 3]);
  });

  it("are only for today", async () => {
    expect(await code(eng.start("p", DAY - 1, 1, "ranked"))).toBe("locked");
    expect(await code(eng.start("p", DAY + 1, 1, "ranked"))).toBe("not_open");
    expect(await code(eng.status("p", DAY + 1))).toBe("not_open");
  });

  it("resume after a closed tab, with the clock still running", async () => {
    const st = await eng.start("p", DAY, 1, "ranked");
    await eng.submit("p", st.attemptId, "pug");
    await eng.submit("p", st.attemptId, "beagle");
    clock += 20_000;
    const again = await eng.start("p", DAY, 1, "ranked");
    expect(again.attemptId).toBe(st.attemptId);
    expect(again.expiresAt).toBe(st.expiresAt);
    expect(again.serverNow).toBe(clock);
  });

  it("close themselves once the clock runs out", async () => {
    const st = await eng.start("p", DAY, 1, "ranked");
    clock += 45_000 + SERVER_GRACE_MS - 1;
    expect((await eng.submit("p", st.attemptId, "zzzz")).status).toBe("rejected");
    clock += 2;
    expect((await eng.submit("p", st.attemptId, "pug")).status).toBe("expired");
    const s = await eng.status("p", DAY);
    expect(s.ranked).toHaveLength(1);
    expect(s.next).toBe(2);
    expect(await code(eng.start("p", DAY, 1, "ranked"))).toBe("already_played");
  });

  it("belong to one player", async () => {
    const st = await eng.start("p", DAY, 1, "ranked");
    expect(await code(eng.submit("q", st.attemptId, "pug"))).toBe("forbidden");
    expect(await code(eng.finish("q", st.attemptId))).toBe("forbidden");
    expect(await code(eng.finish("q", "nope"))).toBe("not_found");
  });
});

describe("scoring on the server", () => {
  it("dedupes aliases, scores the rarest, and finish is idempotent", async () => {
    clock = dayStart(1) + 1000; // day 1 is dog breeds on level 1
    eng = new DigEngine(store, { now: () => clock });
    const st = await eng.start("p", 1, 1, "ranked");
    expect(st.challenge.title).toMatch(/dog/i);
    expect((await eng.submit("p", st.attemptId, "Labrador")).status).toBe("accepted");
    expect((await eng.submit("p", st.attemptId, "lab")).status).toBe("duplicate");
    for (const t of ["pug", "beagle", "mudi", "azawakh", "nonsense dog", "poodle", "boxer", "basenji"]) await eng.submit("p", st.attemptId, t);
    const r = await eng.finish("p", st.attemptId);
    expect(r.top).toHaveLength(3);
    expect(r.top[0]).toMatchObject({ name: "Mudi", rarity: 100, tier: "platinum" });
    const s = levelScore(r.top, 1);
    expect(r.score).toBe(s.raw);
    expect(r.score).toBe(r.top.reduce((n, t) => n + SCORING.points[t.tier!], 0));
    expect(r.points).toBe(r.score); // level 1 is x1
    expect(r.rejected).toEqual(["nonsense dog"]);
    expect(r.challenge.level).toBe(1);
    clock += 5000;
    expect(await eng.finish("p", st.attemptId)).toEqual(r);
    expect((await eng.submit("p", st.attemptId, "puli")).status).toBe("expired");
  });

  it("deeper levels multiply", async () => {
    await play("p", 1, []);
    await play("p", 2, []);
    const r = await play("p", 3, ["hydrogen", "oganesson", "thulium", "gold", "english", "femur", "zeus"]);
    expect(r.points).toBe(Math.round(r.score * SCORING.multipliers[3]));
    expect(r.top.length).toBeLessThanOrEqual(3);
    expect(digTotal([100, 160, 150])).toBe(410);
    expect(digTotal([-40, -30, 20])).toBe(0);
  });

  it("caps submissions per attempt", async () => {
    const st = await eng.start("p", DAY, 1, "ranked");
    for (let i = 0; i < 400; i++) await store.bumpSubmissions(st.attemptId);
    expect((await eng.submit("p", st.attemptId, "pug")).status).toBe("rejected");
  });
});

describe("practice", () => {
  it("opens past digs any number of times, and today only after the ranked dig", async () => {
    await play("p", 2, [], "practice", DAY - 3);
    await play("p", 2, [], "practice", DAY - 3);
    expect(await code(eng.start("p", DAY - 4, 1, "practice"))).toBe("locked"); // past the free window
    expect(await code(eng.start("p", DAY - 4, 1, "practice", { unlimited: true }))).toBe("ok");
    expect(await code(eng.start("p", DAY, 1, "practice"))).toBe("locked");
    await play("p", 1, []);
    await play("p", 2, []);
    await play("p", 3, []);
    expect(await code(eng.start("p", DAY, 1, "practice"))).toBe("ok");
  });

  it("never touches the board", async () => {
    await play("p", 1, ["pug"], "practice", DAY - 1);
    expect(await eng.board("p", DAY - 1)).toEqual([]);
  });
});

describe("board", () => {
  it("posts accounts only, shows a guest their own unposted score, and hides ids", async () => {
    await play("p", 1, ["pug", "beagle"]);
    await play("q", 1, []);
    await store.claimAccount("q", { username: "Rocky", passwordHash: "x", email: null });
    const asGuest = await eng.board("p", DAY);
    expect(asGuest.map((r) => [r.name, r.posted, !!r.isYou])).toEqual([
      ["Rocky", true, false],
      ["Guest", false, true],
    ]);
    const asRocky = await eng.board("q", DAY);
    expect(asRocky).toHaveLength(1);
    expect(asRocky[0]).toMatchObject({ name: "Rocky", isYou: true, posted: true });
    expect(JSON.stringify(asGuest)).not.toMatch(/"p"|"q"/);
  });

  it("a guest who signs up keeps today's runs and appears on the board", async () => {
    await play("p", 1, []);
    await store.claimAccount("p", { username: "digger_1", passwordHash: "x", email: null });
    expect((await eng.board(null, DAY))[0].name).toBe("digger_1");
    await expect(store.claimAccount("q", { username: "DIGGER_1", passwordHash: "x", email: null })).rejects.toThrow();
  });
});

describe("accounts in the store", () => {
  it("finds usernames ignoring case and expires sessions", async () => {
    await store.ensurePlayer("p");
    await store.claimAccount("p", { username: "Rocky", passwordHash: "h", email: null });
    expect(await store.findAccount("rOcKy")).toEqual({ playerId: "p", username: "Rocky", passwordHash: "h" });
    await store.createSession("t1", "p", 1000);
    expect(await store.sessionPlayer("t1", 999)).toBe("p");
    expect(await store.sessionPlayer("t1", 1001)).toBeNull();
    await store.deleteSession("t1");
    expect(await store.sessionPlayer("t1", 0)).toBeNull();
  });
});

describe("real rarity", () => {
  it("comes from earlier days' players and stays frozen while a day is played", async () => {
    clock = dayStart(1) + 3_600_000; // dog breeds on level 1
    eng = new DigEngine(store, { now: () => clock });
    const before = await eng.start("x", 1, 1, "ranked");
    await eng.submit("x", before.attemptId, "pug");
    const r0 = await eng.finish("x", before.attemptId);
    const pug0 = r0.accepted[0].rarity;

    // 300 players on earlier dog-breed days all type "mudi" (the estimated Platinum)
    for (let i = 0; i < 300; i++) {
      await store.insertAttempt({ id: `h${i}`, playerId: `h${i}`, day: 0 as number, level: 1, mode: "ranked", slug: "dog-breeds", startedAt: 0, expiresAt: 1, finishedAt: 1, score: 0, points: 0, uniqueCount: 1, submissions: 1 });
      await store.addAnswer(`h${i}`, "dog-breeds:mudi");
    }
    // day 1 was already being scored, so it doesn't move
    const again = await eng.finish("x", before.attemptId);
    expect(again.accepted[0].rarity).toBe(pug0);

    const fresh = new DigEngine(store, { now: () => clock });
    const live = await fresh.rarity("dog-breeds", 1);
    expect(live.get("dog-breeds:mudi")!.rarity).toBeLessThan(10); // everyone says it now
    expect(live.get("dog-breeds:mudi")!.pct).toBeGreaterThan(50);
    const plat = [...live.entries()].find(([, v]) => v.rarity === 100)!;
    expect(plat[0]).not.toBe("dog-breeds:mudi");
  });
});

import { quickMatch } from "../src/game/rules/quickCheck";

describe("instant answer check", () => {
  it("knows answers, aliases, plurals, typos and sound-alikes at once, agrees with the server, and leaks no names", async () => {
    clock = dayStart(1) + 1000; // dog breeds
    eng = new DigEngine(store, { now: () => clock });
    const st = await eng.start("p", 1, 1, "ranked");
    const check = st.check!;
    const num = (t: string) => quickMatch(check, t)?.num ?? null;
    const lab = num("Labrador");
    expect(lab).not.toBeNull();
    expect(num("lab")).toBe(lab);
    expect(num("labradors")).toBe(lab);
    expect(num("pugs")).not.toBeNull();
    expect(quickMatch(check, "labrdor")).toEqual({ num: lab, corrected: true }); // missing letter
    expect(quickMatch(check, "beegle")?.corrected).toBe(true); // wrong letter
    expect(num("beegle")).toBe(num("beagle"));
    expect(num("chiwawa")).toBe(num("chihuahua")); // sounds like
    expect(num("zzzz")).toBeNull();
    // the server agrees on every instant match
    for (const t of ["Labrador", "beegle", "chiwawa", "pugs"]) {
      const r = await eng.submit("p", st.attemptId, t);
      expect(r.num, t).toBe(num(t));
    }
    const json = JSON.stringify(check);
    expect(json).not.toMatch(/labrador|poodle|mudi|beagle/i);
    // resuming hands back the found numbers
    const again = await eng.start("p", 1, 1, "ranked");
    expect(again.found).toContain(lab);
  }, 20_000); // builds the full dog-breed lookup; slow when the test files run in parallel

  it("is fast: thousands of lookups per millisecond-scale budget", async () => {
    clock = dayStart(1) + 1000;
    eng = new DigEngine(store, { now: () => clock });
    const st = await eng.start("p", 1, 1, "ranked");
    const words = ["labrador", "beegle", "chiwawa", "zzzzzz", "kooikerhondje", "notadogatall"];
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) quickMatch(st.check!, words[i % words.length]);
    const per = (performance.now() - t0) / 1000;
    expect(per).toBeLessThan(1); // well under a millisecond each
  });
});

describe("admin reset", () => {
  it("removes only that player's runs for the day and reopens the dig", async () => {
    await play("p", 1, ["pug"]);
    await play("q", 1, []);
    await store.deleteAttempts("p", DAY);
    expect((await eng.status("p", DAY)).next).toBe(1);
    expect((await eng.status("q", DAY)).next).toBe(2);
    expect(await code(eng.start("p", DAY, 1, "ranked"))).toBe("ok");
  });
});

describe("password reset and account deletion in the store", () => {
  it("reset links are single use and expire", async () => {
    await store.ensurePlayer("p");
    await store.claimAccount("p", { username: "Rocky", passwordHash: "old", email: "r@x.io" });
    expect(await store.findByLogin("R@X.IO")).toMatchObject({ playerId: "p", email: "r@x.io" });
    expect(await store.findByLogin("rocky")).toMatchObject({ playerId: "p" });
    await store.createReset("h1", "p", 1000);
    expect(await store.useReset("h1", 500)).toBe("p");
    expect(await store.useReset("h1", 500)).toBeNull(); // used
    await store.createReset("h2", "p", 1000);
    expect(await store.useReset("h2", 2000)).toBeNull(); // expired
    await store.setPassword("p", "new");
    expect((await store.findAccount("rocky"))!.passwordHash).toBe("new");
  });

  it("deleting a player removes their runs, sessions and board row", async () => {
    await play("p", 1, ["pug"]);
    await store.claimAccount("p", { username: "Rocky", passwordHash: "x", email: null });
    await store.createSession("s", "p", Date.now() + 1e6);
    await store.deletePlayer("p");
    expect(await eng.board(null, DAY)).toEqual([]);
    expect(await store.sessionPlayer("s", Date.now())).toBeNull();
    expect(await store.getPlayer("p")).toBeNull();
    expect(await store.findAccount("rocky")).toBeNull();
  });
});

describe("demo dig", () => {
  it("plays a chosen category as unranked practice, even before today's ranked dig", async () => {
    const st = await eng.start("p", DAY, 2, "practice", { slug: "nba-teams" });
    expect(st.challenge.title).toBe("NBA teams");
    expect((await eng.submit("p", st.attemptId, "lakers")).status).toBe("accepted");
    const r = await eng.finish("p", st.attemptId);
    expect(r.mode).toBe("practice");
    expect(r.challenge.title).toBe("NBA teams");
    expect((await eng.status("p", DAY)).next).toBe(1); // ranked dig untouched
    expect(await eng.board("p", DAY)).toEqual([]);
  });

  it("refuses ranked mode, unknown categories and the wrong level", async () => {
    expect(await code(eng.start("p", DAY, 2, "ranked", { slug: "nba-teams" }))).toBe("bad_request");
    expect(await code(eng.start("p", DAY, 2, "practice", { slug: "nope" }))).toBe("bad_request");
    expect(await code(eng.start("p", DAY, 1, "practice", { slug: "nba-teams" }))).toBe("bad_request");
  });
});

describe("Vault games", () => {
  it("plays a free Vault game's prompts as unranked practice", async () => {
    const st = await eng.start("p", DAY, 1, "practice", { vault: 1 });
    expect(st.challenge.title).toBe("Trees");
    expect((await eng.submit("p", st.attemptId, "oak tree")).status).toBe("accepted");
    const r = await eng.finish("p", st.attemptId);
    expect(r.mode).toBe("practice");
    expect((await eng.status("p", DAY)).next).toBe(1); // ranked dig untouched
  });

  it("rewards specific species: White Oak and Virginia Pine are their own, rarer answers", async () => {
    const st = await eng.start("p", DAY, 1, "practice", { vault: 1 });
    for (const t of ["oak", "white oak", "virginia pine", "pine"]) expect((await eng.submit("p", st.attemptId, t)).status, t).toBe("accepted");
    const r = await eng.finish("p", st.attemptId);
    const by = Object.fromEntries(r.accepted.map((a) => [a.name, a.rarity]));
    expect(by["White Oak"]).toBeGreaterThan(by["Oak"]);
    expect(by["Virginia Pine"]).toBeGreaterThan(by["Pine"]);
  });

  it("counts numbered missions, empires as lost countries, and luxury cars", async () => {
    const play = async (game: number, level: 1 | 2 | 3, words: string[]) => {
      const st = await eng.start("p", DAY, level, "practice", { vault: game, unlimited: true });
      for (const w of words) expect((await eng.submit("p", st.attemptId, w)).status, w).toBe("accepted");
      return Object.fromEntries((await eng.finish("p", st.attemptId)).accepted.map((a) => [a.name, a.rarity]));
    };
    const space = await play(5, 3, ["voyager", "voyager 2", "apollo", "apollo 17"]);
    expect(space["Voyager 2"]).toBeGreaterThan(space["Voyager"]);
    expect(space["Apollo 17"]).toBeGreaterThan(space["Apollo"]);
    await play(8, 3, ["ottoman empire", "persia", "soviet union"]);
    await play(8, 2, ["ferrari", "ray ban", "rolex"]);
    const fish = await play(2, 2, ["trout", "rainbow trout", "largemouth bass"]);
    expect(fish["Rainbow Trout"]).toBeGreaterThan(fish["Trout"]);
  });

  it("needs Unlimited past the free games, and refuses bad requests", async () => {
    expect(await code(eng.start("p", DAY, 1, "practice", { vault: 4 }))).toBe("locked");
    expect(await code(eng.start("p", DAY, 1, "practice", { vault: 4, unlimited: true }))).toBe("ok");
    expect(await code(eng.start("p", DAY, 1, "ranked", { vault: 1 }))).toBe("bad_request");
    expect(await code(eng.start("p", DAY, 1, "practice", { vault: 999 }))).toBe("bad_request");
    expect(await code(eng.start("p", DAY - 1, 1, "practice", { vault: 1 }))).toBe("bad_request");
  });
});

describe("all answers", () => {
  it("lists every answer after the level, found ones marked, and stays locked during it", async () => {
    const st = await eng.start("p", DAY, 1, "practice", { vault: 1 });
    await eng.submit("p", st.attemptId, "oak");
    expect(await code(eng.allAnswers("p", st.attemptId))).toBe("locked");
    await eng.finish("p", st.attemptId);
    const all = await eng.allAnswers("p", st.attemptId);
    expect(all.length).toBeGreaterThan(100);
    expect(all.find((a) => a.name === "Oak")?.found).toBe(true);
    expect(all.filter((a) => a.found)).toHaveLength(1);
    expect(all[0].tier).toBe("platinum");
    expect(await code(eng.allAnswers("someone-else", st.attemptId))).toBe("forbidden");
  });
});

describe("admin panel in the store", () => {
  it("shares idea statuses, admin changes and the activity log", async () => {
    await eng.suggest("g1", "Board games from the 80s");
    const [idea] = await store.listSuggestions(10);
    expect(idea.status).toBe("new");
    expect(await store.setSuggestionStatus(idea.id!, "planned", "caleb", 5)).toBe(idea.text);
    expect((await store.listSuggestions(10))[0]).toMatchObject({ status: "planned", updatedBy: "caleb" });
    expect(await store.setSuggestionStatus(999, "added", "caleb", 6)).toBeNull();
    await store.ensurePlayer("p2");
    await store.claimAccount("p2", { username: "Helper", passwordHash: "x", email: null });
    expect(await store.setAdminByUsername("helper", true)).toBe("p2");
    expect((await store.listAdmins()).map((a) => a.username)).toEqual(["Helper"]);
    expect(await store.setAdminByUsername("nobody", true)).toBeNull();
    await store.addAdminLog({ actor: "caleb", action: "admin_added", detail: "Helper", at: 7 });
    expect((await store.listAdminLog(5))[0]).toMatchObject({ actor: "caleb", detail: "Helper" });
    const st = await store.adminStats(DAY);
    expect(st.accounts).toBe(1);
  });
});

describe("prompt ideas", () => {
  it("stores trimmed ideas from guests and refuses links or empty text", async () => {
    await eng.suggest("guest-1", "  Board   games from the 80s ");
    expect(await code(eng.suggest("guest-1", "x"))).toBe("bad_request");
    expect(await code(eng.suggest("guest-1", "see https://spam.example"))).toBe("bad_request");
    const list = await store.listSuggestions(10);
    expect(list.map((s) => s.text)).toEqual(["Board games from the 80s"]);
    expect(list[0].day).toBe(DAY);
  });
});

describe("Digly Unlimited in the store", () => {
  const buy = (id: string, pi: string) => ({ id, playerId: "p", product: "unlimited", amount: 500, currency: "usd", paymentIntent: pi });

  it("grants once even if Stripe sends the event twice, and a refund takes it back", async () => {
    await store.ensurePlayer("p");
    await store.grantUnlimited(buy("cs_1", "pi_1"));
    await store.grantUnlimited(buy("cs_1", "pi_1"));
    expect((await store.getPlayer("p"))!.unlimited).toBe(true);
    expect(await store.revokeByPaymentIntent("pi_unknown")).toBeNull();
    expect(await store.revokeByPaymentIntent("pi_1")).toBe("p");
    expect((await store.getPlayer("p"))!.unlimited).toBe(false);
  });

  it("keeps access when another paid purchase remains", async () => {
    await store.ensurePlayer("p");
    await store.grantUnlimited(buy("cs_1", "pi_1"));
    await store.grantUnlimited(buy("cs_2", "pi_2"));
    await store.revokeByPaymentIntent("pi_1");
    expect((await store.getPlayer("p"))!.unlimited).toBe(true);
  });
});

describe("admin answer edits", () => {
  it("add, change, remove and undo reach play without a restart", async () => {
    const slug = seedFor(DAY, 1).slug;
    const made = "Zzqx Testanswer";
    const st = await eng.start("p", DAY, 1, "ranked");
    expect((await eng.submit("p", st.attemptId, made)).status).toBe("rejected");

    await eng.editAnswer("ann", slug, { action: "add", name: made, aliases: ["zzqx"], rating: 90 });
    expect((await eng.submit("p", st.attemptId, "zzqx")).status).toBe("accepted");
    const list = await eng.answerList(slug);
    expect(list.answers.find((a) => a.name === made)?.status).toBe("added");

    // a second server sees it once its cache runs out
    const other = new DigEngine(store, { now: () => clock, newId: () => `o${++n}` });
    const st2 = await other.start("q", DAY, 1, "ranked");
    expect((await other.submit("q", st2.attemptId, made)).status).toBe("accepted");

    // rename through the editor: the old spelling stops counting
    const key = list.answers.find((a) => a.name === made)!.key;
    await eng.editAnswer("ann", slug, { action: "add", name: "Zzqx Renamed", rating: 90, replaces: key });
    const after = await eng.answerList(slug);
    expect(after.answers.some((a) => a.name === made)).toBe(false);

    const first = after.answers.find((a) => a.status === "list")!;
    await eng.editAnswer("ann", slug, { action: "remove", name: first.name });
    const st3 = await eng.start("r", DAY, 1, "ranked");
    expect((await eng.submit("r", st3.attemptId, first.name)).status).toBe("rejected");
    await eng.undoAnswerEdit(slug, first.key);
    expect((await eng.submit("r", st3.attemptId, first.name)).status).toBe("accepted");
  });

  it("refuses names that clash or break the list", async () => {
    const slug = seedFor(DAY, 1).slug;
    const first = (await eng.answerList(slug)).answers[0];
    expect(await code(eng.editAnswer("ann", slug, { action: "add", name: "x = 5" }))).toBe("bad_request");
    expect(await code(eng.editAnswer("ann", slug, { action: "add", name: "Fresh One", aliases: [first.name] }))).toBe("bad_request");
    expect(await code(eng.editAnswer("ann", slug, { action: "remove", name: "Not In The List Qq" }))).toBe("not_found");
  });
});

describe("caching across servers", () => {
  it("a guess on a server holding a stale copy is refused once another server finished the level", async () => {
    const st = await eng.start("p", DAY, 1, "ranked");
    const name = parseAnswerBlock(seedFor(DAY, 1).answers, "x")[0].canonical;
    expect((await eng.submit("p", st.attemptId, name)).status).toBe("accepted");
    const other = new DigEngine(store, { now: () => clock });
    const res = await other.finish("p", st.attemptId);
    expect(res.accepted).toHaveLength(1);
    // eng still has the attempt cached as open
    expect((await eng.submit("p", st.attemptId, "anything")).status).toBe("expired");
    expect(await code(eng.submit("q", st.attemptId, name))).toBe("forbidden");
  });

  it("finish and status give the same results as before", async () => {
    const st = await eng.start("p", DAY, 1, "ranked");
    const names = parseAnswerBlock(seedFor(DAY, 1).answers, "x").slice(0, 3).map((a) => a.canonical);
    for (const n of names) await eng.submit("p", st.attemptId, n);
    await eng.submit("p", st.attemptId, "qqq nope");
    const fin = await eng.finish("p", st.attemptId);
    const again = await eng.finish("p", st.attemptId);
    const status = await new DigEngine(store, { now: () => clock }).status("p", DAY);
    for (const r of [again, status.ranked[0]]) {
      expect(r.points).toBe(fin.points);
      expect(r.accepted.map((a) => a.name)).toEqual(fin.accepted.map((a) => a.name));
      expect(r.rejected).toEqual(["qqq nope"]);
    }
  });
});

describe("history for other devices", () => {
  it("returns whole digs only: three ranked levels, or a full practice or Vault run", async () => {
    const names = (lvl: 1 | 2 | 3) => parseAnswerBlock(seedFor(DAY, lvl).answers, "x").slice(0, 2).map((a) => a.canonical);
    const r1 = await play("p", 1, names(1));
    const r2 = await play("p", 2, names(2));
    const r3 = await play("p", 3, names(3));
    // a full Vault run of game 1, and only level 1 of game 2
    let vaultTotal = 0;
    for (const level of [1, 2, 3] as const) {
      const st = await eng.start("p", DAY, level, "practice", { vault: 1 });
      vaultTotal += (await eng.finish("p", st.attemptId)).points;
    }
    const lone = await eng.start("p", DAY, 1, "practice", { vault: 2 });
    await eng.finish("p", lone.attemptId);

    const h = await eng.history("p");
    expect(h.ranked).toEqual([{ day: DAY, score: r1.points + r2.points + r3.points, unique: 6, finishedAt: expect.any(Number) }]);
    expect(h.vault).toHaveLength(1);
    expect(h.vault[0]).toMatchObject({ game: 1, best: vaultTotal });
    expect(h.vault[0].titles).toHaveLength(3);
    expect(h.practice).toEqual([]);
    expect(await eng.history("someone-else")).toEqual({ ranked: [], practice: [], vault: [] });
  });

  it("leaves out a ranked day that isn't finished", async () => {
    await play("p", 1, []);
    await play("p", 2, []);
    expect((await eng.history("p")).ranked).toEqual([]);
  });
});

describe("best topics", () => {
  it("needs a few plays per topic and reports strength against the average", async () => {
    const at = clock;
    const add = (id: string, pid: string, slug: string, level: 1 | 2 | 3, pts: number) =>
      store.insertAttempt({ id, playerId: pid, day: DAY, level, mode: "practice", slug, startedAt: at, expiresAt: at + 1, finishedAt: at + 1, score: pts, points: pts, uniqueCount: 1, submissions: 1 });
    let n = 0;
    for (let i = 0; i < 5; i++) {
      await add(`x${++n}`, "me", "fruits", 1, 150);
      await add(`x${++n}`, "you", "fruits", 1, 50);
      await add(`x${++n}`, "me", "rivers", 3, 50);
      await add(`x${++n}`, "you", "rivers", 3, 150);
    }
    const t = await eng.topics("me");
    expect(t.map((x) => [x.topic, x.strength, x.plays])).toEqual([
      ["food", 150, 5],
      ["geography", 50, 5],
    ]);
    expect(await eng.topics("nobody")).toEqual([]);
    expect(eng.topicMap()["greek-myth"]).toBe("history");
    expect(eng.topicMap()["dog-breeds"]).toBe("nature");
  });
});

describe("deep cuts", () => {
  it("a past team name scores Ruby plus the bonus and leads the best three", async () => {
    // day 43 level 2 is the merged teams prompt
    const day = 43;
    clock = dayStart(day) + 3_600_000;
    for (const l of [1] as const) {
      const st = await eng.start("p", day, l, "ranked");
      await eng.finish("p", st.attemptId);
    }
    const st = await eng.start("p", day, 2, "ranked");
    expect(st.challenge.title).toBe("Pro sports teams");
    for (const a of ["Texas Rangers", "Rangers", "Yankees", "Hartford Whalers"]) await eng.submit("p", st.attemptId, a);
    const r = await eng.finish("p", st.attemptId);
    expect(r.accepted.map((a) => a.name)).toEqual(["Rangers", "Yankees", "Whalers"]);
    const whalers = r.accepted.find((a) => a.name === "Whalers")!;
    expect(whalers).toMatchObject({ tier: "ruby", deep: true });
    expect(r.top[0].name).toBe("Whalers");
    expect(r.rarest.some((a) => a.deep)).toBe(false);
    expect(r.score).toBe(r.top.reduce((s, a) => s + pointsOf(a), 0));
  });
});
