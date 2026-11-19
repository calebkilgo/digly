"""Merges reviewed extra answers into a prompt's list and rates every answer.

  pip install wordfreq
  python scripts/build_pools.py kitchen-tools
  python scripts/build_pools.py vault/weather-events

Reads the prompt's hand-written list (copied to data/sources/<slug>.list.txt the
first time, so later runs start from it again) and data/sources/<slug>.tsv, the extra answers pulled from
Wikidata and reviewed by hand. The source file has one answer per line:

  name <TAB> aliases separated by | <TAB> sitelinks <TAB> difficulty <TAB> rating

sitelinks: how many Wikipedia language editions have an article on it. Blank
if unknown. difficulty: 1 (nearly everyone says it) to 5 (experts only), a
judgement call made while reviewing. rating: optional exact 1..100; put 100 on
one line to make it the Platinum.

Then it writes data/answers/<slug>.txt (or data/vault/<slug>.txt with the vault/
prefix) with every answer rated, easiest first.
Only a Platinum's rating is kept as written. For everything else, the main signal is the answer's place
in the hand-written list (written most-common first), or for a new answer its
difficulty, mapped onto the same 0..1 scale. Sitelinks and how common the name
is as an English word (wordfreq) only nudge answers within that, because they
measure fame, not how quickly a player thinks of something. The blend is turned
into 1..99 by rank. A line rated 100 (or 99.99) is the Platinum; every other
answer is capped below it.

Run build_answers.py (daily) or build_vault.py (Vault) afterwards as usual.
"""

import sys
from pathlib import Path

from build_answers import compact, normalize, parse, singular, zipf

ROOT = Path(__file__).resolve().parent.parent
MAX_ALIASES = 8
# where each difficulty sits on the hand list's 0 (first) .. 1 (last) scale
DIFFICULTY_AT = {1: 0.0, 2: 0.25, 3: 0.52, 4: 0.77, 5: 0.94}
W_BASE, W_LINKS, W_FREQ = 0.9, 0.07, 0.03


def read_list(path):
    head, body = [], []
    for line in path.read_text(encoding="utf8").splitlines():
        if line.startswith("#") and not body:
            head.append(line)
        elif line.strip() and not line.startswith("#"):
            body.append(line)
    items = parse("\n".join(body))
    for i, it in enumerate(items):
        it["order"] = i
        it["links"] = None
        # hand files number their first few answers 1, 2, 3...; list order already
        # says that, and mixing fixed numbers with ranked ones skews the easy end
        if (it["curated"] or 0) < 99.99:
            it["curated"] = None
    return head, items


def read_source(path):
    out = []
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t") + ["", "", "", ""]
        name = cols[0].strip()
        aliases = [a.strip() for a in cols[1].split("|") if a.strip()]
        links = int(cols[2]) if cols[2].strip().isdigit() else None
        diff = int(cols[3]) if cols[3].strip().isdigit() else None
        rating = float(cols[4]) if cols[4].strip() else None
        out.append({"name": name, "aliases": aliases, "links": links, "diff": diff, "rating": rating})
    return out


def keys_of(name):
    k = compact(normalize(name))
    return {s for s in singular(k) if s}


