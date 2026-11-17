// Vault games: 50 fixed games of three prompts each, built from data/vault by
// scripts/build_vault.py. Server only (answers live in the generated file).

export interface VaultGame {
  n: number;
  slugs: [string, string, string] | string[];
}

export interface VaultSeed {
  slug: string;
  title: string; // the prompt players see
  level: 1 | 2 | 3;
  domain: string;
  noun: string;
  rules: string[];
  answers: string;
}
