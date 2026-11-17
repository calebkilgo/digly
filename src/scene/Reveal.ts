import { Container, Graphics } from "pixi.js";
import { GEM, INK, ROCK } from "./palette";
import { lw } from "./palette";
import { easeOutBack, easeOutCubic, hash, mulberry32 } from "./rng";

export interface RevealSlot {
  tier: keyof typeof GEM | null; // null = empty slot (fewer than 3 finds)
}

// One boulder that splits along a zigzag seam to expose a gem.
class Rock {
  readonly root = new Container();
  private left = new Graphics();
  private right = new Graphics();
  private crack = new Graphics();
  readonly gem = new Container();
  private gemG = new Graphics();
  private seam: number[] = [];
  private shape: number[] = [];
  crackP = 0;
  split = 0; // 0..1
  shakeAmt = 0;
  dropP = 0; // 0..1 landing
  gemP = 0;
  private t = 0;

  constructor(readonly slot: RevealSlot, seed: number, readonly size: number) {
    const r = mulberry32(seed);
    const s = size;
    const wide = 0.86 + r() * 0.3; // each boulder gets its own proportions
    const tall = 0.9 + r() * 0.22;
    // seam from top to bottom
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const y = (-s * 0.62 + (k / n) * s * 1.18) * tall;
      const x = k === 0 || k === n ? (r() - 0.5) * 6 : (k % 2 ? 1 : -1) * (5 + r() * 7);
      this.seam.push(x, y);
    }
    // left and right outline points, top to bottom
    const sideL: number[] = [];
    const sideR: number[] = [];
    const m = 5;
    for (let k = 1; k < m; k++) {
      const a = -Math.PI / 2 + (k / m) * Math.PI;
      const jl = 0.78 + r() * 0.34;
      const jr = 0.78 + r() * 0.34;
      sideL.push(-Math.cos(a) * s * 0.66 * jl * wide, Math.sin(a) * s * 0.56 * jl * tall);
      sideR.push(Math.cos(a) * s * 0.66 * jr * wide, Math.sin(a) * s * 0.56 * jr * tall);
    }
    const top = [this.seam[0], this.seam[1]];
    const bot = [this.seam[this.seam.length - 2], this.seam[this.seam.length - 1]];
    const seamRev: number[] = [];
    for (let k = this.seam.length - 2; k >= 0; k -= 2) seamRev.push(this.seam[k], this.seam[k + 1]);
    const leftPoly = [...top, ...sideL, ...bot, ...seamRev.slice(2, -2)];
    const rightPoly = [...top, ...this.seam.slice(2, -2), ...bot];
    for (let k = sideR.length - 2; k >= 0; k -= 2) rightPoly.push(sideR[k], sideR[k + 1]);
    this.shape = [...top, ...sideR, ...bot];
    void this.shape;

