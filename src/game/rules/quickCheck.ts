import { compact, normalize } from "./normalize";

// Instant answer feedback without shipping the answer list. At the start of a
// level the server sends salted fingerprints of every accepted spelling. The
// browser fingerprints what was typed and knows at once whether it's an answer
// (and which one, by number, for duplicates). It can't turn fingerprints back
// into names or learn anything about rarity. Typos and sound-alikes miss here
// and fall through to the server, which still checks and scores everything.

export interface QuickCheck {
  salt: string;
  keys: Record<string, number>; // fingerprint -> answer number
}

// cyrb53: small, fast, same result in the browser and on the server
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
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
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

export function quickMatch(check: QuickCheck, raw: string): number | null {
  for (const c of candidates(raw)) {
    const hit = check.keys[fingerprint(check.salt, c)];
    if (hit !== undefined) return hit;
  }
  return null;
}
