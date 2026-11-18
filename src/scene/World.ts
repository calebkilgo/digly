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
  readonly sky = new Graphics(); // world space: everything above the ground line, drawn over the tunnel
  readonly rock = new Graphics(); // world space: the mountain, drawn under the tunnel
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
    // the dig path depends on width; rebuild it from the same seed
    this.dig = [];
    this.redrawTunnel();
    this.redrawSky();
  }

  // Digly stands on a ledge partway up the mountain. The ledge is the home
  // floor (world y 96k, where his boots rest); the open ground is below it.
  get floorY() {
    return Math.round(96 * this.k);
  }

  private get ledgeH() {
    return Math.round(170 * this.k);
  }

  get surfaceY() {
    return this.floorY + this.ledgeH;
  }

  private get mountain() {
    const k = this.k;
    const hx = this.homeX;
    const mouth = hx + 46 * k; // the shaft opens at the back of the ledge
    return { foot: hx - 270 * k, ledgeL: hx - 90 * k, mouth, right: mouth + 2600 * k, top: 1500 * k, tunnelH: 120 * k };
  }

  // Mountain height above the open ground at x. A rounded slope climbs from
  // the ground to the ledge, the ledge stays flat to the shaft mouth, then the
  // face rises steeply and keeps climbing off the top of the screen.
  private mountainAt(x: number) {
    const m = this.mountain;
    const k = this.k;
    const H = this.ledgeH;
    let h = 0;
    if (x <= m.foot) h = 0;
    else if (x < m.ledgeL) {
      const t = (x - m.foot) / (m.ledgeL - m.foot);
      h = H * t * t * (3 - 2 * t);
    } else if (x <= m.mouth) h = H;
    else if (x < m.right) {
      const d = x - m.mouth;
      h = H + 130 * k * (1 - Math.exp(-d / (28 * k))) + d * 0.85;
      // far side comes back down off screen
      const back = m.right - x;
      if (back < 700 * k) h = Math.min(h, (back / (700 * k)) * m.top);
      h = Math.min(h, m.top);
    }
    if (h <= 0) return 0;
    const flat = x > m.ledgeL - 10 * k && x < m.mouth + 6 * k;
    return flat ? h : Math.max(0, h + Math.sin(x * 0.029) * 5 * k + Math.sin(x * 0.0093 + 2) * 12 * k);
  }

  // Where Digly is after digging `dist` world pixels. He starts on the ledge,
  // cuts into the mountain, then wanders down through the earth: mostly
  // sideways, sometimes steeper, turning at random and at the edges. The path
  // is generated a step at a time from a seed, so it's the same every frame
  // and different every dig. Nothing is dug until the round starts.
  private digSeed = 1;
  private dig: { x: number; y: number; s: number }[] = [];
  private digState = { a: 0.12, dir: 1 };
  private digRnd: () => number = Math.random;

  newDig(seed: number) {
    this.digSeed = seed;
    this.dig = [];
  }

  digPoint(dist: number): { x: number; y: number } {
    const k = this.k;
    const stepLen = 5 * k;
    if (!this.dig.length) {
      this.dig = [{ x: this.homeX, y: this.floorY, s: 0 }];
      this.digState = { a: 0.12, dir: 1 };
      this.digRnd = mulberry32(hash(this.seed, this.digSeed, 17));
    }
    const r = this.digRnd;
    const m = this.mountain;
    const want = Math.max(0, dist);
    while (this.dig[this.dig.length - 1].s < want) {
      const p = this.dig[this.dig.length - 1];
      const st = this.digState;
      st.a += (r() - 0.5) * 0.4;
      if (r() < 0.04) st.a = 0.05 + r() * 0.75; // a sudden steeper or flatter run
      if (r() < 0.02) st.dir = -st.dir; // turn around for no reason
      st.a = clamp(st.a, 0.04, 0.85);
      const deep = p.y > this.surfaceY + 90 * k;
      const left = deep ? this.homeX - Math.min(this.width * 0.4, 380 * k) : m.mouth + 50 * k;
      const right = this.homeX + Math.min(this.width * 0.45, 460 * k);
      if (p.s < 110 * k) {
        // first stretch: straight into the mountain
        st.dir = 1;
        st.a = Math.min(st.a, 0.22);
      }
      if (p.x >= right) st.dir = -1;
      if (p.x <= left) st.dir = 1;
      this.dig.push({ x: p.x + st.dir * Math.cos(st.a) * stepLen, y: p.y + Math.sin(st.a) * stepLen, s: p.s + stepLen });
    }
    // interpolate between the two steps around `want`
    let lo = 0;
    let hi = this.dig.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.dig[mid].s <= want) lo = mid;
      else hi = mid;
    }
    const a = this.dig[lo];
    const b = this.dig[hi];
    const t = b.s > a.s ? (want - a.s) / (b.s - a.s) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // Two layers. `rock` is the mountain itself, drawn under the tunnel so
  // digging cuts into it. `sky` is everything above the ground line (sky,
  // stars, moon, hills, grass, trees) and is drawn over the tunnel, so a
  // tunnel can never bite into the sky. Three screens wide for the zoom-out.
  private redrawSky() {
    const g = this.sky.clear();
    const rk = this.rock.clear();
    const u = PX;
    const w = this.width;
    const k = this.k;
    const x0 = -w;
    const x1 = 2 * w;
    const sy = this.surfaceY;
    const top = sy - 4000;
    const step = 2 * u;
    const snap = (v: number) => Math.round(v / u) * u;
    const m = this.mountain;
    const ground = (x: number) => sy - snap(this.mountainAt(x + step / 2)); // y of the ground line at a column
    const groundAt = (x: number) => ground(Math.floor(x / step) * step);
    const r = mulberry32(hash(this.seed, 5));

    // ---- the mountain (under the tunnel) ----
    const rock = 0x76688a;
    const rockLo = 0x5f5276;
    const seam = 0x463a5a;
    const snow = 0xf6ebd9;
    const snowLine = 820 * k;
    const col = (v: number) => Math.floor(v / step) * step; // same column grid for rock and sky
    for (let x = col(m.foot); x < m.right; x += step) {
      const hRaw = this.mountainAt(x + step / 2);
      const h = snap(hRaw);
      if (h <= 0) continue;
      const yTop = sy - h;
      rk.rect(x, yTop, step, h).fill(x < m.mouth + 400 * k ? rock : rockLo);
      for (let b = 1; b * 34 * k < h; b++) {
        const yb = snap(sy - b * 34 * k - Math.sin(x * 0.004 + b) * 10 * k);
        if (yb > yTop + 2 * u) rk.rect(x, yb, step, u).fill(seam);
      }
      const capH = hRaw - snowLine + Math.sin(x * 0.07) * 14 * k + Math.sin(x * 0.023) * 10 * k;
      if (capH > 0) rk.rect(x, yTop, step, snap(Math.min(capH, h))).fill(snow);
    }
    rk.rect(snap(m.ledgeL), sy - this.ledgeH, snap(m.mouth - m.ledgeL), 2 * u).fill(0x8a6a4a);
    for (let i = 0; i < 50; i++) {
      const x = snap(m.foot + r() * (m.right - m.foot));
      if (x > m.ledgeL - 20 * k && x < m.mouth + 300 * k) continue;
      const h = this.mountainAt(x);
      if (h < 24 * k || h > snowLine) continue;
      const y = snap(sy - r() * (h - 16 * k));
      const bw = snap((3 + r() * 4) * u);
      rk.rect(x - u, y - u, bw + 2 * u, bw * 0.6 + 2 * u).fill(INK);
      rk.rect(x, y, bw, snap(bw * 0.6)).fill(0x8a7c9c);
      rk.rect(x, y, bw, u).fill(0xa093b0);
    }

    // ---- the sky, column by column down to the ground line (over the tunnel) ----
    const bands = [0x10162b, 0x151c38, 0x1b2347, 0x232b56, 0x2c3466];
    const bh = 30 * u;
    for (let x = col(x0); x < x1; x += step) {
      const gy = ground(x);
      let y = top;
      const cut = (y2: number, c: number) => {
        const b = Math.min(y2, gy);
        if (b > y) g.rect(x, y, step, b - y).fill(c);
        y = Math.max(y, y2);
      };
      cut(sy - bands.length * bh, bands[0]);
      bands.forEach((c, i) => cut(sy - (bands.length - i - 1) * bh, c));
      // distant hills behind everything
      const hh = 50 * k + Math.sin(x * 0.006) * 30 * k + Math.sin(x * 0.017 + 1) * 14 * k;
      const hTop = snap(sy - hh);
      if (hTop < gy) g.rect(x, hTop, step, gy - hTop).fill(0x1d2140);
      // ink edge along the mountain, grass on open ground
      if (gy < sy - 2 * u) g.rect(x, gy - u, step, u).fill(INK);
      else {
        g.rect(x, sy - 4 * u, step, 4 * u).fill(0x4e9a3a);
        g.rect(x, sy - u, step, u).fill(0x3a7a2c);
        const tuft = [0, 1, 1, 2][Math.floor(r() * 4)];
        if (tuft) g.rect(x, sy - (4 + tuft) * u, u, tuft * u).fill(0x5fb247);
      }
    }
    // stars and moon, only where there's sky
    for (let i = 0; i < 180; i++) {
      const x = snap(x0 + r() * (x1 - x0));
      const y = snap(sy - 40 * u - r() * 1100);
      if (y >= groundAt(x) - 2 * u) continue;
      const s2 = r() < 0.15 ? 2 : 1;
      g.rect(x, y, s2 * u, s2 * u).fill({ color: 0xf6ebd9, alpha: 0.35 + r() * 0.55 });
    }
    // the moon, in tonight's real phase (lit on the right while waxing, as seen from North America)
    const N = 13;
    const R = N / 2;
    const mu = 2 * u;
    // phones have the logo and tagline up there, so the moon sits a little lower and closer in
    const narrow = w < 600;
    const mx = snap(this.homeX - (narrow ? 150 : 240) * k);
    const my = snap(sy - (narrow ? 430 : 620) * k);
    const phase = moonPhase(Date.now());
    const c = Math.cos(2 * Math.PI * phase);
    const craters = new Set(["4,3", "5,3", "8,5", "3,7", "4,7", "7,9", "8,9", "9,8", "6,6"]);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5 - R) / R;
        const y = (j + 0.5 - R) / R;
        if (x * x + y * y > 1) continue;
        const edge = Math.sqrt(1 - y * y) * c;
        const lit = phase < 0.5 ? x > edge : x < -edge;
        const px = mx + i * mu;
        const py = my + j * mu;
        if (py >= groundAt(px)) continue;
        if (lit) g.rect(px, py, mu, mu).fill(craters.has(`${i},${j}`) ? 0xe2d7ad : 0xfff4d0);
        else g.rect(px, py, mu, mu).fill({ color: 0x3a4166, alpha: 0.85 });
      }
    }
    // pine trees on the ground and lower slope, sized against the miner (27 px tall)
    const pine = (x: number, base: number, height: number) => {
      const cx = snap(x);
      const trunk = 6;
      const crown = Math.round(height) - trunk;
      const tiers = crown > 40 ? 4 : 3;
      const th = crown / tiers;
      g.rect(cx - 2 * u, snap(base - trunk * u), 4 * u, trunk * u).fill(0x4a2e14);
      g.rect(cx, snap(base - trunk * u), 2 * u, trunk * u).fill(0x5e3a18);
      for (let row = 0; row < crown; row++) {
        const t = Math.min(tiers - 1, Math.floor(row / th));
        const local = row - t * th;
        const half = Math.max(1, Math.round(1 + t * 2.2 + local * 0.75));
        const y = snap(base - (trunk + crown - row) * u);
        g.rect(cx - half * u - u, y, half * 2 * u + 2 * u, u).fill(0x183a22); // dark edge
        g.rect(cx - half * u, y, half * 2 * u, u).fill(0x245a30);
        g.rect(cx - half * u, y, Math.max(1, Math.round(half * 0.8)) * u, u).fill(local < 1.5 && t > 0 ? 0x245a30 : 0x2f6b3a); // moonlit side
      }
    };
    // Placed from the mountain outward with their own random numbers, so the
    // same trees appear in the same spots at every screen size and on every load.
    const tr = mulberry32(hash(this.seed, 9));
    const cartL = m.foot - 60 * k - 18 * k;
    const cartR = m.foot - 60 * k + 22 * u + 18 * k;
    for (let x = m.ledgeL - 50 * k; x > x0; x -= (55 + tr() * 45) * k) {
      const h = 34 + tr() * 18;
      if (x > cartL && x < cartR) continue; // keep the cart clear
      pine(x, sy - this.mountainAt(x) + 2 * u, h);
    }
    // a mine cart on the ground at the foot of the slope
    const cx = snap(m.foot - 60 * k);
    const cw = 22 * u;
    const ch = 10 * u;
    g.rect(snap(m.foot - 160 * k), sy - 2 * u, snap(150 * k), u).fill(0xb8c4d3);
    g.rect(cx - u, sy - ch - 5 * u, cw + 2 * u, ch + 2 * u).fill(INK);
    g.rect(cx, sy - ch - 4 * u, cw, ch).fill(0x6b6f80);
    g.rect(cx, sy - ch - 4 * u, cw, 2 * u).fill(0x9aa0b4);
    for (const gx of [cx + 3 * u, cx + cw - 7 * u]) {
      g.rect(gx - u, sy - 5 * u, 6 * u, 5 * u).fill(INK);
      g.rect(gx, sy - 4 * u, 4 * u, 3 * u).fill(0x3a3e4e);
    }
    for (let i = 0; i < 6; i++) g.rect(cx + (2 + i * 3) * u, sy - ch - (6 + (i % 2)) * u, 3 * u, 3 * u).fill(i % 3 === 0 ? 0xffc928 : 0x8a7c9c);
  }

  resetPath() {
    this.path = [];
    this.discovery = undefined;
    this.newDig(Math.floor(Math.random() * 1e9));
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
    if (last && Math.hypot(x - last.x, y - last.y) < 9 * this.k) return;
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
    // nothing is dug at home: only the path Digly has cut, and the cavern
    // he reveals gems in
    const chamber = (gr: Graphics, grow: number, color: number) => {
      if (d) gr.ellipse(d.x, d.y, d.rx + grow, d.ry + grow).fill(color);
    };
    chamber(t, 9, CAVE.rim);
    chamber(t, 0, CAVE.back);
    chamber(m, 0, 0xffffff);
    if (this.path.length) {
      const pts = this.path;
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
    if (d) t.ellipse(d.x, d.y + d.ry * 0.82, d.rx * 0.9, d.ry * 0.14).fill({ color: CAVE.rim, alpha: 0.6 });
  }

  // The old home chamber had a hanging lantern. The ledge doesn't, so this
  // just keeps the layer empty.
  updateLantern(_dt: number, _visible: boolean) {
    this.lantern.clear();
  }

}

// Where the moon is in its cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter.
// Counted from the new moon of 6 Jan 2000, 18:14 UTC.
export function moonPhase(now: number) {
  const days = (now - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  const p = (days / 29.530588853) % 1;
  return p < 0 ? p + 1 : p;
}
