import { SCORING } from "./scoring";

// Every daily dig is three levels, each deeper than the last. They all play the
// same way (45 seconds, best 3 count); deeper levels have harder prompts and
// a bigger multiplier. The numbers come from SCORING.

export interface LevelInfo {
  n: 1 | 2 | 3;
  mult: number;
  name: string;
  startM: number; // depth in meters where the level begins
  scored: number; // how many answers count (best 3)
  seconds: number;
}

export const LEVELS: LevelInfo[] = ([
  [1, "Topsoil", 0],
  [2, "Bedrock", 60],
  [3, "Crystal caves", 140],
] as const).map(([n, name, startM]) => ({ n, name, startM, mult: SCORING.multipliers[n], scored: SCORING.best, seconds: SCORING.seconds }));

export const DEPTH_MAX_M = 220;

export function levelInfo(level: number): LevelInfo {
  return LEVELS[Math.max(0, Math.min(2, level - 1))];
}

export function digTotal(levelPoints: number[]): number {
  return Math.max(0, levelPoints.reduce((s, p) => s + p, 0));
}