    this.drawHalf(this.left, leftPoly, ROCK.base, ROCK.light, -1);
    this.drawHalf(this.right, rightPoly, ROCK.shade, ROCK.base, 1);
    this.drawGem();
    this.gem.addChild(this.gemG);
    this.gem.scale.set(0);
    this.root.addChild(this.gem, this.left, this.right, this.crack);
  }

  private drawHalf(g: Graphics, poly: number[], base: number, accent: number, side: number) {
    g.poly(poly).fill(base);
    // a couple of facets and pits for texture
    const s = this.size;
    if (side < 0) {
      g.poly([-s * 0.5, -s * 0.18, -s * 0.22, -s * 0.42, -s * 0.12, -s * 0.2, -s * 0.38, -s * 0.02]).fill(accent);
      g.circle(-s * 0.36, s * 0.22, s * 0.05).fill(ROCK.shade);
    } else {
      g.circle(s * 0.3, -s * 0.12, s * 0.045).fill(ROCK.shade);
      g.circle(s * 0.24, s * 0.26, s * 0.06).fill({ color: 0x000000, alpha: 0.15 });
    }
    g.poly(poly).stroke({ width: lw(), color: INK, join: "round" });
  }

  private drawGem() {
    const g = this.gemG.clear();
    const s = this.size * 0.42;
    const tier = this.slot.tier;
    if (!tier) {
      g.ellipse(0, 4, s * 0.7, s * 0.28).fill({ color: 0x000000, alpha: 0.25 });
      return;
    }
    const c = GEM[tier];
    const ink = { width: lw(), color: INK, join: "round" as const };
    if (tier === "copper") {
      // lumpy ore nugget
      const pts = [-0.9, 0.1, -0.7, -0.5, -0.2, -0.75, 0.35, -0.6, 0.85, -0.2, 0.8, 0.45, 0.3, 0.7, -0.45, 0.65];
      const poly = pts.map((v) => v * s);
      g.poly(poly).fill(c.base);
      g.poly([-0.55 * s, -0.35 * s, -0.15 * s, -0.55 * s, 0.1 * s, -0.3 * s, -0.35 * s, -0.1 * s]).fill(c.light);
      g.poly([0.2 * s, 0.25 * s, 0.75 * s, 0.1 * s, 0.6 * s, 0.5 * s, 0.25 * s, 0.6 * s]).fill(c.shade);
      g.poly(poly).stroke(ink);
    } else if (tier === "silver") {
      // coin, slightly tilted toward the viewer
      g.ellipse(0, s * 0.12, s * 0.85, s * 0.8).fill(c.shade).stroke(ink);
      g.ellipse(0, 0, s * 0.85, s * 0.8).fill(c.base).stroke(ink);
      g.ellipse(0, 0, s * 0.55, s * 0.5).stroke({ width: lw(), color: c.shade });
      g.rect(-s * 0.12, -s * 0.3, s * 0.24, s * 0.6).fill(c.shade);
      g.ellipse(-s * 0.4, -s * 0.38, s * 0.14, s * 0.1).fill(c.light);
    } else if (tier === "gold") {
      // ingot: top face, front face, side face
      const top = [-0.6, -0.55, 0.6, -0.55, 0.9, -0.1, -0.9, -0.1].map((v) => v * s);
      const front = [-0.9, -0.1, 0.9, -0.1, 0.9, 0.55, -0.9, 0.55].map((v) => v * s);
      g.poly(front).fill(c.base).stroke(ink);
      g.poly(top).fill(c.light).stroke(ink);
      g.rect(-0.7 * s, 0.05 * s, 0.6 * s, 0.12 * s).fill(c.shade);
      g.rect(0.55 * s, -0.05 * s, 0.25 * s, 0.55 * s).fill(c.shade);
    } else if (tier === "ruby") {
      // round cut: octagon table with facets
      const r = s * 0.85;
      const oct: number[] = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        oct.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.poly(oct).fill(c.base);
      g.poly([0, 0, oct[8], oct[9], oct[10], oct[11], oct[12], oct[13]]).fill(c.shade);
      g.poly([-r * 0.4, -r * 0.4, r * 0.4, -r * 0.4, r * 0.4, r * 0.4, -r * 0.4, r * 0.4]).fill({ color: c.light, alpha: 0.55 });
      g.poly([oct[8], oct[9], oct[10], oct[11], oct[12], oct[13], 0, 0]).stroke({ width: lw(), color: INK, alpha: 0.5 });
      g.poly(oct).stroke(ink);
      g.circle(-r * 0.45, -r * 0.5, s * 0.08).fill(0xffffff);
    } else if (tier === "platinum") {
      // the one: a faceted platinum star with a halo
      const pts: number[] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const rr = k % 2 === 0 ? s * 1.05 : s * 0.45;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.circle(0, 0, s * 1.35).fill({ color: 0xfff6c8, alpha: 0.25 });
      g.poly(pts).fill(c.base);
      for (let k = 0; k < 10; k += 2) g.poly([0, 0, pts[k * 2], pts[k * 2 + 1], pts[((k + 1) % 10) * 2], pts[((k + 1) % 10) * 2 + 1]]).fill(c.shade);
      g.poly([0, 0, pts[18], pts[19], pts[0], pts[1]]).fill(c.light);
      g.poly(pts).stroke(ink);
      g.circle(-s * 0.15, -s * 0.35, s * 0.1).fill(0xffffff);
    } else {
      // diamond: brilliant cut, crown and pavilion
      const crown = [-s, -s * 0.2, -s * 0.55, -s * 0.72, s * 0.55, -s * 0.72, s, -s * 0.2];
      const pav = [-s, -s * 0.2, s, -s * 0.2, 0, s * 0.95];
      g.poly(crown).fill(c.base);
      g.poly(pav).fill(c.shade);
      g.poly([-s, -s * 0.2, -s * 0.2, -s * 0.2, 0, s * 0.95]).fill(c.base);
      g.poly([-s * 0.55, -s * 0.72, -s * 0.2, -s * 0.2, -s, -s * 0.2]).fill(c.light);
      g.moveTo(-s, -s * 0.2).lineTo(s, -s * 0.2).stroke({ width: lw(), color: INK, alpha: 0.7 });
      g.poly([...crown, 0, s * 0.95]).stroke(ink);
      g.circle(-s * 0.45, -s * 0.48, s * 0.08).fill(0xffffff);
    }
  }

  update(dt: number, reducedMotion: boolean) {
    this.t += dt;
    const s = this.size;
    // landing
    const d = easeOutBack(Math.min(1, this.dropP));
    this.root.alpha = reducedMotion ? Math.min(1, this.dropP * 2) : Math.min(1, this.dropP * 4);
    const fallY = reducedMotion ? 0 : (1 - d) * -s * 2.2;
    const jx = reducedMotion ? 0 : (Math.random() - 0.5) * this.shakeAmt * 6;
    this.left.position.set(jx, fallY);
    this.right.position.set(jx, fallY);
    this.crack.position.set(jx, fallY);

    // crack line grows along the seam
    const c = this.crack.clear();
    if (this.crackP > 0 && this.split === 0) {
      const segs = (this.seam.length / 2 - 1) * Math.min(1, this.crackP);
      c.moveTo(this.seam[0], this.seam[1]);
      for (let k = 1; k <= Math.ceil(segs); k++) {
        const f = Math.min(1, segs - (k - 1));
        const x0 = this.seam[(k - 1) * 2], y0 = this.seam[(k - 1) * 2 + 1];
        const x1 = this.seam[k * 2], y1 = this.seam[k * 2 + 1];
        c.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
      }
      c.stroke({ width: lw(), color: INK, cap: "round", join: "round" });
    }

    // split: halves fall away and tip outward
    if (this.split > 0) {
      const p = easeOutCubic(Math.min(1, this.split));
      const spread = reducedMotion ? s * 0.25 : s * 0.55;
      this.left.position.set(-p * spread, fallY + p * p * s * 0.25);
      this.right.position.set(p * spread, fallY + p * p * s * 0.25);
      this.left.rotation = reducedMotion ? 0 : -p * 0.5;
      this.right.rotation = reducedMotion ? 0 : p * 0.5;
      const fade = Math.max(0, 1 - Math.max(0, this.split - 0.6) * 1.2);
      this.left.alpha = this.right.alpha = Math.max(0.0, fade);
    } else {
      this.left.rotation = this.right.rotation = 0;
      this.left.alpha = this.right.alpha = 1;
    }

    // gem pops and floats
    const gp = Math.min(1, this.gemP);
    this.gem.scale.set(reducedMotion ? gp : easeOutBack(gp) * 1.05);
    this.gem.y = -gp * s * 0.18 + (gp >= 1 && !reducedMotion ? Math.sin(this.t * 2.4) * 3 : 0);
    this.gem.rotation = gp >= 1 && !reducedMotion ? Math.sin(this.t * 1.7) * 0.05 : 0;
  }
}

