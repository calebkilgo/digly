"""Checks the built Vault (src/game/data/vault.generated.ts).

  python scripts/validate_vault.py

Errors fail the run. Warnings are things to look at by hand.
"""

import json
import re
import sys
from math import log, sqrt
from pathlib import Path

from build_answers import compact, normalize, singular

ROOT = Path(__file__).resolve().parent.parent
VAULT = ROOT / "src" / "game" / "data" / "vault.generated.ts"
DAILY = ROOT / "src" / "game" / "data" / "answers.generated.ts"
SEEDS = ROOT / "src" / "game" / "data" / "seeds.ts"

MIN_POOL = {1: 30, 2: 60, 3: 100}
MAX_WORDS = 8
# must match SCORING.tierZ in src/game/rules/scoring.ts
TIER_Z = {"gold": -1.0, "diamond": 0.25, "ruby": 1.5}
TARGET = {"copper": 0.159, "gold": 0.440, "diamond": 0.334, "ruby": 0.067}
SHARE_SLACK = 0.03
OVERLAP_WARN = 0.25

LINE = re.compile(r"^(.+?)(?:\|(.+?))?(?:=\s*([\d.]+))?\s*$")


def norm_inv(p):
    # Acklam, same as normInv in rarity.ts
    a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
    b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
    c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
    d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
    lo = 0.02425
    if p < lo:
        q = sqrt(-2 * log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > 1 - lo:
        q = sqrt(-2 * log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    q = p - 0.5
    r = q * q
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def tier_of(z):
    if z >= TIER_Z["ruby"]:
        return "ruby"
    if z >= TIER_Z["diamond"]:
        return "diamond"
    if z >= TIER_Z["gold"]:
        return "gold"
    return "copper"


def parse_answers(body):
    out = []
    for line in body.strip().splitlines():
        m = LINE.match(line.strip())
        out.append({
            "name": m.group(1).strip(),
            "aliases": [a.strip() for a in (m.group(2) or "").split(",") if a.strip()],
            "rating": float(m.group(3)) if m.group(3) else None,
        })
    return out


def keys(a):
    ks = set()
    for x in [a["name"], *a["aliases"]]:
        k = compact(normalize(x))
        if k:
            ks.update(singular(k))
    return ks


def tiers(answers):
    order = sorted(range(len(answers)), key=lambda i: (answers[i]["rating"], i))
    n = len(answers)
    out = [None] * n
    for k, i in enumerate(order):
        out[i] = tier_of(norm_inv((k + 0.5) / n))
    out[order[-1]] = "platinum"
    return out


def load_vault():
    text = VAULT.read_text(encoding="utf8")
    games = json.loads(re.search(r"VAULT_GAMES: VaultGame\[\] = (\[.*?\]);", text).group(1))
    seeds = {}
    for m in re.finditer(r"\{ \.\.\.(\{.*?\}), answers: `\n(.*?)\n` \}", text, re.S):
        head = json.loads(m.group(1))
        head["answers"] = parse_answers(m.group(2))
        seeds[head["slug"]] = head
    return games, seeds


def load_daily():
    text = DAILY.read_text(encoding="utf8")
    pools = {m.group(1): parse_answers(m.group(2)) for m in re.finditer(r'"([a-z0-9-]+)": `\n(.*?)\n`', text, re.S)}
    titles = re.findall(r'title: "([^"]+)"', SEEDS.read_text(encoding="utf8"))
    return pools, titles


def title_key(t):
    return " ".join(singular(w)[-1] if len(w) > 3 else w for w in normalize(t).split(" "))


def main():
    games, seeds = load_vault()
    daily, daily_titles = load_daily()
    errors, warns = [], []

    def err(m):
        errors.append(m)

    def warn(m):
        warns.append(m)

    # prompts
    seen_titles = {title_key(t): f"daily '{t}'" for t in daily_titles}
    for slug, s in seeds.items():
        words = s["title"].split()
        if len(words) > MAX_WORDS:
            err(f"{slug}: title has {len(words)} words")
        tk = title_key(s["title"])
        if tk in seen_titles:
            err(f"{slug}: title '{s['title']}' repeats {seen_titles[tk]}")
        seen_titles[tk] = f"vault '{s['title']}'"

    # pools
    for slug, s in seeds.items():
        a = s["answers"]
        need = MIN_POOL[s["level"]]
        if len(a) < need:
            err(f"{slug}: {len(a)} answers, level {s['level']} needs {need}")
        if any(x["rating"] is None for x in a):
            err(f"{slug}: some answers have no rating")
            continue
        top = max(x["rating"] for x in a)
        if sum(1 for x in a if x["rating"] == top) != 1:
            err(f"{slug}: hardest rating {top} is shared, so there isn't exactly one Platinum")
        t = tiers(a)
        if t.count("platinum") != 1:
            err(f"{slug}: {t.count('platinum')} Platinum answers")
        n = len(a)
        for k, target in TARGET.items():
            share = t.count(k) / n
            if abs(share - target) > SHARE_SLACK:
                err(f"{slug}: {k} share {share:.1%}, target {target:.1%}")
        owner = {}
        for x in a:
            for al in x["aliases"]:
                if al != normalize(al):
                    err(f"{slug}: alias '{al}' isn't normalized (should be '{normalize(al)}')")
            for k in {compact(normalize(v)) for v in [x["name"], *x["aliases"]]}:
                if k in owner and owner[k] is not x:
                    err(f"{slug}: '{k}' belongs to both '{owner[k]['name']}' and '{x['name']}'")
                owner[k] = x

    # near-duplicates: how much of a pool another pool already covers
    pool_keys = {f"vault:{s}": set().union(*(keys(x) for x in v["answers"])) for s, v in seeds.items()}
    pool_keys.update({f"daily:{s}": set().union(*(keys(x) for x in v)) for s, v in daily.items()})
    for slug, s in seeds.items():
        mine = s["answers"]
        for other, ks in pool_keys.items():
            if other == f"vault:{slug}":
                continue
            hit = sum(1 for x in mine if keys(x) & ks)
            share = hit / len(mine)
            if share >= OVERLAP_WARN:
                warn(f"{slug}: {share:.0%} of answers also count in {other}")

    # games
    used = {}
    for g in games:
        sl = g["slugs"]
        if len(sl) != 3:
            err(f"game {g['n']}: {len(sl)} prompts")
            continue
        for s in sl:
            if s not in seeds:
                err(f"game {g['n']}: unknown prompt {s}")
            if s in used:
                err(f"game {g['n']}: {s} already used in game {used[s]}")
            used[s] = g["n"]
        if any(s not in seeds for s in sl):
            continue
        lv = [seeds[s]["level"] for s in sl]
        if lv != [1, 2, 3]:
            err(f"game {g['n']}: levels {lv}, expected [1, 2, 3]")
        doms = [seeds[s]["domain"] for s in sl]
        if len(set(doms)) != 3:
            err(f"game {g['n']}: domains repeat {doms}")
        for i in range(3):
            for j in range(i + 1, 3):
                a, b = pool_keys[f"vault:{sl[i]}"], pool_keys[f"vault:{sl[j]}"]
                both = sorted(a & b)
                if both:
                    err(f"game {g['n']}: {sl[i]} and {sl[j]} share {', '.join(both[:5])}")

    # spread
    spread = {}
    for s in seeds.values():
        spread[s["domain"]] = spread.get(s["domain"], 0) + 1
    print(f"{len(games)} games, {len(seeds)} prompts")
    print("domains:", ", ".join(f"{k} {v}" for k, v in sorted(spread.items(), key=lambda kv: -kv[1])))
    for w in warns:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} errors, {len(warns)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
