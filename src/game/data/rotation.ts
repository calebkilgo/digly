import { hash, mulberry32 } from "../../scene/rng";

// Which categories are dug on which day. Server only (slugs give away the
// category). A rotation never changes once its days have started: to add
// categories, append a new rotation that starts on a future day.
export interface Rotation {
  from: number; // first day number this rotation applies to
  pools: Record<1 | 2 | 3, string[]>;
  // "stride": the original fixed walk; "shuffle": every category once per cycle, reshuffled each cycle
  mode: "stride" | "shuffle";
}

export const ROTATIONS: Rotation[] = [
  {
    from: 1,
    mode: "stride",
    pools: {
      1: ["dog-breeds", "fruits", "us-states", "birds"],
      2: ["african-countries", "instruments", "cheeses", "european-countries", "dances"],
      3: ["elements", "languages", "bones", "greek-myth"],
    },
  },
  {
    from: 30, // 2026-11-18
    mode: "shuffle",
    pools: {
      1: ["dog-breeds", "fruits", "us-states", "birds", "vegetables", "sports", "car-brands", "flowers", "herbs-spices"],
      2: ["african-countries", "instruments", "cheeses", "european-countries", "dances", "cat-breeds", "gemstones", "cocktails", "nfl-teams", "state-capitals", "programming-languages"],
      3: ["elements", "languages", "bones", "greek-myth", "dinosaurs", "horse-breeds", "knots", "constellations", "egyptian-gods"],
    },
  },
];

const STRIDE = { 1: [1, 0], 2: [3, 1], 3: [5, 2] } as const;

export function slugFor(day: number, level: 1 | 2 | 3, rotations: Rotation[] = ROTATIONS): string {
  const rot = [...rotations].reverse().find((r) => day >= r.from) ?? rotations[0];
  const pool = rot.pools[level];
  const n = pool.length;
  if (rot.mode === "stride") {
    const [m, c] = STRIDE[level];
    return pool[((((day - 1) * m + c) % n) + n) % n];
  }
  const k = day - rot.from;
  const cycle = Math.floor(k / n);
  const order = shuffled(n, hash(rot.from, level, cycle));
  // don't repeat the same category across a cycle boundary
  if (cycle > 0) {
    const prev = shuffled(n, hash(rot.from, level, cycle - 1));
    if (order[0] === prev[n - 1] && n > 1) [order[0], order[1]] = [order[1], order[0]];
  }
  return pool[order[k % n]];
}

function shuffled(n: number, seed: number) {
  const r = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
