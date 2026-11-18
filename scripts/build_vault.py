"""Builds src/game/data/vault.generated.ts from data/vault.

  pip install wordfreq
  python scripts/build_vault.py

data/vault/games.txt lists the 50 Vault games, one per line:
  1: trees, empires, classical-composers

data/vault/<slug>.txt holds one prompt. Header lines start with "#":
  # title: Trees               the prompt players see (8 words or fewer)
  # prompt: Name as many ...   the full sentence shown while digging (optional;
                               by default "Name as many <title> as you can.")
  # level: 1                   1, 2 or 3
  # domain: nature
  # noun: trees                used in "You found 12 trees"
  # rule: Common names count.  shown under the prompt (repeatable)
  # strip: tree, trees         words that can be left off the end ("Oak tree" -> "Oak")
  # prefix: mount, mont        words that can be left off the front
  # add-prefix: mount          also accept the name with this word in front
  # surname                    also accept a person's last name on its own
  # firstname                  also accept a person's first name on its own

Then one answer per line, most commonly named first:
  Name | alias, alias = rating

The rating (1 = nearly everyone says it, 100 = almost nobody does) is optional.
Without one it comes from the answer's place in the list blended with English
word frequency, so the hand order decides most of it.
"""

import json
import re
from pathlib import Path

from build_answers import compact, normalize, parse, singular, zipf

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "vault"
OUT = ROOT / "src" / "game" / "data" / "vault.generated.ts"
META = ROOT / "src" / "game" / "data" / "vaultMeta.generated.ts"

ORDER_WEIGHT = 0.7  # rest is word frequency

# titles and filler that shouldn't count as a name on their own
NOT_NAMES = {
    "lord", "lady", "madam", "madame", "mrs", "mr", "ms", "miss", "professor", "sir", "dr", "doctor",
    "aunt", "uncle", "king", "queen", "prince", "princess", "duke", "duchess", "earl", "captain",
    "saint", "old", "mad", "nearly", "moaning", "little", "big", "grand", "jr", "sr", "ii", "iii",
    "of", "de", "von", "van", "the", "and", "chief", "mayor", "principal", "officer", "comic", "bumblebee",
    "judge", "lawyer", "man", "guy", "lady", "teen", "clown", "helper", "superintendent", "reverend", "coach", "groundskeeper",
}


def header(text):
    meta = {"rules": [], "strip": [], "prefix": [], "add_prefix": [], "surname": False, "firstname": False}
    for line in text.splitlines():
        m = re.match(r"^#\s*([a-z-]+)\s*(?::\s*(.*))?$", line.strip())
        if not m:
            continue
        k, v = m.group(1), (m.group(2) or "").strip()
        if k == "rule":
            meta["rules"].append(v)
        elif k in ("strip", "prefix", "add-prefix"):
            meta[k.replace("-", "_")] += [w.strip().lower() for w in v.split(",") if w.strip()]
        elif k == "surname":
            meta["surname"] = True
        elif k == "firstname":
            meta["firstname"] = True
        else:
            meta[k] = v
    return meta


def variants(name, meta):
    """Extra spellings players are likely to type."""
    n = normalize(name)
    out = []
    words = n.split(" ")
    for w in meta["strip"]:
        ws = w.split(" ")
        if len(words) > len(ws) and words[-len(ws):] == ws:
            out.append(" ".join(words[: -len(ws)]))
    for w in meta["prefix"]:
        ws = w.split(" ")
        if len(words) > len(ws) and words[: len(ws)] == ws:
            out.append(" ".join(words[len(ws):]))
    for w in meta["add_prefix"]:
        if not any(n.startswith(p + " ") for p in meta["prefix"] + [w]):
            out.append(f"{w} {n}")
    if meta["surname"] and len(words) > 1 and words[-1] not in NOT_NAMES:
        out.append(words[-1])
    if meta["firstname"] and len(words) > 1 and words[0] not in NOT_NAMES:
        out.append(words[0])
    # possessives: "Newton's laws" -> "newton laws" too
    if re.search(r"\w['’]s?\b", name):
        for v in [n, *out]:
            w = v.split(" ")
            if len(w) > 1 and w[0].endswith("s"):
                out.append(" ".join([w[0][:-1], *w[1:]]))
    return [v for v in out if v and v != n]


