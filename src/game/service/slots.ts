import { LEVELS } from "../rules/levels";
import { formatChallengeNumber } from "../rules/schedule";
import type { Dig, LevelNo } from "./types";

// The shape of a day's dig, safe for the client: no categories.
export function digSlots(day: number): Dig {
  return {
    day,
    number: formatChallengeNumber(day),
    levels: LEVELS.map((l) => ({ level: l.n as LevelNo, multiplier: l.mult, levelName: l.name, scored: l.scored, seconds: l.seconds })),
  };
}