type Phase = "idle" | "running" | "done";

export interface RevealCallbacks {
  onLand?: (i: number) => void;
  onCrackStart?: (i: number) => void;
  onGem: (i: number) => void;
  onDone: () => void;
}

// Choreographs the three rocks. Times are seconds from start.
export class Reveal {
  readonly root = new Container();
  private rocks: Rock[] = [];
  private t = 0;
  private phase: Phase = "idle";
  private cb?: RevealCallbacks;
  private fired = new Set<string>();
  reducedMotion = false;
  private anchors: { x: number; y: number }[] = [];
  size = 90;

  start(slots: RevealSlot[], seed: number, cb: RevealCallbacks) {
    this.clear();
    this.cb = cb;
    this.rocks = slots.map((s, i) => new Rock(s, hash(seed, i), this.size));
    for (const r of this.rocks) this.root.addChild(r.root);
    this.place();
    this.t = 0;
    this.fired.clear();
    this.phase = "running";
  }

  clear() {
    for (const r of this.rocks) r.root.destroy({ children: true });
    this.rocks = [];
    this.phase = "idle";
  }

  get active() {
    return this.rocks.length > 0;
  }

  setAnchors(a: { x: number; y: number }[], size: number) {
    this.anchors = a;
    this.size = size;
    this.place();
  }

