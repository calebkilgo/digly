"""Builds the link preview image and app icons from the game's own sprite data.

  pip install pillow fonttools brotli
  python scripts/make_brand.py

Writes public/og.png (1200x630), public/icons/*.png, src/app/icon.png and
src/app/apple-icon.png. Rerun it if the miner or gems change.
"""

import io
import math
import random
import re
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
INK = (0x1B, 0x10, 0x30)


def hexrgb(v):
    return ((v >> 16) & 255, (v >> 8) & 255, v & 255)


def h2(s):
    return tuple(int(s[i : i + 2], 16) for i in (1, 3, 5))


# ---- sprite data, straight from the source files ---------------------------
ms = (SRC / "scene/minerSprites.ts").read_text()
MPAL = {k: hexrgb(int(v, 16)) for k, v in re.findall(r"^\s+(\w): 0x([0-9a-f]{6}),", ms, re.M)}
BODY = re.findall(r'"([^"]*)"', re.search(r"const BODY = \[(.*?)\];", ms, re.S).group(1))
PICK = re.findall(r'"([^"]*)"', re.search(r"export const PICK = \[(.*?)\];", ms, re.S).group(1))
ARM = re.findall(r'"([^"]*)"', re.search(r"export const ARM = \[(.*?)\];", ms, re.S).group(1))
_at = re.search(r"export const ARM_AT = \{ x: ([\d.]+), y: ([\d.]+) \}", ms)
ARM_AT = (round(float(_at.group(1))), round(float(_at.group(2))))

art = (SRC / "ui/art.tsx").read_text()
FILL = {k: (h2(b), h2(s), h2(l)) for k, b, s, l in re.findall(r'(\w+): \{ base: "(#[0-9a-f]{6})", shade: "(#[0-9a-f]{6})", light: "(#[0-9a-f]{6})"', art)}
gblock = art[art.index("GEM_ROWS") : art.index("export function GemIcon")]


def gem(name):
    return re.findall(r'"([^"]*)"', re.search(name + r": \[(.*?)\]", gblock, re.S).group(1))


def gempal(name):
    b, s, l = FILL[name]
    return {"K": INK, "B": b, "S": s, "L": l}


# ---- a tiny pixel canvas that scales up crisply -----------------------------
class Pix:
    def __init__(self, w, h, bg=(0, 0, 0)):
        self.w, self.h = w, h
        self.im = Image.new("RGB", (w, h), bg)
        self.px = self.im.load()

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def stamp(self, rows, pal, x, y):
        for r, row in enumerate(rows):
            for c, ch in enumerate(row):
                if ch in pal:
                    self.put(x + c, y + r, pal[ch])

    def up(self, s):
        return self.im.resize((self.w * s, self.h * s), Image.NEAREST)


STRATA = [(0xB5651D, 0x8A4512, 0xD98A3A), (0xD9822B, 0xA85D17, 0xF2A94E), (0xF0B24A, 0xC4862A, 0xFFD27A), (0xD2553A, 0xA13A26, 0xF07A5A),
          (0x9A4F8F, 0x733668, 0xC274B5), (0x5B4FB0, 0x413886, 0x7E72D6), (0x3A4A9E, 0x293676, 0x5A6CCC), (0x262F6E, 0x1A2150, 0x3C4A99)]


