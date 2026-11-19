import { compact, editDistance, normalize } from "./normalize";

export interface AnswerRecord {
  id: string;
  canonical: string;
  normalized: string;
  aliases: string[]; // normalized
  curated: number; // hand-estimated rarity from the seed file
  rarity: number; // calibrated score 1..100; exactly one answer per category is 100
}

export type MatchKind = "exact" | "alias" | "plural" | "filler" | "reordered" | "typo" | "sounds-like" | "first-word";

export interface Match {
  answer: AnswerRecord;
  kind: MatchKind;
}

// Kinds that changed what the player typed. The UI shows these as corrected.
export const CORRECTED: MatchKind[] = ["typo", "sounds-like", "first-word", "reordered"];

// Generic words people tack on ("beagle dog", "the country of chad").
const FILLER = new Set([
  "a", "an", "the", "of", "dog", "dogs", "breed", "bird", "birds", "country", "state", "cheese", "fruit",
  "language", "dance", "bone", "instrument", "god", "goddess", "element", "republic of", "bread", "pastry",
]);

// How many edits a typo may contain, by length. Short words must be exact.
function typoBudget(len: number) {
  if (len <= 4) return 0;
  if (len <= 11) return 1;
  return 2;
}

// Rough sound-alike key: chiwawa and chihuahua both become "kw".
// "ch" is ambiguous (k in chihuahua, sh in dachshund), so both readings are keyed.
export function soundKeys(s: string): string[] {
  const t = s.replace(/[^a-z]/g, "");
  if (!t) return [];
  const a = soundKey(t);
  const b = t.includes("ch") ? soundKey(t.replace(/ch/g, "sh")) : a;
  return a === b ? [a] : [a, b];
}

export function soundKey(s: string): string {
  let t = s.replace(/[^a-z]/g, "");
  if (!t) return "";
  t = t
    .replace(/sch/g, "sk")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/hu(?=[aeiou])/g, "w")
    .replace(/wh/g, "w")
    .replace(/gh/g, "g")
    .replace(/dg/g, "j")
    .replace(/y/g, "i");
  const first = t[0];
  const rest = t.slice(1).replace(/[aeiouh]/g, "");
  return (first + rest).replace(/(.)\1+/g, "$1");
}

// Turns the curated estimates into scores on a convex curve: most answers
// score low, rare ones climb fast, and the single rarest answer is 100.
// Ties in the curated value share a score. If two answers tie for rarest,
// the one listed last in the seed file is the Platinum.
export function calibrate(records: AnswerRecord[]) {
  const n = records.length;
  if (!n) return;
  const sorted = records.map((r, i) => ({ r, i })).sort((a, b) => a.r.curated - b.r.curated || a.i - b.i);
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && sorted[j + 1].r.curated === sorted[k].r.curated) j++;
    const p = n === 1 ? 1 : (k + j) / 2 / (n - 1);
    const score = Math.max(1, Math.min(99, Math.round(1 + 98 * p * p)));
    for (let m = k; m <= j; m++) sorted[m].r.rarity = score;
    k = j + 1;
  }
  sorted[n - 1].r.rarity = 100;
}

export class AnswerIndex {
  private byKey = new Map<string, { answer: AnswerRecord; kind: MatchKind }>();
  private keys: string[] = [];
  private sortedTokens = new Map<string, AnswerRecord | null>();
  private sounds = new Map<string, AnswerRecord[]>();
  private firstWords = new Map<string, AnswerRecord | null>();

  constructor(readonly answers: AnswerRecord[]) {
    const ids = new Set<string>();
    for (const a of answers) {
      if (ids.has(a.id)) throw new Error(`Duplicate answer: ${a.canonical}`);
      ids.add(a.id);
    }
    for (const a of answers) {
      this.add(compact(a.normalized), a, "exact");
      for (const al of a.aliases) this.add(compact(al), a, "alias");
      for (const form of [a.normalized, ...a.aliases]) {
        const words = form.split(" ");
        if (words.length > 1) {
          setUnique(this.sortedTokens, [...words].sort().join(" "), a);
          if (words[0].length >= 5) setUnique(this.firstWords, words[0], a);
        }
        for (const k of soundKeys(compact(form))) {
          const list = this.sounds.get(k) ?? [];
          if (!list.includes(a)) list.push(a);
          this.sounds.set(k, list);
        }
      }
    }
    // a first word that is itself a full answer is never a shortcut
    for (const k of this.firstWords.keys()) if (this.byKey.has(k)) this.firstWords.set(k, null);
    this.keys = [...this.byKey.keys()];
  }

  private add(key: string, answer: AnswerRecord, kind: MatchKind) {
    const existing = this.byKey.get(key);
    if (existing && existing.answer.id !== answer.id) {
      throw new Error(`Alias collision: "${key}" maps to ${existing.answer.canonical} and ${answer.canonical}`);
    }
    if (!existing) this.byKey.set(key, { answer, kind });
  }

