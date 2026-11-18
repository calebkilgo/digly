// Vault games: fixed games of three prompts each, built from data/vault by
// scripts/build_vault.py. Server only (answers live in the generated file).

import type { ChallengeSeed, Theme } from "./seeds";
import { VAULT_GAMES, VAULT_SEEDS } from "./vault.generated";

export interface VaultGame {
  n: number;
  slugs: string[]; // level 1, 2, 3
}

export interface VaultSeed {
  slug: string;
  title: string; // the prompt players see
  prompt: string; // the full sentence shown while digging
  level: 1 | 2 | 3;
  domain: string;
  noun: string;
  rules: string[];
  answers: string;
}

const THEME: Record<string, Theme> = {
  geography: "geography",
  nature: "biology",
  science: "science",
  food: "food",
  "sports and games": "sports",
};

export const VAULT_CHALLENGES: ChallengeSeed[] = VAULT_SEEDS.map((v) => ({
  slug: v.slug,
  title: v.title,
  level: v.level,
  theme: THEME[v.domain] ?? "culture",
  prompt: v.prompt,
  noun: v.noun,
  rules: v.rules,
  scoringVersion: 1,
  answers: v.answers,
}));

export function vaultSlug(game: number, level: 1 | 2 | 3): string | null {
  return VAULT_GAMES.find((g) => g.n === game)?.slugs[level - 1] ?? null;
}
