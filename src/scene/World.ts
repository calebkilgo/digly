import { Container, Graphics } from "pixi.js";
import { drawPixelText, textWidth } from "./pixelFont";
import { EGGS_BY_LEVEL, drawEgg, eggSize } from "./eggs";
import { LEVELS } from "../game/rules/levels";
import { CAVE, CRYSTALS, INK, STRATA } from "./palette";
import { lw, PX } from "./palette";
import { clamp, hash, mulberry32 } from "./rng";

const BAND_TOP0 = -900;
const TILE = 512;
const TUNNEL_W = 128;

interface Band {
  i: number;
  top: number;
  bottom: number;
  g?: Graphics;
}

function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// Rock color follows real depth so each level has its own look:
// level 1 browns, level 2 reds and magentas, level 3 violets and blues.
const ZONE_EDGES_M = [30, 60, 85, 110, 140, 170, 200];

export function zoneForMeters(m: number) {
  let z = 0;
  while (z < ZONE_EDGES_M.length && m >= ZONE_EDGES_M[z]) z++;
  return z;
}

export function bandPalette(i: number, meters: number) {
  const k = clamp(zoneForMeters(meters), 0, STRATA.length - 1);
  const p = STRATA[k];
  if (i % 2 === 0) return p;
  const n = STRATA[Math.min(STRATA.length - 1, k + 1)];
  return { base: mix(p.base, n.base, 0.3), shade: mix(p.shade, n.shade, 0.3), fleck: mix(p.fleck, n.fleck, 0.3) };
}

// The cross-section: strata bands (1x), the carved tunnel, back-wall detail
// seen through the tunnel (slower, so it reads as further away) and a few
// foreground rocks at the screen edges (faster, closer).
export class World {
  readonly strata = new Container(); // world space
  readonly tunnel = new Graphics(); // world space
  readonly tunnelMask = new Graphics(); // world space, masks the back wall
  readonly back = new Container(); // parallax 0.5
  readonly near = new Container(); // parallax 1.35
  readonly lantern = new Graphics();
  readonly sky = new Graphics(); // world space, drawn over the strata above the surface
  readonly ruler = new Container(); // world space: depth ticks and level lines
  private rulerTiles = new Map<number, Container>();

  private bands: Band[] = [];
  private backTiles = new Map<number, Graphics>();
  private nearTiles = new Map<number, Graphics>();
  private path: { x: number; y: number }[] = [];
  private width = 800;
  private seed: number;
  homeX = 400;
  k = 1; // world scale, follows Digly's size on screen
  private discovery?: { x: number; y: number; rx: number; ry: number };
  private lanternT = 0;

  constructor(seed: number) {
    this.seed = seed;
    const rnd = mulberry32(hash(seed, 7));
    let y = BAND_TOP0;
    for (let i = 0; i < 80; i++) {
      const h = 170 + rnd() * 120;
      this.bands.push({ i, top: y, bottom: y + h });
      y += h;
    }
    this.back.mask = this.tunnelMask;
  }

  resize(width: number, focusX = 0.5) {
    this.width = width;
    this.homeX = width * focusX;
    for (const b of this.bands) {
      b.g?.destroy();
      b.g = undefined;
    }
    for (const t of this.backTiles.values()) t.destroy();
    for (const t of this.nearTiles.values()) t.destroy();
    for (const t of this.rulerTiles.values()) t.destroy({ children: true });
    this.backTiles.clear();
    this.nearTiles.clear();
    this.rulerTiles.clear();
    // keep the path's horizontal shape proportional to the new width
    this.redrawTunnel();
    this.redrawSky();
  }

  // ground level, in world pixels: the floor his boots stand on at home
  get surfaceY() {
    return Math.round(96 * this.k);
  }

  // the mountain he tunnels into, and the tunnel's mouth and back end
  private get mountain() {
    const k = this.k;
    const hx = this.homeX;
    return { left: hx - 180 * k, peak: hx + 160 * k, right: hx + 560 * k, height: 340 * k, mouth: hx - 70 * k, back: hx + 70 * k, tunnelH: 128 * k };
  }

