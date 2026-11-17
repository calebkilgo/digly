"""Builds src/game/data/answers.generated.ts from data/answers/*.txt plus
public lists from github.com/dariusk/corpora.

  pip install wordfreq
  git clone --depth 1 https://github.com/dariusk/corpora /tmp/corpora
  python scripts/build_answers.py /tmp/corpora

Hand-set rarity values in the .txt files always win. Answers without one get
a starting estimate from English word frequency (wordfreq): the more often a
name shows up in text, the more players will think of it. Once players exist,
the server replaces these estimates with real find rates.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "answers"
OUT = ROOT / "src" / "game" / "data" / "answers.generated.ts"
CORPORA = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/corpora") / "data"

WORD_SUBS = {"st": "saint", "mt": "mount", "&": "and"}


# must match src/game/rules/normalize.ts
def normalize(raw: str) -> str:
    s = unicodedata.normalize("NFKD", raw)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("&", " and ")
    s = s.replace("++", " plus plus ").replace("#", " sharp ")
    s = re.sub(r"['’`]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    if not s:
        return ""
    words = [WORD_SUBS.get(w, w) for w in s.split(" ")]
    if words[0] == "the" and len(words) > 1:
        words = words[1:]
    return " ".join(words)


def compact(s: str) -> str:
    return s.replace(" ", "")


def singular(k: str):
    out = [k]
    if k.endswith("ies") and len(k) > 4:
        out.append(k[:-3] + "y")
    if k.endswith("es") and len(k) > 3:
        out.append(k[:-2])
    if k.endswith("s") and len(k) > 2:
        out.append(k[:-1])
    return out


def corpora(path, key=None, field=None):
    d = json.loads((CORPORA / path).read_text(encoding="utf8"))
    if key is None:
        key = [k for k in d if k not in ("description", "source")][0]
    keys = key if isinstance(key, list) else [key]
    out = []
    for k in keys:
        v = d[k]
        if isinstance(v, dict):
            v = list(v.keys())
        for x in v:
            out.append(x[field] if field else x)
    return out


def title(s: str) -> str:
    if s != s.lower():
        return s
    return " ".join(w if w in ("of", "the", "and", "in") else w[:1].upper() + w[1:] for w in s.split(" "))


def strip_suffix(words):
    def f(name):
        for w in words:
            if name.lower().endswith(" " + w) and len(name) > len(w) + 4:
                return name[: -len(w) - 1], [name]
        return name, []
    return f


def nfl(name):
    return name, [name.split(" ")[-1]]


# slug -> (extra GitHub lists, transform, commons: most-said answers in order)
CATS = {
    "dog-breeds": ([("animals/dogs.json",)], None, []),
    "fruits": ([("foods/fruits.json",)], None, []),
    "instruments": ([("music/instruments.json",)], None, []),
    "vegetables": ([("foods/vegetables.json",)], None,
        ["Carrot", "Potato", "Broccoli", "Tomato", "Lettuce", "Onion", "Cucumber", "Corn", "Spinach", "Pea", "Celery", "Green Bean", "Cabbage", "Cauliflower", "Bell Pepper"]),
    "herbs-spices": ([("foods/herbs_n_spices.json", ["herbs", "spices"])], None,
        ["Basil", "Oregano", "Cinnamon", "Black Pepper", "Salt", "Paprika", "Thyme", "Rosemary", "Parsley", "Garlic Powder", "Cumin", "Ginger", "Nutmeg", "Mint", "Turmeric"]),
    "flowers": ([], None,
        ["Rose", "Tulip", "Daisy", "Sunflower", "Lily", "Orchid", "Daffodil", "Lavender", "Carnation", "Dandelion", "Poppy", "Violet", "Lilac", "Hibiscus", "Marigold"]),
    "sports": ([], None,
        ["Soccer", "Basketball", "Baseball", "American Football", "Tennis", "Golf", "Hockey", "Volleyball", "Swimming", "Boxing", "Track and Field", "Rugby", "Cricket", "Wrestling", "Lacrosse"]),
    "car-brands": ([], None,
        ["Toyota", "Ford", "Honda", "Chevrolet", "BMW", "Tesla", "Mercedes-Benz", "Audi", "Nissan", "Volkswagen", "Hyundai", "Kia", "Jeep", "Subaru", "Ferrari"]),
    "cat-breeds": ([("animals/cats.json",)], strip_suffix(["cat"]),
        ["Persian", "Siamese", "Maine Coon", "Sphynx", "Ragdoll", "Bengal", "Russian Blue", "British Shorthair", "Scottish Fold", "Abyssinian", "American Shorthair"]),
    "gemstones": ([("materials/gemstones.json",)], None,
        ["Diamond", "Ruby", "Emerald", "Sapphire", "Amethyst", "Pearl", "Opal", "Topaz", "Jade", "Garnet", "Quartz", "Onyx", "Turquoise", "Aquamarine", "Amber"]),
    "cocktails": ([("foods/iba_cocktails.json",)], None,
        ["Margarita", "Mojito", "Martini", "Old Fashioned", "Pina Colada", "Cosmopolitan", "Manhattan", "Daiquiri", "Bloody Mary", "Long Island Iced Tea", "Moscow Mule", "Negroni", "Mai Tai", "Whiskey Sour", "Mimosa"]),
    "nfl-teams": ([("sports/nfl_teams.json", "nfl_teams", "name")], nfl,
        ["Dallas Cowboys", "New England Patriots", "Green Bay Packers", "Kansas City Chiefs", "Pittsburgh Steelers", "San Francisco 49ers", "Philadelphia Eagles", "Chicago Bears", "New York Giants", "Denver Broncos", "Seattle Seahawks", "Miami Dolphins"]),
    "state-capitals": ([("geography/us_state_capitals.json", "capitals", "capital")], None,
        ["Austin", "Boston", "Atlanta", "Denver", "Nashville", "Phoenix", "Honolulu", "Sacramento", "Albany", "Tallahassee", "Columbus", "Indianapolis", "Salt Lake City", "Richmond", "Raleigh"]),
    "programming-languages": ([], None,
        ["Python", "JavaScript", "Java", "C++", "C", "C#", "Ruby", "Swift", "PHP", "Go", "Rust", "TypeScript", "SQL", "Kotlin", "Perl"]),
    "dinosaurs": ([("animals/dinosaurs.json",)], None,
        ["Tyrannosaurus", "Triceratops", "Velociraptor", "Stegosaurus", "Brachiosaurus", "Brontosaurus", "Spinosaurus", "Diplodocus", "Ankylosaurus", "Allosaurus", "Parasaurolophus", "Iguanodon"]),
    "horse-breeds": ([("animals/horses.json",)], strip_suffix(["horse"]),
        ["Arabian", "Thoroughbred", "Clydesdale", "Mustang", "Quarter Horse", "Appaloosa", "Shetland Pony", "Friesian", "Pinto", "Palomino", "Morgan", "Paint", "Percheron", "Shire", "Andalusian"]),
    "knots": ([("technology/knots.json",)], None,
        ["Square Knot", "Bowline", "Slip Knot", "Figure Eight", "Granny Knot", "Overhand Knot", "Clove Hitch", "Windsor", "Half Hitch", "Hangman's Knot", "Sheet Bend", "Bow Tie", "Shoelace Knot"]),
    "constellations": ([], None,
        ["Orion", "Ursa Major", "Leo", "Scorpius", "Taurus", "Gemini", "Cassiopeia", "Ursa Minor", "Aries", "Cancer", "Virgo", "Libra", "Sagittarius", "Pisces", "Aquarius", "Capricornus", "Draco", "Pegasus", "Andromeda"]),
    "egyptian-gods": ([("mythology/egyptian_gods.json",)], None,
        ["Ra", "Anubis", "Osiris", "Isis", "Horus", "Set", "Thoth", "Bastet", "Hathor", "Amun", "Sobek", "Ptah", "Sekhmet", "Nut", "Geb"]),
}
# junk in the public lists
BLOCK = {
    "dinosaurs": {"Mollusc", "Fish", "Birds", "Fossil", "Turtle", "Dinosaur", "Crocodile", "Mammal", "Pterosaur", "Theropod", "Ichthyosaur", "Cetacea", "Plesiosaur"},
    "gemstones": {"Bone", "Synthetic Diamond"},
}

# categories that keep their hand file as-is
for slug in ["african-countries", "birds", "bones", "cheeses", "dances", "elements", "european-countries", "greek-myth", "languages", "us-states"]:
    CATS[slug] = ([], None, [])


LINE = re.compile(r"^(.+?)(?:\|(.+?))?(?:=\s*([\d.]+))?\s*$")


def parse(text):
    out = []
    for line in text.splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        m = LINE.match(t)
        name = m.group(1).strip()
        aliases = [a.strip() for a in (m.group(2) or "").split(",") if a.strip()]
        cur = float(m.group(3)) if m.group(3) else None
        out.append({"name": name, "aliases": aliases, "curated": cur})
    return out


def misc_sections():
    p = SRC / "aliases-misc.txt"
    secs, cur = {}, None
    for line in p.read_text(encoding="utf8").splitlines():
        m = re.match(r"^\[(.+)\]$", line.strip())
        if m:
            cur = m.group(1)
            secs[cur] = []
        elif cur is not None:
            secs[cur].append(line)
    return {k: "\n".join(v) for k, v in secs.items()}


class Bag:
    """Answers for one category, refusing anything whose name or alias clashes."""

    def __init__(self):
        self.items = []
        self.keys = {}

    def forms(self, it):
        return [compact(normalize(x)) for x in [it["name"], *it["aliases"]] if normalize(x)]

    def add(self, it):
        fs = self.forms(it)
        if not fs:
            return False
        # an existing answer already covers this name (also catches plurals)
        if any(s in self.keys for f in fs[:1] for s in singular(f)):
            owner = next(self.keys[s] for s in singular(fs[0]) if s in self.keys)
            for a in it["aliases"]:
                k = compact(normalize(a))
                if k and k not in self.keys:
                    owner["aliases"].append(a)
                    self.keys[k] = owner
            if owner["curated"] is None and it["curated"] is not None:
                owner["curated"] = it["curated"]
            return False
        aliases = []
        for a, f in zip(it["aliases"], fs[1:]):
            if f not in self.keys and f != fs[0]:
                aliases.append(a)
        it = {**it, "aliases": aliases}
        self.items.append(it)
        for f in self.forms(it):
            self.keys.setdefault(f, it)
        return True


def zipf(name):
    return zipf_frequency(normalize(name), "en")


def estimate(items, commons):
    """Fills curated values that weren't hand-set. Two decimals so ties are rare."""
    common_rank = {compact(normalize(n)): i for i, n in enumerate(commons)}
    hand = [(zipf(it["name"]), it["curated"]) for it in items if it["curated"] is not None]
    hand.sort()
    free = [it for it in items if it["curated"] is None]
    # most frequent first; length breaks ties (longer names are usually more obscure)
    free.sort(key=lambda it: (-zipf(it["name"]), len(it["name"]), it["name"]))
    n = max(1, len(free) - 1)
    for i, it in enumerate(free):
        key = compact(normalize(it["name"]))
        if key in common_rank:
            it["curated"] = 1 + common_rank[key] * (14 / max(1, len(commons) - 1))
        elif len(hand) >= 10:
            # place it among the hand-set answers with the nearest word frequency
            z = zipf(it["name"])
            near = sorted(hand, key=lambda h: abs(h[0] - z))[:5]
            base = sorted(c for _, c in near)[len(near) // 2]
            it["curated"] = min(99, base + (i / n) * 0.9)
        else:
            # Word frequency is a rough guide (names like "Ash" or "Coral" are
            # also everyday words), so only the hand-picked commons can be copper.
            it["curated"] = 40 + 59 * (i / n)
    for it in items:
        it["curated"] = round(max(1, min(99.99, it["curated"])), 2)


def build(slug, misc):
    extras, transform, commons = CATS[slug]
    bag = Bag()
    path = SRC / f"{slug}.txt"
    if path.exists():
        for it in parse(path.read_text(encoding="utf8")):
            bag.add(it)
    if slug in misc:
        for it in parse(misc[slug]):
            bag.add(it)
    for spec in extras:
        for raw in corpora(*spec):
            name = title(str(raw).strip())
            if name in BLOCK.get(slug, ()):
                continue
            aliases = []
            if transform:
                name, aliases = transform(name)
            bag.add({"name": name, "aliases": aliases, "curated": None})
    estimate(bag.items, commons)
    lines = []
    for it in bag.items:
        al = f" | {', '.join(it['aliases'])}" if it["aliases"] else ""
        lines.append(f"{it['name']}{al} = {it['curated']:g}")
    return lines


def main():
    misc = misc_sections()
    out = ["// Generated by scripts/build_answers.py from data/answers. Do not edit by hand.", "", "export const ANSWERS: Record<string, string> = {"]
    total = 0
    for slug in sorted(CATS):
        lines = build(slug, misc)
        total += len(lines)
        body = "\n".join(lines).replace("`", "'").replace("${", "$ {")
        out.append(f'  "{slug}": `\n{body}\n`,')
        print(f"{slug:24} {len(lines):5}")
    out.append("};")
    OUT.write_text("\n".join(out) + "\n", encoding="utf8")
    print("total", total)


if __name__ == "__main__":
    main()