  lookup(raw: string): Match | null {
    const n = normalize(raw);
    if (!n) return null;
    const key = compact(n);

    const direct = this.direct(key);
    if (direct) return direct;

    // drop filler words: "beagle dog", "the country of chad"
    const words = n.split(" ");
    const trimmed = words.filter((w) => !FILLER.has(w));
    if (trimmed.length && trimmed.length < words.length) {
      const m = this.direct(trimmed.join(""));
      if (m) return { answer: m.answer, kind: "filler" };
    }
    const core = trimmed.length ? trimmed : words;

    // word order: "retriever golden"
    if (core.length > 1) {
      const a = this.sortedTokens.get([...core].sort().join(" "));
      if (a) return { answer: a, kind: "reordered" };
    }

    const coreKey = core.join("");

    // spelling slips, scaled to length, and only when one answer is closest
    const budget = typoBudget(coreKey.length);
    if (budget > 0) {
      let best = budget + 1;
      let found: AnswerRecord | null = null;
      let tie = false;
      for (const k of this.keys) {
        if (Math.abs(k.length - coreKey.length) > budget) continue;
        const d = editDistance(k, coreKey, budget);
        if (d > budget) continue;
        const a = this.byKey.get(k)!.answer;
        if (d < best) {
          best = d;
          found = a;
          tie = false;
        } else if (d === best && found && found.id !== a.id) {
          tie = true;
        }
      }
      if (found && !tie) return { answer: found, kind: "typo" };
      if (tie) return null;
    }

    // sounds-alike: "chiwawa", "nayvaho". Needs a decent length and a
    // reasonably close spelling so it can't wander off to a different word.
    if (coreKey.length >= 5) {
      const candidates = new Set<AnswerRecord>();
      for (const k of soundKeys(coreKey)) for (const a of this.sounds.get(k) ?? []) candidates.add(a);
      let best = Infinity;
      let pick: AnswerRecord | null = null;
      let tie = false;
      for (const a of candidates) {
        for (const form of [a.normalized, ...a.aliases]) {
          const target = compact(form);
          const limit = Math.max(2, Math.ceil(target.length * 0.4));
          const d = editDistance(target, coreKey, limit);
          if (d > limit) continue;
          if (d < best) {
            best = d;
            pick = a;
            tie = false;
          } else if (d === best && pick && pick.id !== a.id) tie = true;
        }
      }
      if (pick && !tie) return { answer: pick, kind: "sounds-like" };
    }

    // a distinctive first word: "rhodesian" for Rhodesian Ridgeback
    if (core.length === 1 && coreKey.length >= 5) {
      const a = this.firstWords.get(coreKey);
      if (a) return { answer: a, kind: "first-word" };
    }
    return null;
  }

  private direct(key: string): Match | null {
    const hit = this.byKey.get(key);
    if (hit) return hit;
    for (const stem of singularForms(key)) {
      const p = this.byKey.get(stem);
      if (p) return { answer: p.answer, kind: "plural" };
    }
    return null;
  }
}

function setUnique(map: Map<string, AnswerRecord | null>, key: string, a: AnswerRecord) {
  if (!key) return;
  const cur = map.get(key);
  if (cur === undefined) map.set(key, a);
  else if (cur && cur.id !== a.id) map.set(key, null); // ambiguous: never use
}

function singularForms(key: string): string[] {
  const out: string[] = [];
  if (key.endsWith("ies") && key.length > 4) out.push(key.slice(0, -3) + "y");
  if (key.endsWith("es") && key.length > 3) out.push(key.slice(0, -2));
  if (key.endsWith("s") && key.length > 2) out.push(key.slice(0, -1));
  return out;
}

// Compact seed format, one answer per line:
//   Canonical Name | alias one, alias two = 42
// The key an admin edit is filed under: same as the part of the answer id after the prefix.
export function answerKey(name: string) {
  return compact(normalize(name));
}

// Lays admin edits over an answer block. An edit replaces the line with the same
// key; "add" lines go on the end.
export function applyAnswerEdits(block: string, edits: { key: string; action: "add" | "remove"; name: string; aliases: string[]; rating: number }[]) {
  if (!edits.length) return block;
  const touched = new Set(edits.map((e) => e.key));
  const lines = block.split("\n").filter((line) => {
    const m = line.trim().match(/^([^#|=][^|=]*?)\s*(?:\||=)/);
    return !m || !touched.has(answerKey(m[1]));
  });
  for (const e of edits) {
    if (e.action !== "add") continue;
    lines.push(`${e.name}${e.aliases.length ? ` | ${e.aliases.join(", ")}` : ""} = ${e.rating}`);
  }
  return lines.join("\n");
}

export function parseAnswerBlock(block: string, prefix: string): AnswerRecord[] {
  const out: AnswerRecord[] = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(.+?)(?:\|(.+?))?=\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) throw new Error(`Bad answer line: ${t}`);
    const canonical = m[1].trim();
    const aliases = (m[2] ?? "")
      .split(",")
      .map((s) => normalize(s))
      .filter(Boolean);
    const curated = Number(m[3]);
    if (curated < 1 || curated > 100) throw new Error(`Rarity out of range: ${t}`);
    const normalized = normalize(canonical);
    out.push({ id: `${prefix}:${compact(normalized)}`, canonical, normalized, aliases, curated, rarity: curated });
  }
  calibrate(out);
  return out;
}