  // Mountain height above the surface at x (0 off the mountain). It rises
  // as a cut cliff at the tunnel mouth, with a low foothill in front of it.
  private mountainAt(x: number) {
    const m = this.mountain;
    const k = this.k;
    const cliff = m.tunnelH + 26 * k;
    let h = 0;
    if (x < m.mouth) {
      const foot = m.mouth - 110 * k;
      h = x > foot ? ((x - foot) / (m.mouth - foot)) * 46 * k : 0;
    } else if (x < m.peak) {
      h = cliff + ((x - m.mouth) / (m.peak - m.mouth)) * (m.height - cliff);
    } else if (x < m.right) {
      h = ((m.right - x) / (m.right - m.peak)) * m.height;
    }
    if (h <= 0) return 0;
    // a lumpy ridge so it doesn't read as a perfect triangle
    return Math.max(0, h + Math.sin(x * 0.031) * 5 * k + Math.sin(x * 0.011 + 2) * 10 * k);
  }

  // Night sky, distant hills, grass and the mountain, seen when the home
  // screen zooms out. Three screens wide so it still fills the view zoomed out.
  private redrawSky() {
    const g = this.sky.clear();
    const u = PX;
    const w = this.width;
    const x0 = -w;
    const x1 = 2 * w;
    const sy = this.surfaceY;
    const top = sy - 4000;
    const snap = (v: number) => Math.round(v / u) * u;
    // stepped bands, lighter toward the horizon
    const bands = [0x10162b, 0x151c38, 0x1b2347, 0x232b56, 0x2c3466];
    const bh = 30 * u;
    g.rect(x0, top, x1 - x0, sy - top).fill(bands[0]);
    bands.forEach((c, i) => g.rect(x0, sy - (bands.length - i) * bh, x1 - x0, bh).fill(c));
    // stars
    const r = mulberry32(hash(this.seed, 5));
    for (let i = 0; i < 180; i++) {
      const x = snap(x0 + r() * (x1 - x0));
      const y = snap(sy - 40 * u - r() * 1100);
      const s = r() < 0.15 ? 2 : 1;
      g.rect(x, y, s * u, s * u).fill({ color: 0xf6ebd9, alpha: 0.35 + r() * 0.55 });
    }
    // moon
    const mx = snap(this.homeX - 170 * this.k);
    const my = snap(sy - 330 * this.k);
    const moon = ["..MMM..", ".MMMMm.", "MMMMMmm", "MMMMMmm", "MMMMMmm", ".MMMmm.", "..mmm.."];
    moon.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch !== ".") g.rect(mx + i * 2 * u, my + j * 2 * u, 2 * u, 2 * u).fill(ch === "M" ? 0xfff4d0 : 0xd8cfa8);
      }),
    );
    // distant hills, flat dark silhouettes
    const step = 2 * u;
    for (let x = snap(x0); x < x1; x += step) {
      const h = 50 * this.k + Math.sin(x * 0.006) * 30 * this.k + Math.sin(x * 0.017 + 1) * 14 * this.k;
      g.rect(x, snap(sy - h), step, snap(h)).fill(0x1d2140);
    }
    // grass on the surface
    g.rect(x0, sy - 4 * u, x1 - x0, 4 * u).fill(0x4e9a3a);
    g.rect(x0, sy - u, x1 - x0, u).fill(0x3a7a2c);
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
      const h = [0, 1, 1, 2][Math.floor(r() * 4)];
      if (h) g.rect(x, sy - (4 + h) * u, u, h * u).fill(0x5fb247);
    }
    // the mountain, stepped in pixel columns with an ink edge and a snow cap
    const m = this.mountain;
    const rock = 0x7a6a8a;
    const rockLo = 0x5a4d6e;
    const snow = 0xf6ebd9;
    for (let x = snap(m.left); x < m.right; x += step) {
      const h = snap(this.mountainAt(x + step / 2));
      if (h <= 0) continue;
      const yTop = sy - h;
      g.rect(x, yTop - u, step, h + u).fill(INK);
      g.rect(x, yTop, step, h).fill(x < m.peak ? rock : rockLo);
      const capH = h - (m.height - 70 * this.k);
      if (capH > 0) g.rect(x, yTop, step, snap(Math.min(capH, h))).fill(snow);
    }
    // a few rock seams so it reads as stone
    for (let i = 0; i < 26; i++) {
      const x = snap(m.left + r() * (m.right - m.left));
      const h = this.mountainAt(x);
      if (h < 30 * this.k) continue;
      const y = snap(sy - r() * (h - 12 * this.k));
      g.rect(x, y, snap(4 + r() * 10) * 2, u).fill(0x4a3d5a);
    }
  }

  resetPath() {
    this.path = [];
    this.discovery = undefined;
    this.redrawTunnel();
  }

  setScale(k: number) {
    this.k = k;
    this.redrawTunnel();
    this.redrawSky();
  }

  setDiscovery(d?: { x: number; y: number; rx: number; ry: number }) {
    this.discovery = d;
    this.redrawTunnel();
  }

  // Re-tessellating the tunnel is the priciest thing in the scene, so it only
  // happens when Digly has moved a few pixels. His body hides the gap.
  extendPath(x: number, y: number) {
    const last = this.path[this.path.length - 1];
    if (last && y - last.y < 9 * this.k) return;
    this.path.push({ x, y });
    // keep the polyline short: points far above the camera never show again
    if (this.path.length > 160) this.path.splice(1, this.path.length - 160);
    this.redrawTunnel();
  }

  // pixels per meter of depth
  get ppm() {
    return 16 * this.k;
  }

  bandAt(y: number) {
    const b = this.bands.find((q) => y >= q.top && y < q.bottom) ?? this.bands[this.bands.length - 1];
    return bandPalette(b.i, b.top / this.ppm);
  }

  // ---- streaming ------------------------------------------------------------

  ensure(camTop: number, camBottom: number, camY: number) {
    for (const b of this.bands) {
      const visible = b.bottom + 40 > camTop - 200 && b.top - 40 < camBottom + 200;
      if (visible && !b.g) {
        b.g = this.drawBand(b);
        // later bands must sit above earlier ones so wavy tops overlap correctly
        this.strata.addChildAt(b.g, Math.min(this.strata.children.length, this.bandOrder(b.i)));
      } else if (!visible && b.g) {
        b.g.destroy();
        b.g = undefined;
      }
    }
    this.streamTiles(this.backTiles, this.back, camY * 0.5, camTop, camBottom, (i) => this.drawBackTile(i));
    this.streamRuler(camTop, camBottom);

  }

  private bandOrder(i: number) {
    let n = 0;
    for (const b of this.bands) if (b.g && b.i < i) n++;
    return n;
  }

  private streamTiles(
    map: Map<number, Graphics>,
    layer: Container,
    layerCam: number,
    camTop: number,
    camBottom: number,
    draw: (i: number) => Graphics,
  ) {
    const span = camBottom - camTop;
    const top = layerCam - span / 2 - TILE;
    const bot = layerCam + span / 2 + TILE;
    const i0 = Math.floor(top / TILE);
    const i1 = Math.floor(bot / TILE);
    for (const [i, g] of map) {
      if (i < i0 || i > i1) {
        g.destroy();
        map.delete(i);
      }
    }
    for (let i = i0; i <= i1; i++) {
      if (!map.has(i)) {
        const g = draw(i);
        g.y = i * TILE;
        layer.addChild(g);
        map.set(i, g);
      }
    }
  }

  // ---- drawing --------------------------------------------------------------

  private wave(b: Band, x: number) {
    const r = mulberry32(hash(this.seed, b.i, 3));
    const p1 = r() * 6.28, p2 = r() * 6.28, f1 = 0.006 + r() * 0.006, f2 = 0.02 + r() * 0.02;
    return b.top + Math.sin(x * f1 + p1) * 12 + Math.sin(x * f2 + p2) * 4;
  }

  private drawBand(b: Band): Graphics {
    const g = new Graphics();
    const pal = bandPalette(b.i, b.top / this.ppm);
    // three screens wide, so the home screen can zoom out without gaps
    const L = -this.width;
    const w = this.width * 3;
    const R = L + w;
    const randX = (r: () => number) => L + r() * w;
    const pts: number[] = [];
    for (let x = L - 40; x <= R + 40; x += 16) pts.push(x, this.wave(b, x));
    const bottom = b.bottom + 60;
    g.poly([...pts, R + 40, bottom, L - 40, bottom]).fill(pal.base);
    // shaded lip under each boundary
    const lip: number[] = [];
    for (let x = L - 40; x <= R + 40; x += 16) lip.push(x, this.wave(b, x));
    for (let x = R + 40; x >= L - 40; x -= 16) lip.push(x, this.wave(b, x) + 7 + Math.sin(x * 0.05) * 2);
    g.poly(lip).fill(pal.shade);
    g.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
    g.stroke({ width: lw(), color: INK, alpha: 0.55 });

    const r = mulberry32(hash(this.seed, b.i, 11));
    const h = b.bottom - b.top;
    // flecks
    const flecks = Math.floor((w * h) / 2600);
    for (let k = 0; k < flecks; k++) {
      g.circle(randX(r), b.top + 14 + r() * (h - 10), 1 + r() * 1.6).fill({ color: pal.fleck, alpha: 0.8 });
    }
    // embedded stones
    const stones = Math.floor((w * h) / 26000) + 1;
    for (let k = 0; k < stones; k++) {
      const x = randX(r);
      const y = b.top + 26 + r() * (h - 30);
      const rx = 7 + r() * 16;
      const ry = rx * (0.55 + r() * 0.3);
      const rot = (r() - 0.5) * 0.8;
      const pts2: number[] = [];
      const n = 7;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        const jit = 0.82 + r() * 0.3;
        const px = Math.cos(a) * rx * jit, py = Math.sin(a) * ry * jit;
        pts2.push(x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot));
      }
      g.poly(pts2).fill(pal.shade).stroke({ width: lw(), color: INK, alpha: 0.8 });
      g.circle(x - rx * 0.3, y - ry * 0.3, Math.max(1.5, rx * 0.18)).fill({ color: pal.fleck, alpha: 0.9 });
    }
    // roots near the surface, fossils mid-depth, crystals deep down
    const meters = b.top / this.ppm;
    if (meters < 30) {
      const roots = 6 + Math.floor(r() * 9);
      for (let k = 0; k < roots; k++) {
        let x = randX(r), y = b.top + 4;
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          x += (r() - 0.5) * 22;
          y += 10 + r() * 12;
          g.lineTo(x, y);
        }
        g.stroke({ width: lw(), color: 0x3a2417, cap: "round", join: "round" });
      }
    }
    if (meters >= 60 && meters < 140 && r() < 0.6) {
      const x = randX(r), y = b.top + 40 + r() * (h - 60), s = 6 + r() * 4;
      g.moveTo(x, y);
      for (let a = 0; a < Math.PI * 5; a += 0.3) g.lineTo(x + Math.cos(a) * a * s * 0.18, y + Math.sin(a) * a * s * 0.18);
      g.stroke({ width: lw(), color: pal.fleck, alpha: 0.9 });
    }
    if (meters >= 100) {
      const clusters = 3 + Math.floor(r() * (meters >= 140 ? 12 : 6));
      for (let k = 0; k < clusters; k++) this.crystalCluster(g, randX(r), b.top + 30 + r() * (h - 40), CRYSTALS[Math.floor(r() * CRYSTALS.length)], r);
    }
    this.placeEgg(g, b, meters, r);
    return g;
  }

  // Something buried in this band, off to the side of the tunnel and clear of
  // the depth ruler. Older, stranger finds the deeper you go.
  private placeEgg(g: Graphics, b: Band, meters: number, r: () => number) {
    if (meters < 3 || r() > 0.62) return;
    const lv = meters < 60 ? 0 : meters < 140 ? 1 : 2;
    const set = EGGS_BY_LEVEL[lv];
    const egg = set[Math.floor(r() * set.length)];
    const u = PX;
    const { w: ew, h: eh } = eggSize(egg);
    const pw = ew * u;
    const ph = eh * u;
    const clear = 190 * this.k; // tunnel wiggle plus half its width
    const regions: [number, number][] = [];
    const leftMin = 26 * u; // past the ruler labels
    if (this.homeX - clear - pw > leftMin) regions.push([leftMin, this.homeX - clear - pw]);
    if (this.width - 6 * u - pw > this.homeX + clear) regions.push([this.homeX + clear, this.width - 6 * u - pw]);
    if (!regions.length) return;
    const [x0, x1] = regions[Math.floor(r() * regions.length)];
    const h = b.bottom - b.top;
    if (h < ph + 40) return;
    const x = Math.round((x0 + r() * (x1 - x0)) / u) * u;
    const y = Math.round((b.top + 24 + r() * (h - ph - 36)) / u) * u;
    drawEgg(g, egg, x, y, u);
  }

  crystalCluster(g: Graphics, x: number, y: number, color: number, r: () => number) {
    const n = 3 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.45 + (r() - 0.5) * 0.2;
      const len = 14 + r() * 14;
      const wd = 5 + r() * 2.5;
      const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len;
      const nx = Math.cos(a + Math.PI / 2) * wd, ny = Math.sin(a + Math.PI / 2) * wd;
      const mx = x + Math.cos(a) * len * 0.7, my = y + Math.sin(a) * len * 0.7;
      g.poly([x - nx, y - ny, mx - nx, my - ny, tx, ty, mx + nx, my + ny, x + nx, y + ny]).fill(color).stroke({ width: lw(), color: INK, join: "round" });
      g.poly([x, y, mx, my, tx, ty, mx + nx * 0.9, my + ny * 0.9, x + nx * 0.9, y + ny * 0.9]).fill({ color: 0x000000, alpha: 0.18 });
      g.moveTo(x - nx * 0.4, y - ny * 0.4).lineTo(mx - nx * 0.4, my - ny * 0.4).stroke({ width: lw(), color: 0xffffff, alpha: 0.6 });
    }
  }

  // Depth ruler down the left edge (a tick every 5 m, a label every 25 m)
  // and a marked line where each level begins.
  private streamRuler(camTop: number, camBottom: number) {
    const seg = 25 * this.ppm;
    const i0 = Math.max(0, Math.floor((camTop - seg) / seg));
    const i1 = Math.floor((camBottom + seg) / seg);
    for (const [i, c] of this.rulerTiles) {
      if (i < i0 || i > i1) {
        c.destroy({ children: true });
        this.rulerTiles.delete(i);
      }
    }
    for (let i = i0; i <= i1; i++) {
      if (this.rulerTiles.has(i)) continue;
      const c = this.drawRulerTile(i);
      this.ruler.addChild(c);
      this.rulerTiles.set(i, c);
    }
  }

  private drawRulerTile(i: number): Container {
    const c = new Container();
    const g = new Graphics();
    const ppm = this.ppm;
    const u = PX;
    for (let m = i * 25; m < (i + 1) * 25; m += 5) {
      const y = Math.round((m * ppm) / u) * u;
      const major = m % 25 === 0;
      g.rect(0, y - u, (major ? 8 : 4) * u, u * 3).fill(INK);
      g.rect(0, y, (major ? 7 : 3) * u, u).fill(0xfff4dc);
      if (major && m > 0) drawPixelText(g, `${m}M`, 10 * u, y - 2 * u, 1, u, 0xfff4dc, INK);
    }
    for (const lv of LEVELS) {
      if (lv.startM <= 0 || lv.startM < i * 25 || lv.startM >= (i + 1) * 25) continue;
      const y = Math.round((lv.startM * ppm) / u) * u;
      for (let x = 0; x < this.width; x += 8 * u) g.rect(x, y - u, 5 * u, u * 2).fill(0xfff4dc);
      const text = `LEVEL ${lv.n} x${lv.mult}`;
      drawPixelText(g, text, this.width - textWidth(text, 1) * u - 8 * u, y - 8 * u, 1, u, 0xffc928, INK);
    }
    c.addChild(g);
    return c;
  }

  private drawBackTile(i: number): Graphics {
    const g = new Graphics();
    const r = mulberry32(hash(this.seed, i, 99));
    const w = this.width;
    g.rect(-40, 0, w + 80, TILE).fill(CAVE.back);
    for (let k = 0; k < 30; k++) {
      const x = r() * w, y = r() * TILE, rx = 6 + r() * 26;
      g.ellipse(x, y, rx, rx * (0.4 + r() * 0.3)).fill(CAVE.backDetail);
    }
    for (let k = 0; k < 3; k++) {
      let x = r() * w, y = r() * TILE;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.3) * 30;
        g.lineTo(x, y);
      }
      g.stroke({ width: lw(), color: 0x3a2c33, cap: "round" });
    }
    return g;
  }

  private drawNearTile(i: number): Graphics {
    const g = new Graphics();
    const r = mulberry32(hash(this.seed, i, 41));
    const w = this.width;
    const edge = Math.max(28, Math.min(90, w * 0.08));
    for (const side of [0, 1]) {
      if (r() < 0.35) continue;
      const y = r() * TILE;
      const s = 30 + r() * 50;
      const x0 = side === 0 ? -s * 0.4 : w + s * 0.4;
      const pts: number[] = [];
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const jit = 0.75 + r() * 0.4;
        pts.push(x0 + Math.cos(a) * s * jit * (edge / 70), y + Math.sin(a) * s * jit);
      }
      g.poly(pts).fill(0x3a2519).stroke({ width: lw(), color: INK });
      const hx = x0 + (side === 0 ? s * 0.25 : -s * 0.25);
      g.moveTo(hx - s * 0.2, y - s * 0.45).quadraticCurveTo(hx, y - s * 0.62, hx + s * 0.2, y - s * 0.45).stroke({ width: lw(), color: 0x5a3a27, cap: "round" });
      g.circle(hx, y + s * 0.1, 2.5).fill(0x5a3a27);
    }
    return g;
  }

  private redrawTunnel() {
    const t = this.tunnel.clear();
    const m = this.tunnelMask.clear();
    const hx = this.homeX;
    const k = this.k;
    const d = this.discovery;
    // the horizontal tunnel into the mountain where Digly starts
    const mt = this.mountain;
    const sy = this.surfaceY;
    const chamber = (gr: Graphics, grow: number, color: number) => {
      gr.roundRect(mt.mouth - grow, sy - mt.tunnelH - grow, mt.back - mt.mouth + grow * 2, mt.tunnelH + 8 * k + grow * 2, 18 * k).fill(color);
      if (d) {
        gr.ellipse(d.x, d.y, d.rx + grow, d.ry + grow).fill(color);
      }
    };
    chamber(t, 9, CAVE.rim);
    chamber(t, 0, CAVE.back);
    chamber(m, 0, 0xffffff);
    if (this.path.length) {
      const pts = [{ x: hx, y: sy }, ...this.path];
      for (const [gr, wdt, col] of [
        [t, TUNNEL_W * k + 18, CAVE.rim],
        [t, TUNNEL_W * k, CAVE.back],
        [m, TUNNEL_W * k, 0xffffff],
      ] as const) {
        gr.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) gr.lineTo(p.x, p.y);
        gr.stroke({ width: wdt, color: col, cap: "round", join: "round" });
      }
    }
    // timber supports along the tunnel, and a frame around its mouth
    const u = PX;
    const wood = 0x8a5a2b;
    const woodLo = 0x5e3a18;
    const frame = (x: number, big: boolean) => {
      const pw = (big ? 4 : 3) * u;
      const ph = mt.tunnelH + (big ? 4 * u : -2 * u);
      const top = sy - ph;
      t.rect(x - u, top - u, pw + 2 * u, ph + u).fill(INK);
      t.rect(x, top, pw, ph).fill(big ? wood : woodLo);
      return { top, pw };
    };
    for (let x = mt.mouth + 34 * k; x < mt.back - 20 * k; x += 46 * k) frame(Math.round(x / u) * u, false);
    const f = frame(Math.round((mt.mouth - 2 * u) / u) * u, true);
    t.rect(mt.mouth - 6 * u, f.top - 5 * u, 16 * u, 6 * u).fill(INK);
    t.rect(mt.mouth - 5 * u, f.top - 4 * u, 14 * u, 4 * u).fill(wood);
    t.rect(mt.mouth - 5 * u, f.top - u, 14 * u, u).fill(woodLo);
    // the floor where Digly parks
    t.ellipse(hx, sy, 60 * k, 8 * k).fill({ color: CAVE.rim, alpha: 0.6 });
    if (d) t.ellipse(d.x, d.y + d.ry * 0.82, d.rx * 0.9, d.ry * 0.14).fill({ color: CAVE.rim, alpha: 0.6 });
  }

  // Lantern hanging in the home chamber. Swings a little.
  updateLantern(dt: number, visible: boolean) {
    // drawn at fixed pixel size; the chamber scales around it
    this.lanternT += dt;
    const g = this.lantern.clear();
    if (!visible) return;
    const k = this.k;
    const x = this.homeX + 44 * k;
    const top = this.surfaceY - 124 * k;
    const sw = Math.sin(this.lanternT * 1.3) * 0.08;
    const len = 46 * k;
    const lx = x + Math.sin(sw) * len;
    const ly = top + Math.cos(sw) * len;
    g.moveTo(x, top - 30).lineTo(lx, ly).stroke({ width: lw(), color: INK });
    g.ellipse(lx, ly + 70, 60, 10).fill({ color: CAVE.lantern, alpha: 0.07 });
    g.roundRect(lx - 9, ly, 18, 24, 4).fill(CAVE.lantern).stroke({ width: lw(), color: INK });
    g.rect(lx - 10, ly - 3, 20, 5).fill(0x3b3236).stroke({ width: lw(), color: INK });
    g.rect(lx - 10, ly + 22, 20, 5).fill(0x3b3236).stroke({ width: lw(), color: INK });
    g.moveTo(lx - 3, ly + 6).lineTo(lx - 3, ly + 18).stroke({ width: lw(), color: 0xfff1c4 });
  }
}