def merge(items, extra):
    owner = {}
    for it in items:
        for n in [it["name"], *it["aliases"]]:
            for k in keys_of(n):
                owner.setdefault(k, it)
    added = 0
    for ex in extra:
        hit = next((owner[k] for n in [ex["name"], *ex["aliases"]] for k in keys_of(n) if k in owner), None)
        if hit:
            # already listed: keep the hand line, take the sitelinks and any new spellings
            if ex["links"] is not None:
                hit["links"] = max(hit["links"] or 0, ex["links"])
            if ex["rating"] is not None:
                hit["curated"] = ex["rating"]
            if ex["diff"] is not None:
                hit["diff"] = ex["diff"]  # a reviewed difficulty beats list position
            cand = ex["aliases"] + ([ex["name"]] if compact(normalize(ex["name"])) != compact(normalize(hit["name"])) else [])
        else:
            hit = {"name": ex["name"], "aliases": [], "curated": ex["rating"], "order": None, "links": ex["links"], "diff": ex["diff"]}
            items.append(hit)
            for k in keys_of(ex["name"]):
                owner.setdefault(k, hit)
            cand = ex["aliases"]
            added += 1
        for a in cand:
            na = normalize(a)
            if not na or len(na) > 40 or len(hit["aliases"]) >= MAX_ALIASES:
                continue
            ks = keys_of(na)
            if any(k in owner and owner[k] is not hit for k in ks):
                continue  # that spelling belongs to another answer
            if na in hit["aliases"] or compact(na) == compact(normalize(hit["name"])):
                continue
            hit["aliases"].append(na)
            for k in ks:
                owner.setdefault(k, hit)
    return added


def pct_rank(values):
    """value -> 0..1 by rank, ties share the middle"""
    s = sorted(values)
    n = len(s)
    first, last = {}, {}
    for i, v in enumerate(s):
        first.setdefault(v, i)
        last[v] = i
    return {v: ((first[v] + last[v]) / 2) / max(1, n - 1) for v in s}


def rate(items):
    hand = [it for it in items if it["order"] is not None]
    n_hand = max(1, len(hand) - 1)
    links = pct_rank([it["links"] for it in items if it["links"] is not None])
    freq = pct_rank([zipf(it["name"]) for it in items])
    scored = []
    for it in items:
        if it.get("diff"):
            base = DIFFICULTY_AT[it["diff"]]
        elif it["order"] is not None:
            base = it["order"] / n_hand
        else:
            base = DIFFICULTY_AT.get(it.get("diff") or 0, 0.9)
        nudge = [(W_FREQ, 1 - freq[zipf(it["name"])])]
        if it["links"] is not None:
            nudge.append((W_LINKS, 1 - links[it["links"]]))
        w = sum(x for x, _ in nudge)
        fame = sum(x * v for x, v in nudge) / w
        scored.append((W_BASE * base + (1 - W_BASE) * fame, it))
    free = sorted((sc, it["name"]) for sc, it in scored if it["curated"] is None)
    rank = {name: i for i, (_, name) in enumerate(free)}
    n = max(1, len(free) - 1)
    plat = [it for it in items if (it["curated"] or 0) >= 99.99]
    if len(plat) > 1:
        raise SystemExit(f"more than one Platinum: {[p['name'] for p in plat]}")
    for _, it in scored:
        if it["curated"] is None:
            it["curated"] = 1 + 98 * rank[it["name"]] / n
        elif it not in plat:
            it["curated"] = min(it["curated"], 99)
    for it in plat:
        it["curated"] = 99.99
    for it in items:
        it["curated"] = round(max(1, min(99.99, it["curated"])), 2)


def main():
    arg = sys.argv[1]
    vault = arg.startswith("vault/")
    slug = arg.split("/", 1)[1] if vault else arg
    path = ROOT / "data" / ("vault" if vault else "answers") / f"{slug}.txt"
    # the hand-written list is kept as-is in data/sources, so this can be re-run
    hand = ROOT / "data" / "sources" / f"{slug}.list.txt"
    if not hand.exists():
        hand.write_text(path.read_text(encoding="utf8"), encoding="utf8")
    head, items = read_list(hand)
    added = merge(items, read_source(ROOT / "data" / "sources" / f"{slug}.tsv"))
    rate(items)
    items.sort(key=lambda it: (it["curated"], it["name"]))
    lines = head + [f"{it['name']}{' | ' + ', '.join(it['aliases']) if it['aliases'] else ''} = {it['curated']:g}" for it in items]
    path.write_text("\n".join(lines) + "\n", encoding="utf8")
    print(f"{slug}: {len(items)} answers ({added} new)")


if __name__ == "__main__":
    main()
