import { describe, expect, it } from "vitest";
import {
  EMPTY_PROGRESS,
  currentStreak,
  longestStreak,
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