def strata(p, top, seed=29):
    rnd = random.Random(seed)
    band = max(6, (p.h - top) // 7)
    for bi in range(8):
        y0 = top + bi * band
        base, shade, fleck = (hexrgb(c) for c in STRATA[min(7, bi)])
        ph = rnd.random() * 6
        for x in range(p.w):
            t = y0 + int(math.sin(x * 0.07 + ph) * 2) if bi else y0
            for yy in range(t, p.h):
                p.put(x, yy, base)
            if bi:
                p.put(x, t, INK)
                p.put(x, t + 1, shade)
        for _ in range(p.w * band // 40):
            p.put(rnd.randrange(p.w), rnd.randint(y0 + 2, y0 + band), fleck)


def sky(p, h):
    for y in range(h):
        for x in range(p.w):
            p.put(x, y, (0x7E, 0xC8, 0xFF))
    for x in range(p.w):
        g = h - 3 + ((x // 3) % 2)
        for y in range(g, h):
            p.put(x, y, (0x35, 0xC7, 0x59))
        p.put(x, h, (0x1F, 0x8C, 0x3A))


# ---- fonts: the game's own (Silkscreen for headings, VT323 for body) ------
def _woff2(name, size):
    f = TTFont(str(ROOT / "public/fonts" / name))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


def display(size):
    return _woff2("silkscreen-700.woff2", size)


def body(size):
    return _woff2("vt323.woff2", size)


def miner(p, x, y):
    """The miner as he stands in the game: body plus the arm holding the pickaxe upright."""
    p.stamp(BODY, MPAL, x, y)
    p.stamp(ARM, MPAL, x + ARM_AT[0], y + ARM_AT[1])


NIGHT = [(0x10, 0x16, 0x2B), (0x15, 0x1C, 0x38), (0x1B, 0x23, 0x47), (0x23, 0x2B, 0x56), (0x2C, 0x34, 0x66)]
DIRT = [(0xB5, 0x65, 0x1D), (0x8A, 0x45, 0x12), (0xD9, 0x8A, 0x3A)]


def night_sky(p, ground, seed=3):
    band = max(4, ground // (len(NIGHT) + 1))
    for y in range(ground):
        i = max(0, len(NIGHT) - 1 - (ground - 1 - y) // band)
        for x in range(p.w):
            p.put(x, y, NIGHT[i])
    rnd = random.Random(seed)
    for _ in range(p.w * ground // 160):
        p.put(rnd.randrange(p.w), rnd.randrange(max(1, ground - 10)), (0xC8, 0xC4, 0xB8))


def moon(p, x0, y0, n, phase=0.3):
    c = math.cos(2 * math.pi * phase)
    R = n / 2
    for j in range(n):
        for i in range(n):
            x = (i + 0.5 - R) / R
            y = (j + 0.5 - R) / R
            if x * x + y * y > 1:
                continue
            edge = math.sqrt(1 - y * y) * c
            lit = x > edge if phase < 0.5 else x < -edge
            p.put(x0 + i, y0 + j, (0xFF, 0xF4, 0xD0) if lit else (0x34, 0x3A, 0x5E))


def pine(p, cx, base, h):
    trunk = 4
    crown = h - trunk
    tiers = 3
    th = crown / tiers
    p.rect(cx - 1, base - trunk, 2, trunk, (0x4A, 0x2E, 0x14))
    for row in range(crown):
        t = min(tiers - 1, int(row / th))
        local = row - t * th
        half = max(1, round(1 + t * 1.6 + local * 0.6))
        y = base - trunk - crown + row
        p.rect(cx - half - 1, y, half * 2 + 2, 1, (0x18, 0x3A, 0x22))
        p.rect(cx - half, y, half * 2, 1, (0x24, 0x5A, 0x30))
        p.rect(cx - half, y, max(1, round(half * 0.8)), 1, (0x2F, 0x6B, 0x3A))


def dirt(p, top, seed=5):
    rnd = random.Random(seed)
    for y in range(top, p.h):
        for x in range(p.w):
            p.put(x, y, DIRT[0])
    for x in range(p.w):
        p.put(x, top, DIRT[1])
    for _ in range(p.w * (p.h - top) // 30):
        p.put(rnd.randrange(p.w), rnd.randint(top + 2, p.h - 1), DIRT[2] if rnd.random() < 0.6 else DIRT[1])


LOGO = {
    "D": ["1110", "1001", "1001", "1001", "1001", "1001", "1110"],
    "I": ["111", "010", "010", "010", "010", "010", "111"],
    "G": ["0111", "1000", "1000", "1011", "1001", "1001", "0111"],
    "L": ["100", "100", "100", "100", "100", "100", "111"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
}


def logo(p, x0, y0, s):
    """Pixel DIGLY: ink outline, red drop, gold face. s = pixels per logo cell."""
    def letters(dx, dy, col):
        x = x0
        for ch in "DIGLY":
            for r, row in enumerate(LOGO[ch]):
                for k, b in enumerate(row):
                    if b == "1":
                        p.rect(x + k * s + dx, y0 + r * s + dy, s, s, col)
            x += len(LOGO[ch][0]) * s + s

    o = max(1, s // 4)
    ring = [(-o, 0), (o, 0), (0, -o), (0, o), (-o, -o), (o, o), (-o, o), (o, -o)]
    for dx, dy in ring:
        letters(dx, dy + o * 2, INK)
    letters(0, o * 2, (0xD2, 0x55, 0x3A))
    for dx, dy in ring:
        letters(dx, dy, INK)
    letters(0, 0, (0xFF, 0xD2, 0x3F))


def logo_width(s):
    return sum(len(LOGO[c][0]) for c in "DIGLY") * s + 4 * s


# ---- link preview: 1200x630, the home screen at night ---------------------
def og():
    S = 4
    p = Pix(300, 158)
    ground = 132
    night_sky(p, ground)
    moon(p, 52, 18, 15)
    # the mountain: a ledge for the miner, then a steep face off the top right
    foot, ledge_l, mouth = 54, 74, 104
    ledge_h = 26
    for x in range(p.w):
        if x < foot:
            h = 0
        elif x < ledge_l:
            t = (x - foot) / (ledge_l - foot)
            h = round(ledge_h * t * t * (3 - 2 * t))
        elif x < mouth:
            h = ledge_h
        else:
            h = min(ground, ledge_h + round((x - mouth) * 1.15 + ((x - mouth) / 30) ** 2.4))
        for y in range(ground - h, ground):
            p.put(x, y, (0x76, 0x68, 0x8A) if x < mouth + 120 else (0x5F, 0x52, 0x76))
        if h:
            p.put(x, ground - h, INK)
            for b in range(ground - h + 8, ground, 9):
                if (x + b) % 23:
                    p.put(x, b, (0x46, 0x3A, 0x5A))
        if 0 < h > 100 and ground - h < 14:
            for y in range(ground - h, min(ground, ground - h + 4)):
                p.put(x, y, (0xF6, 0xEB, 0xD9))
    p.rect(ledge_l, ground - ledge_h, mouth - ledge_l, 1, (0x8A, 0x6A, 0x4A))
    # grass on the open ground
    for x in range(foot):
        p.rect(x, ground - 2, 1, 2, (0x4E, 0x9A, 0x3A))
        if x % 3 == 0:
            p.put(x, ground - 3, (0x5F, 0xB2, 0x47))
    for cx, h in [(8, 30), (22, 36), (37, 28)]:
        pine(p, cx, ground, h)
    dirt(p, ground)
    miner(p, 84, ground - ledge_h - len(BODY))
    # treasures in the dirt
    for name, x, y in [("copper", 20, 140), ("gold", 72, 144), ("diamond", 150, 141), ("ruby", 226, 145), ("platinum", 270, 139)]:
        p.stamp(gem(name), gempal(name), x, y)
    # words on a card, like the game's
    px0, py0, pw, ph = 126, 18, 164, 92
    p.rect(px0 - 1, py0 - 1, pw + 2, ph + 3, INK)
    p.rect(px0, py0, pw, ph, (0xFF, 0xF4, 0xDC))
    sc = 4
    logo(p, px0 + (pw - logo_width(sc)) // 2, py0 + 10, sc)
    img = p.up(S)
    d = ImageDraw.Draw(img)
    cx = (px0 + pw / 2) * S
    d.text((cx, (py0 + 52) * S), "DIG DEEP.", font=display(46), fill=INK, anchor="mm")
    d.text((cx, (py0 + 68) * S), "A daily knowledge dig in three levels.", font=body(34), fill=(0x3A, 0x2E, 0x4E), anchor="mm")
    d.text((cx, (py0 + 79) * S), "The rarer the answer, the more it's worth.", font=body(34), fill=(0xC2, 0x3B, 0x22), anchor="mm")
    img = img.crop((0, 0, 1200, 630))
    img.save(ROOT / "public/og.png", optimize=True)
    return img.size


# ---- app icon: the miner on his ledge under the moon ---------------------
def icon(size, safe=1.0):
    n = 32  # art pixels across
    p = Pix(n, n)
    night_sky(p, 26, seed=11)
    moon(p, 2, 4, 6)
    for x in range(n):
        p.rect(x, 26, 1, n - 26, (0x76, 0x68, 0x8A))
        p.put(x, 26, (0x8A, 0x6A, 0x4A))
    p.rect(0, 27, n, 1, INK)
    # big enough to read at 16px: hard hat, face and the pickaxe
    miner(p, 10, 26 - len(BODY))
    img = p.up(math.ceil(size / n)).resize((size, size), Image.NEAREST)
    if safe < 1.0:
        # maskable icons get cropped to a circle; keep the art inside the safe zone
        inner = img.resize((int(size * safe), int(size * safe)), Image.NEAREST)
        out = Image.new("RGB", (size, size), NIGHT[2])
        out.paste(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
        img = out
    return img


def icons():
    icon(192).save(ROOT / "public/icons/icon-192.png", optimize=True)
    icon(512).save(ROOT / "public/icons/icon-512.png", optimize=True)
    icon(512, safe=0.8).save(ROOT / "public/icons/maskable-512.png", optimize=True)
    icon(180).save(SRC / "app/apple-icon.png", optimize=True)
    icon(64).save(SRC / "app/icon.png", optimize=True)


if __name__ == "__main__":
    print("og", og())
    icons()
    print("icons done")