def load(slug):
    text = (SRC / f"{slug}.txt").read_text(encoding="utf8")
    meta = header(text)
    items = parse(text)
    seen = {}
    clean = []
    for it in items:
        k = compact(normalize(it["name"]))
        if k in seen:
            raise SystemExit(f"{slug}: '{it['name']}' is listed twice")
        seen[k] = it
        clean.append(it)
    # aliases: normalized, no clashes with another answer's name or alias
    taken = {compact(normalize(it["name"])): it for it in clean}
    for it in clean:
        own = compact(normalize(it["name"]))
        al = []
        for a in [*it["aliases"], *variants(it["name"], meta)]:
            na = normalize(a)
            ka = compact(na)
            if not na or ka == own or na in al:
                continue
            if ka in taken and taken[ka] is not it:
                continue  # belongs to another answer
            taken[ka] = it
            al.append(na)
        it["aliases"] = al
    rate(clean)
    return meta, clean


def rate(items):
    n = max(1, len(items) - 1)
    by_freq = sorted(range(len(items)), key=lambda i: (-zipf(items[i]["name"]), i))
    freq_rank = {i: r for r, i in enumerate(by_freq)}
    for i, it in enumerate(items):
        if it["curated"] is not None:
            continue
        order = 1 + 98 * i / n
        freq = 1 + 98 * freq_rank[i] / n
        it["curated"] = ORDER_WEIGHT * order + (1 - ORDER_WEIGHT) * freq + i * 1e-4
    for it in items:
        it["curated"] = round(max(1, min(99.99, it["curated"])), 2)


def games():
    out = []
    for line in (SRC / "games.txt").read_text(encoding="utf8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        num, rest = line.split(":", 1)
        out.append({"n": int(num), "slugs": [s.strip() for s in rest.split(",")]})
    return out


def main():
    gs = games()
    slugs = [s for g in gs for s in g["slugs"]]
    seeds = []
    for slug in slugs:
        meta, items = load(slug)
        lines = []
        for it in items:
            al = f" | {', '.join(it['aliases'])}" if it["aliases"] else ""
            lines.append(f"{it['name']}{al} = {it['curated']:g}")
        seeds.append((slug, meta, lines))
        print(f"{slug:32} L{meta['level']} {len(lines):4}")
    out = [
        "// Generated by scripts/build_vault.py from data/vault. Do not edit by hand.",
        "// Server only: never import this from client code.",
        "",
        'import type { VaultGame, VaultSeed } from "./vault";',
        "",
        f"export const VAULT_GAMES: VaultGame[] = {json.dumps(gs)};",
        "",
        "export const VAULT_SEEDS: VaultSeed[] = [",
    ]
    for slug, meta, lines in seeds:
        body = "\n".join(lines).replace("`", "'").replace("${", "$ {")
        t = meta["title"]
        head = {
            "slug": slug,
            "title": t,
            "prompt": meta.get("prompt") or f"Name as many {t[:1].lower() + t[1:]} as you can.",
            "level": int(meta["level"]),
            "domain": meta["domain"],
            "noun": meta.get("noun") or meta["title"].lower(),
            "rules": meta["rules"],
        }
        out.append(f"  {{ ...{json.dumps(head)}, answers: `\n{body}\n` }},")
    out.append("];")
    OUT.write_text("\n".join(out) + "\n", encoding="utf8")
    # client-safe: just how many games there are
    META.write_text(
        "// Generated by scripts/build_vault.py. Safe to import from client code.\n\n"
        f"export const VAULT_GAME_COUNT = {len(gs)};\n",
        encoding="utf8",
    )
    print("games", len(gs), "prompts", len(seeds))


if __name__ == "__main__":
    main()
