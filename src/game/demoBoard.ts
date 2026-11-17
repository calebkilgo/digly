import { hash, mulberry32 } from "@/scene/rng";
import type { BoardEntry } from "./rules/leaderboard";
import { LEVELS } from "./rules/levels";

// Sample diggers for the Phase 1 leaderboard. Clearly labeled as sample data
// in the UI; replaced by real attempts when the backend lands.
const HANDLES = [
  "mole_patrol", "QuarryQueen", "pebblebrain", "deep_end", "Ore Else", "shalewhisperer", "tunnelvision",
  "gneissguy", "basalt_betty", "cave_canem", "Sedimental", "rockbottom", "dig_dug_dan", "geodude42",
  "HollowEarth", "the_strata_g", "minerthreat", "obsidianne", "lodestar", "pickaxe_pat", "bedrock_bo",
  "feldspar", "Clay Aiken't", "magmamia", "slatemate", "orecle", "spelunkrr", "drillsergeant", "gemma_stone",
  "quartzy", "nuggetz", "sandy_loam", "pit_boss", "veinglory", "rubble_rouser", "shafted", "boulderdash",
  "cavernous", "flintstoned", "aggregate", "kimberlite", "talc_show", "jaspr", "mica_drop",
];

export function demoBoard(day: number): BoardEntry[] {
  const r = mulberry32(hash(day, 1337));
  const gauss = () => (r() + r() + r() + r() - 2) / 2;
  return HANDLES.map((name, i) => {
    const skill = gauss();
    // level 1: five answers x1, level 2: three answers x2, level 3: one answer x8
    let score = 0;
    for (const l of LEVELS) {
      let base = 0;
      for (let k = 0; k < l.scored; k++) {
        const q = 40 + skill * 40 + (r() - 0.5) * 45 - k * 8 - (l.n - 1) * 6;
        base += r() < 0.02 ? 100 : Math.round(Math.max(1, Math.min(99, q)));
      }
      score += base * l.mult;
    }
    const unique = Math.max(6, Math.round(26 + skill * 16 + (r() - 0.5) * 8));
    // a deliberate tie so shared ranks show up
    if (i === 7 || i === 8) return { id: `d${i}`, name, score: 777, unique: 25 };
    return { id: `d${i}`, name, score, unique };
  });
}
