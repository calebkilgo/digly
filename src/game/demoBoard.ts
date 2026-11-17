import { hash, mulberry32 } from "@/scene/rng";
import type { BoardEntry } from "./rules/leaderboard";
import { LEVELS } from "./rules/levels";
import { bestN, levelScore, tierFromZ } from "./rules/scoring";

// Sample diggers for the offline preview's leaderboard (labeled as samples).
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
    let score = 0;
    let unique = 0;
    for (const l of LEVELS) {
      // more answers and nicher ones for stronger diggers; deeper levels are harder
      const found = Math.max(0, Math.round([6, 3.5, 1.5][l.n - 1] * (1 + skill * 0.8) + (r() - 0.5) * 2));
      unique += found;
      const answers = Array.from({ length: found }, () => {
        const z = -0.7 + skill * 0.9 + gauss() * 1.4;
        return { name: "", rarity: 0, z, tier: r() < 0.003 ? ("platinum" as const) : tierFromZ(z) };
      });
      score += levelScore(bestN(answers), l.n).points;
    }
    // a deliberate tie so shared ranks show up
    if (i === 7 || i === 8) return { id: `d${i}`, name, score: 333, unique: 12 };
    return { id: `d${i}`, name, score: Math.max(0, score), unique };
  });
}
