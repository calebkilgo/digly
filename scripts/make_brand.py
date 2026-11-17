"""Builds the link preview image and app icons from the game's own sprite data.

  pip install pillow fonttools
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


# ---- fonts ------------------------------------------------------------------
def font(size):
    woff = ROOT / "node_modules/@fontsource/jersey-10/files/jersey-10-latin-400-normal.woff"
    f = TTFont(str(woff))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


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


# ---- link preview: 1200x630 ------------------------------------------------
def og():
    S = 4
    p = Pix(300, 158)
    sky(p, 22)
    strata(p, 23)
    # dark panel on the right for the words
    px0, py0, pw, ph = 112, 30, 176, 112
    p.rect(px0 - 1, py0 - 1, pw + 2, ph + 2, INK)
    p.rect(px0, py0, pw, ph, (0x3A, 0x22, 0x56))
    p.rect(px0, py0, pw, 1, (0x56, 0x35, 0x85))
    # a tunnel down to the miner on the left
    for y in range(20, 158):
        cx = 52 + int(math.sin(y / 18) * 6)
        for dx in range(-18, 19):
            p.put(cx + dx, y, INK if abs(dx) >= 17 else (0x2A, 0x16, 0x40))
    # miner and pickaxe, from the game sprites
    mx, my = 30, 70
    p.stamp(PICK, MPAL, mx + 17, my + 4)
    p.stamp(BODY, MPAL, mx, my)
    # treasures in the dirt
    for name, x, y in [("copper", 12, 40), ("gold", 84, 56), ("diamond", 10, 112), ("platinum", 84, 128)]:
        p.stamp(gem(name), gempal(name), x, y)
    sc = 4
    logo(p, px0 + (pw - logo_width(sc)) // 2, py0 + 12, sc)
    img = p.up(S)
    d = ImageDraw.Draw(img)
    big, small = font(76), font(44)
    cx = (px0 + pw / 2) * S
    d.text((cx, (py0 + 62) * S), "Dig deep.", font=big, fill=(0x35, 0xC7, 0x59), anchor="mm")
    d.text((cx, (py0 + 82) * S), "A daily knowledge dig in three levels.", font=small, fill=(0xFF, 0xF4, 0xDC), anchor="mm")
    d.text((cx, (py0 + 96) * S), "The rarer the answer, the more it's worth.", font=small, fill=(0xCD, 0xB6, 0x8B), anchor="mm")
    img = img.crop((0, 0, 1200, 630))
    img.save(ROOT / "public/og.png", optimize=True)
    return img.size


# ---- app icon: the miner's head on a strata background --------------------
def icon(size, safe=1.0):
    n = 40  # art pixels across
    p = Pix(n, n, (0x3A, 0x22, 0x56))
    strata(p, 24, seed=7)
    # head and shoulders: top 17 rows of the sprite, centred
    head = BODY[:17]
    w = max(len(r) for r in head)
    p.stamp(head, MPAL, (n - w) // 2, 6)
    img = p.up(math.ceil(size / n)).resize((size, size), Image.NEAREST)
    if safe < 1.0:
        # maskable icons get cropped to a circle; keep the art inside the safe zone
        inner = img.resize((int(size * safe), int(size * safe)), Image.NEAREST)
        out = Image.new("RGB", (size, size), (0x3A, 0x22, 0x56))
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
