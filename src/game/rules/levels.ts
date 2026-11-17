// Every daily dig is three levels, each deeper than the last. Deeper levels
// give you less time and fewer scored answers, but multiply them harder.

export interface LevelInfo {
  n: 1 | 2 | 3;
  mult: number;
  name: string;
  startM: number; // depth in meters where the level begins
  scored: number; // how many of your rarest answers count
  seconds: number;
}

export const LEVELS: LevelInfo[] = [
  { n: 1, mult: 1, name: "Topsoil", startM: 0, scored: 5, seconds: 60 },
  { n: 2, mult: 2, name: "Bedrock", startM: 60, scored: 3, seconds: 40 },
  { n: 3, mult: 8, name: "Crystal caves", startM: 140, scored: 1, seconds: 20 },
];

export const DEPTH_MAX_M = 220;

export function levelInfo(level: number): LevelInfo {
  return LEVELS[Math.max(0, Math.min(2, level - 1))];
}

export function digTotal(levelPoints: number[]): number {
  return levelPoints.reduce((s, p) => s + p, 0);
}
