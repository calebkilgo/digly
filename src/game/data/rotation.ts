import { hash, mulberry32 } from "../../scene/rng";
import { SEEDS } from "./seeds";

// Which category is dug on which day, worked out automatically. Server only
// (slugs give away the category).
//
// Days 1-29 keep the original fixed walk. From day 30 every level shuffles its
// whole pool, digs each category once, then reshuffles. A category added to
// SEEDS joins at the first cycle that starts on or after its `since` day, so
// adding one never changes a day that's already been played.

const LEGACY_LAST_DAY = 29;
const AUTO_FROM = 30; // 2026-11-18

const LEGACY: Record<1 | 2 | 3, string[]> = {
  1: ["dog-breeds", "fruits", "us-states", "birds"],
  2: ["african-countries", "instruments", "cheeses", "european-countries", "dances"],
  3: ["elements", "languages", "bones", "greek-myth"],
};
const STRIDE = { 1: [1, 0], 2: [3, 1], 3: [5, 2] } as const;

function pool(level: 1 | 2 | 3, cycleStart: number) {
  return SEEDS.filter((s) => s.level === level && (s.since ?? 0) <= cycleStart).map((s) => s.slug);
}

function order(slugs: string[], level: number, cycleStart: number) {
  const r = mulberry32(hash(AUTO_FROM, level, cycleStart));
  const a = [...slugs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const memo = new Map<string, string>();

export function slugFor(day: number, level: 1 | 2 | 3): string {
  const k = `${day}:${level}`;
  let v = memo.get(k);
  if (!v) {
    v = compute(day, level);
    if (memo.size > 5000) memo.clear();
    memo.set(k, v);
  }
  return v;
}

function compute(day: number, level: 1 | 2 | 3): string {
  if (day <= LEGACY_LAST_DAY) {
    const p = LEGACY[level];
    const [m, c] = STRIDE[level];
    return p[((((day - 1) * m + c) % p.length) + p.length) % p.length];
  }
  let start = AUTO_FROM;
  let prevLast: string | null = null;
  for (;;) {
    const cyc = order(pool(level, start), level, start);
    // don't repeat a category across a cycle boundary
    if (prevLast && cyc[0] === prevLast && cyc.length > 1) [cyc[0], cyc[1]] = [cyc[1], cyc[0]];
    if (day < start + cyc.length) return cyc[day - start];
    prevLast = cyc[cyc.length - 1];
    start += cyc.length;
  }
}