  private place() {
    this.rocks.forEach((r, i) => {
      const a = this.anchors[i];
      if (a) r.root.position.set(a.x, a.y);
      const k = this.size / r.size;
      r.root.scale.set(k);
    });
  }

  timings() {
    const rm = this.reducedMotion;
    const n = Math.max(1, this.rocks.length);
    // five rocks go quicker; a lone level-3 rock gets a long, tense crack
    const step = rm ? 0.5 : n >= 5 ? 0.7 : 0.95;
    const first = rm ? 0.4 : 0.55;
    const crackLen = rm ? 0.15 : n === 1 ? 1.1 : 0.4;
    return {
      land: (i: number) => i * (n >= 5 ? 0.08 : 0.12),
      crack: (i: number) => first + i * step,
      split: (i: number) => first + i * step + crackLen,
      done: first + (n - 1) * step + crackLen + 0.6,
    };
  }

  skip() {
    if (this.phase !== "running") return;
    this.t = 99;
  }

  update(dt: number, shake: (amt: number) => void, burst: (i: number, x: number, y: number) => void) {
    if (this.phase === "idle") return;
    this.t += dt;
    const T = this.timings();
    const once = (key: string, f: () => void) => {
      if (!this.fired.has(key)) {
        this.fired.add(key);
        f();
      }
    };
    this.rocks.forEach((r, i) => {
      const tl = T.land(i);
      r.dropP = Math.max(0, (this.t - tl) / 0.4);
      if (this.t >= tl + 0.32) once(`land${i}`, () => {
        if (this.t < 50) shake(2);
        this.cb?.onLand?.(i);
      });
      const tc = T.crack(i);
      const ts = T.split(i);
      if (this.t >= tc) once(`crack${i}`, () => this.cb?.onCrackStart?.(i));
      r.crackP = this.t >= tc ? (this.t - tc) / (ts - tc) : 0;
      r.shakeAmt = this.t >= tc && this.t < ts && !this.reducedMotion ? 0.5 + r.crackP : 0;
      r.split = this.t >= ts ? (this.t - ts) / 0.45 : 0;
      r.gemP = this.t >= ts ? (this.t - ts) / 0.38 : 0;
      if (this.t >= ts) once(`gem${i}`, () => {
        if (this.t < 50) {
          shake(r.slot.tier === "platinum" ? 14 : r.slot.tier === "diamond" ? 9 : r.slot.tier === "gold" ? 6 : 4);
          burst(i, r.root.x, r.root.y);
        }
        this.cb?.onGem(i);
      });
      r.update(dt, this.reducedMotion);
    });
    if (this.t >= T.done && this.phase === "running") {
      this.phase = "done";
      this.cb?.onDone();
    }
  }
}
