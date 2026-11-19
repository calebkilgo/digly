"""Discord welcome card backgrounds, drawn from the game's own art.

  python scripts/make_welcome.py

Writes public/discord/welcome.png (with WELCOME TO DIGLY baked in) and
welcome-plain.png (scene only), both 1100x500, the size welcome bots expect.
The middle is left open for the bot's avatar circle and the member's name.
"""

from PIL import ImageDraw

from make_brand import BODY, INK, ROOT, Pix, _woff2, dirt, gem, gempal, logo, logo_width, miner, moon, night_sky, pine

S = 4  # screen pixels per art pixel
W, H = 275, 125
GROUND = 106


def scene():
    p = Pix(W, H)
    night_sky(p, GROUND, seed=7)
    moon(p, 44, 12, 13)
    # mountain on the right: a ledge for the miner, then the face off the top
    foot, ledge_l, ledge_r, ledge_h = 196, 212, 240, 22
    for x in range(foot, W):
        if x < ledge_l:
            t = (x - foot) / (ledge_l - foot)
            h = round(ledge_h * t * t * (3 - 2 * t))
        elif x < ledge_r:
            h = ledge_h
        else:
            h = min(GROUND, ledge_h + round((x - ledge_r) * 1.6 + ((x - ledge_r) / 14) ** 2.2))
        for y in range(GROUND - h, GROUND):
            p.put(x, y, (0x76, 0x68, 0x8A))
        if h:
            p.put(x, GROUND - h, INK)
            for b in range(GROUND - h + 8, GROUND, 9):
                if (x + b) % 23:
                    p.put(x, b, (0x46, 0x3A, 0x5A))
        if h > 80 and GROUND - h < 12:
            for y in range(GROUND - h, min(GROUND, GROUND - h + 4)):
                p.put(x, y, (0xF6, 0xEB, 0xD9))
    p.rect(ledge_l, GROUND - ledge_h, ledge_r - ledge_l, 1, (0x8A, 0x6A, 0x4A))
    miner(p, 220, GROUND - ledge_h - len(BODY))
    # grass and pines on the open ground
    for x in range(foot):
        p.rect(x, GROUND - 2, 1, 2, (0x4E, 0x9A, 0x3A))
        if x % 3 == 0:
            p.put(x, GROUND - 3, (0x5F, 0xB2, 0x47))
    for cx, h in [(8, 30), (21, 38), (35, 27), (180, 24)]:
        pine(p, cx, GROUND, h)
    dirt(p, GROUND)
    for name, x, y in [("copper", 30, 112), ("gold", 92, 115), ("diamond", 150, 111), ("ruby", 205, 114), ("platinum", 252, 110)]:
        p.stamp(gem(name), gempal(name), x, y)
    return p


def main():
    out = ROOT / "public/discord"
    out.mkdir(exist_ok=True)
    p = scene()
    p.up(S).save(out / "welcome-plain.png", optimize=True)

    sc = 3
    logo(p, (W - logo_width(sc)) // 2, 15, sc)
    img = p.up(S)
    d = ImageDraw.Draw(img)
    d.text((W * S / 2, 8 * S), "WELCOME TO", font=_woff2("silkscreen-400.woff2", 32), fill=(0xFF, 0xF4, 0xDC), anchor="mm", stroke_width=2, stroke_fill=INK)
    img.save(out / "welcome.png", optimize=True)
    return img.size


if __name__ == "__main__":
    print(main())
