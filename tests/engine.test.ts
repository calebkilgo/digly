import { beforeEach, describe, expect, it } from "vitest";
import { DigEngine, SERVER_GRACE_MS, seedFor } from "../src/game/engine/engine";
import { digSlots } from "../src/game/service/slots";
import { MemoryStore } from "../src/game/engine/memoryStore";
import { dayStart } from "../src/game/rules/schedule";
import { digTotal } from "../src/game/rules/levels";
import { SEEDS } from "../src/game/data/seeds";
import { GameError } from "../src/game/service/types";

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
      [1, 1, 5, 60],
      [2, 2, 3, 40],
      [3, 8, 1, 20],
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
    expect(st.expiresAt - st.startedAt).toBe(60_000);
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
    clock += 60_000 + SERVER_GRACE_MS - 1;
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
    expect(r.top).toHaveLength(5);
    expect(r.top[0]).toMatchObject({ name: "Mudi", rarity: 100 });
    expect(r.score).toBe(r.top.reduce((s, t) => s + t.rarity, 0));
    expect(r.points).toBe(r.score);
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
    expect(r.points).toBe(r.score * 8);
    expect(r.top.length).toBeLessThanOrEqual(1);
    expect(digTotal([100, 2 * 80, 3 * 50])).toBe(410);
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
  it("knows answers, aliases and plurals at once, agrees with the server, and leaks no names", async () => {
    clock = dayStart(1) + 1000; // dog breeds
    eng = new DigEngine(store, { now: () => clock });
    const st = await eng.start("p", 1, 1, "ranked");
    const check = st.check!;
    const lab = quickMatch(check, "Labrador");
    expect(lab).not.toBeNull();
    expect(quickMatch(check, "lab")).toBe(lab);
    expect(quickMatch(check, "labradors")).toBe(lab);
    expect(quickMatch(check, "pugs")).not.toBeNull();
    expect(quickMatch(check, "labrdor")).toBeNull(); // typos go to the server
    expect(quickMatch(check, "zzzz")).toBeNull();
    const r = await eng.submit("p", st.attemptId, "Labrador");
    expect(r.num).toBe(lab);
    const json = JSON.stringify(check);
    expect(json).not.toMatch(/labrador|poodle|mudi/i);
    // resuming hands back the found numbers
    const again = await eng.start("p", 1, 1, "ranked");
    expect(again.found).toEqual([lab]);
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
