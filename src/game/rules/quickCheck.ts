import { compact, normalize } from "./normalize";
import { soundKeys } from "./answerIndex";

// Instant answer checking without shipping the answer list.
//
// When a level starts, the server sends salted fingerprints (short one-way
// hashes) of every accepted spelling, plus fingerprints for one-letter typos
// and sound-alikes. The browser fingerprints what was typed and knows at once
// whether it's an answer, and which one by number, so repeats are caught too.
// Fingerprints can't be turned back into names, and rarity is never sent.
// Lookups are plain object/Map hits, so checking takes microseconds.
//
// The server still checks and scores every answer in the background; if it
// disagrees, the browser corrects itself. Scores always come from the server.

export interface QuickCheck {
  salt: string;
  keys: Record<string, number>; // spelling or alias -> answer number
  dels?: Record<string, number>; // one letter deleted (typo matching); -1 = more than one answer
  sounds?: Record<string, number>; // sound-alike key; -1 = more than one answer
}

export interface QuickHit {
  num: number;
  corrected: boolean; // matched through a typo or sound-alike
}

// cyrb53, cut to 7 base-36 characters: same result in the browser and on the server
export function fingerprint(salt: string, key: string) {
  const str = salt + "|" + key;
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((4294967296 * (2097151 & h2) + (h1 >>> 0)) % 78364164096).toString(36);
}

// typo matching starts at this length, like the server's typo budget
export const TYPO_MIN = 5;

export function deletions(k: string) {
  const out: string[] = [];
  for (let i = 0; i < k.length; i++) out.push(k.slice(0, i) + k.slice(i + 1));
  return out;
}

// the spellings the server's exact and plural rules would accept
export function candidates(raw: string): string[] {
  const k = compact(normalize(raw));
  if (!k) return [];
  const out = [k];
  if (k.endsWith("ies") && k.length > 4) out.push(k.slice(0, -3) + "y");
  if (k.endsWith("es") && k.length > 3) out.push(k.slice(0, -2));
  if (k.endsWith("s") && k.length > 2) out.push(k.slice(0, -1));
  return out;
}

// Builds the check from each answer's spellings (normalized form first). Server side.
export function buildQuickCheck(salt: string, answers: string[][]): QuickCheck {
  const keys: Record<string, number> = {};
  const dels: Record<string, number> = {};
  const sounds: Record<string, number> = {};
  const add = (m: Record<string, number>, k: string, i: number) => {
    const cur = m[k];
    m[k] = cur === undefined || cur === i ? i : -1;
  };
  answers.forEach((forms, i) => {
    for (const f of forms) {
      const k = compact(f);
      if (!k) continue;
      keys[fingerprint(salt, k)] = i;
      if (k.length >= TYPO_MIN) {
        for (const d of deletions(k)) add(dels, fingerprint(salt, d), i);
        for (const s of soundKeys(k)) if (s.length >= 2) add(sounds, fingerprint(salt, "~" + s), i);
      }
    }
  });
  return { salt, keys, dels, sounds };
}

export function quickMatch(check: QuickCheck, raw: string): QuickHit | null {
  const cands = candidates(raw);
  for (const c of cands) {
    const hit = check.keys[fingerprint(check.salt, c)];
    if (hit !== undefined) return { num: hit, corrected: false };
  }
  const k = cands[0];
  if (!k || k.length < TYPO_MIN) return null;
  // one-letter typos: missing, extra, swapped or wrong letter
  if (check.dels) {
    const found = new Set<number>();
    const look = (m: Record<string, number>, key: string) => {
      const v = m[fingerprint(check.salt, key)];
      if (v !== undefined) found.add(v);
    };
    look(check.dels, k);
    for (const d of deletions(k)) {
      look(check.keys, d);
      look(check.dels, d);
    }
    if (found.size === 1 && !found.has(-1)) return { num: [...found][0], corrected: true };
    if (found.size > 0) return null; // ambiguous: let the server decide
  }
  if (check.sounds) {
    const found = new Set<number>();
    for (const s of soundKeys(k)) {
      const v = check.sounds[fingerprint(check.salt, "~" + s)];
      if (v !== undefined) found.add(v);
    }
    if (found.size === 1 && !found.has(-1)) return { num: [...found][0], corrected: true };
  }
  return null;
}
