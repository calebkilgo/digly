import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/game/engine/memoryStore";
import { StoreConflict } from "../src/game/engine/store";

describe("accounts: email, Google, marketing", () => {
  it("a password signup starts unverified and verifies through its own email only", async () => {
    const s = new MemoryStore();
    await s.ensurePlayer("p");
    await s.claimAccount("p", { username: "Rocky", passwordHash: "h", email: "r@x.io" });
    let p = (await s.getPlayer("p"))!;
    expect(p.emailVerified).toBe(false);
    expect(p.hasPassword).toBe(true);
    expect(p.google).toBe(false);
    expect(p.marketing).toBe(false);

    await s.createEmailVerification("tok", "p", "r@x.io", 1000);
    expect(await s.useEmailVerification("tok", 2000)).toBeNull(); // expired
    expect(await s.useEmailVerification("tok", 0)).toBeNull(); // and used up

    await s.createEmailVerification("tok2", "p", "old@x.io", 1000);
    const v = await s.useEmailVerification("tok2", 0);
    expect(v).toEqual({ playerId: "p", email: "old@x.io" });
    // a link for an address the account no longer has does nothing
    expect(await s.markEmailVerified("p", v!.email)).toBe(false);
    expect(await s.markEmailVerified("p", "R@X.io")).toBe(true);
    p = (await s.getPlayer("p"))!;
    expect(p.emailVerified).toBe(true);
  });

  it("changing the email resets verification; saving the same one keeps it", async () => {
    const s = new MemoryStore();
    await s.ensurePlayer("p");
    await s.claimAccount("p", { username: "Rocky", passwordHash: "h", email: "r@x.io", emailVerified: true });
    await s.setEmail("p", "r@x.io");
    expect((await s.getPlayer("p"))!.emailVerified).toBe(true);
    await s.setEmail("p", "new@x.io");
    expect((await s.getPlayer("p"))!.emailVerified).toBe(false);
    await s.setEmail("p", "g@x.io", true);
    expect((await s.getPlayer("p"))!.emailVerified).toBe(true);
  });

  it("emailInUse ignores guests and the account itself, case-insensitively", async () => {
    const s = new MemoryStore();
    await s.ensurePlayer("p");
    await s.claimAccount("p", { username: "Rocky", passwordHash: "h", email: "R@x.io" });
    expect(await s.emailInUse("r@X.IO")).toBe(true);
    expect(await s.emailInUse("r@x.io", "p")).toBe(false);
    expect(await s.emailInUse("other@x.io")).toBe(false);
  });

  it("Google accounts: no password, found by sub, one Digly account per Google account", async () => {
    const s = new MemoryStore();
    await s.ensurePlayer("g");
    await s.claimAccount("g", { username: "Gem", passwordHash: null, email: "g@x.io", googleSub: "sub1", emailVerified: true, marketing: true });
    const p = (await s.getPlayer("g"))!;
    expect(p).toMatchObject({ hasPassword: false, google: true, emailVerified: true, marketing: true });
    expect(await s.findByGoogle("sub1")).toEqual({ playerId: "g", username: "Gem" });
    expect(await s.findByGoogle("nope")).toBeNull();
    // no password means password login and the password delete check don't apply
    expect(await s.findAccount("Gem")).toBeNull();

    await s.ensurePlayer("p");
    await s.claimAccount("p", { username: "Rocky", passwordHash: "h", email: "r@x.io" });
    await expect(s.linkGoogle("p", "sub1")).rejects.toBeInstanceOf(StoreConflict);
    await s.linkGoogle("p", "sub2");
    expect(await s.findByGoogle("sub2")).toEqual({ playerId: "p", username: "Rocky" });
    await s.ensurePlayer("q");
    await expect(s.claimAccount("q", { username: "Other", passwordHash: null, email: "o@x.io", googleSub: "sub2" })).rejects.toBeInstanceOf(StoreConflict);
  });

  it("marketing opt-in can be turned on and off", async () => {
    const s = new MemoryStore();
    await s.ensurePlayer("p");
    await s.claimAccount("p", { username: "Rocky", passwordHash: "h", email: "r@x.io" });
    await s.setMarketing("p", true);
    expect((await s.getPlayer("p"))!.marketing).toBe(true);
    await s.setMarketing("p", false);
    expect((await s.getPlayer("p"))!.marketing).toBe(false);
  });

  it("deleting a player drops its verification links", async () => {
    const s = new MemoryStore();
    await s.ensurePlayer("p");
    await s.claimAccount("p", { username: "Rocky", passwordHash: "h", email: "r@x.io" });
    await s.createEmailVerification("tok", "p", "r@x.io", 10_000);
    await s.deletePlayer("p");
    expect(await s.useEmailVerification("tok", 0)).toBeNull();
    expect(await s.findByGoogle("x")).toBeNull();
  });
});

describe("growth and topics", () => {
  const L = Date.UTC(2026, 9, 20);
  const at = (day: number) => L + (day - 1) * 86_400_000 + 3_600_000;
  const row = (id: string, playerId: string, day: number, slug: string, level: 1 | 2 | 3, points: number | null, mode: "ranked" | "practice" = "ranked") => ({
    id,
    playerId,
    day,
    level,
    mode,
    slug,
    startedAt: at(day),
    expiresAt: at(day) + 60_000,
    finishedAt: points === null ? null : at(day) + 60_000,
    score: points,
    points,
    uniqueCount: 1,
    submissions: 1,
  });

  it("counts players, new players and next-day / next-week returns", async () => {
    const s = new MemoryStore();
    for (const r of [
      row("1", "a", 1, "fruits", 1, 100),
      row("2", "a", 2, "fruits", 1, 100),
      row("3", "a", 8, "fruits", 1, 100),
      row("4", "b", 1, "fruits", 1, 100),
      row("5", "b", 1, "rivers", 3, null),
      row("6", "c", 2, "fruits", 1, 100),
    ])
      await s.insertAttempt(r);
    const g = await s.growth(L, 1, 3);
    expect(g[0]).toMatchObject({ day: 1, players: 2, newPlayers: 2, backD1: 1, backD7: 1, rankedStarted: 2 });
    expect(g[1]).toMatchObject({ day: 2, players: 2, newPlayers: 1, backD1: 0 });
    expect(g[2]).toMatchObject({ day: 3, players: 0, newPlayers: 0 });
  });

  it("finds each player's strongest topic against the average on the same prompts", async () => {
    const s = new MemoryStore();
    let n = 0;
    const add = (pid: string, slug: string, level: 1 | 2 | 3, pts: number) => s.insertAttempt(row(String(++n), pid, 1, slug, level, pts, "practice"));
    // a is great at fruits, b at rivers
    for (let i = 0; i < 3; i++) {
      await add("a", "fruits", 1, 300);
      await add("b", "fruits", 1, 100);
      await add("a", "rivers", 3, 100);
      await add("b", "rivers", 3, 300);
    }
    const base = await s.promptBaselines();
    expect(base.find((b) => b.slug === "fruits")).toMatchObject({ avgPoints: 200, plays: 6 });
    const seg = await s.topicSegments({ fruits: "food", rivers: "geography" }, 3);
    expect(seg).toEqual([
      { topic: "food", plays: 6, players: 1 },
      { topic: "geography", plays: 6, players: 1 },
    ]);
    // below the minimum plays nobody gets a strongest topic
    expect((await s.topicSegments({ fruits: "food", rivers: "geography" }, 4)).every((x) => x.players === 0)).toBe(true);
  });
});
