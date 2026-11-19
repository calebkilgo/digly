import { describe, expect, it } from "vitest";
import {
  EMPTY_PROGRESS,
  currentStreak,
  longestStreak,
  forUser,
  mergeHistory,
  recordRanked,
  type DayRecord,
} from "../src/game/progress";

const rec = (day: number, score = 100): DayRecord => ({
  day,
  challengeId: `${day}:x`,
  score,
  unique: 5,
  top: [],
  finishedAt: 0,
});

describe("ranked attempt uniqueness", () => {
  it("never overwrites the first ranked result", () => {
    let p = recordRanked(EMPTY_PROGRESS, rec(5, 120));
    p = recordRanked(p, rec(5, 290));
    expect(p.ranked[5].score).toBe(120);
  });
});

describe("streaks", () => {
  let p = EMPTY_PROGRESS;
  for (const d of [1, 2, 3, 5, 6]) p = recordRanked(p, rec(d));

  it("counts back from today or yesterday", () => {
    expect(currentStreak(p, 6)).toBe(2);
    expect(currentStreak(p, 7)).toBe(2); // today not played yet
    expect(currentStreak(p, 8)).toBe(0);
  });

  it("finds the longest run", () => {
    expect(longestStreak(p)).toBe(3);
  });
});

describe("history from the server", () => {
  const h = {
    ranked: [
      { day: 5, score: 900, unique: 4, finishedAt: 1 },
      { day: 6, score: 300, unique: 2, finishedAt: 2 },
    ],
    practice: [{ day: 3, best: 400, titles: ["A", "B", "C"] }],
    vault: [{ game: 2, best: 700, titles: ["X", "Y", "Z"] }],
  };

  it("adds missing days, keeps this device's records and takes the higher best", () => {
    let p = recordRanked(EMPTY_PROGRESS, rec(5, 120));
    p = { ...p, vaultBest: { 2: 900 }, vaultTitles: { 2: ["mine"] } };
    const m = mergeHistory(p, h);
    expect(m.ranked[5].score).toBe(120);
    expect(m.ranked[6].score).toBe(300);
    expect(m.practiceBest[3]).toBe(400);
    expect(m.practiceTitles?.[3]).toEqual(["A", "B", "C"]);
    expect(m.vaultBest?.[2]).toBe(900);
    expect(m.vaultTitles?.[2]).toEqual(["mine"]);
  });

  it("returns the same object when nothing is new", () => {
    const once = mergeHistory(EMPTY_PROGRESS, h);
    expect(mergeHistory(once, h)).toBe(once);
  });

  it("keeps each account's progress apart", () => {
    const bob = { ...recordRanked(EMPTY_PROGRESS, rec(5)), owner: "bob" };
    expect(forUser(bob, "bob")).toBe(bob);
    expect(forUser(bob, "amy").ranked).toEqual({}); // another account starts clean
    expect(forUser(bob, null).ranked).toEqual({}); // logged out
    const guest = { ...recordRanked(EMPTY_PROGRESS, rec(5)), owner: null };
    expect(forUser(guest, "amy").ranked[5]).toBeTruthy(); // a guest's day carries into their new account
    expect(forUser(recordRanked(EMPTY_PROGRESS, rec(5)), "amy").owner).toBe("amy"); // old caches are adopted
  });
});
