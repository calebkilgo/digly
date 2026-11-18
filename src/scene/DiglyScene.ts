// Strict-CSP friendly: no eval-generated shader sync code.
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, TextureStyle } from "pixi.js";
import { LEVELS } from "../game/rules/levels";
import { Miner } from "./Miner";
import { SPR_H } from "./minerSprites";
import { Particles } from "./Particles";
import { Reveal, type RevealCallbacks, type RevealSlot } from "./Reveal";
import { FEET_UP, World } from "./World";
import { CAVE, GEM, PX, setPX } from "./palette";
import { approach, clamp } from "./rng";

export type SceneMode = "home" | "pregame" | "play" | "reveal";

export interface RockAnchor {
  x: number;
  y: number;
  size: number;
}

// Pick an art-pixel size so the miner stays a comfortable size on any screen.
function pickPX(w: number, h: number) {
  return clamp(Math.round(Math.min(w, h * 0.9) / 190), 3, 5);
}

// Owns the Pixi app and everything drawn in it. React talks to it through
// these methods only; it never reaches into display objects.
export class DiglyScene {
  private app!: Application;
  private root = new Container();
  private worldC = new Container();
  private worldC2 = new Container();
  private world!: World;
  private miner!: Miner;
  private particles!: Particles;
  private reveal = new Reveal();
  private dark = new Graphics(); // deepens as you dig; drawn under the miner so his lamp "lights" him
  private vignette = new Graphics(); // level mood frame, red pulse when time is low
  private level = 1;
  private moodT = 0;

  private mode: SceneMode = "home";
  private W = 800;
  private H = 600;
  private insetTop = 0;
  private insetBottom = 0;
  private k = 1;
  private camY = 0;
  private camTarget = 0;
  private camX = 0; // sideways camera, phones only: keeps him on screen as he digs

  private shakeAmp = 0;
  private reduced = false;
  private focusX = 0.5;
  // Home zooms out to show the sky, the surface and the dig below; anything
  // else zooms back in on the miner. While zoomed out (or moving) the canvas
  // renders at 2 screen px per pixel so the shrunken art stays crisp.
  private zoom = 1;
  private zoomTarget = 1;
  private res = 0;

  private depth = 0;
  private depthTarget = 0;
  private urgent = false;
  private drilling = false;
  private ambientAcc = 0;
  private anchorListeners = new Set<(a: RockAnchor[]) => void>();
  private anchors: RockAnchor[] = [];
  private gemColors: number[] = [];
  private ro?: ResizeObserver;
  private destroyed = false;

  // fired on every pickaxe strike, so the UI can play the dig sound
  onStrike?: (power: number) => void;

  static async create(host: HTMLElement, seed: number): Promise<DiglyScene> {
    const s = new DiglyScene();
    await s.init(host, seed);
    return s;
  }

  private async init(host: HTMLElement, seed: number) {
    TextureStyle.defaultOptions.scaleMode = "nearest";
    const r = host.getBoundingClientRect();
    setPX(pickPX(r.width || 800, r.height || 600));
    this.app = new Application();
    await this.app.init({
      resizeTo: host,
      background: CAVE.back,
      antialias: false,
      autoDensity: true,
      roundPixels: true,
      resolution: 1 / PX,
      preference: "webgl",
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    const canvas = this.app.canvas;
    canvas.style.imageRendering = "pixelated";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    this.world = new World(seed);
    this.miner = new Miner();
    this.particles = new Particles(this.app.renderer);
    this.miner.onStrike = (x, y, power) => this.strike(x, y, power);

    this.worldC.addChild(this.world.strata, this.world.rock, this.world.tunnel);
    this.root.addChild(this.worldC, this.world.back, this.dark);
    this.worldC2.addChild(this.world.sky, this.world.moon, this.world.tunnelMask, this.world.ruler, this.world.lantern, this.miner.root, this.particles.layer);
    this.root.addChild(this.worldC2, this.vignette, this.reveal.root);
    this.app.stage.addChild(this.root);

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(host);
    this.layout();
    this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));
  }

  destroy() {
    this.destroyed = true;
    this.ro?.disconnect();
    try {
      this.app?.destroy(true, { children: true });
    } catch {
      // init may not have finished
    }
  }

  // ---- configuration ------------------------------------------------------

  setReducedMotion(on: boolean) {
    this.reduced = on;
    if (this.miner) this.miner.reducedMotion = on;
    this.reveal.reducedMotion = on;
    if (this.particles) this.particles.budget = on ? 0.35 : 1;
  }

  setInsets(top: number, bottom: number) {
    if (top === this.insetTop && bottom === this.insetBottom) return;
    this.insetTop = top;
    this.insetBottom = bottom;
    this.layout();
  }

  setFocusX(f: number) {
    if (f === this.focusX) return;
    this.focusX = f;
    this.layout();
  }

  onAnchors(f: (a: RockAnchor[]) => void) {
    this.anchorListeners.add(f);
    f(this.anchors);
    return () => {
      this.anchorListeners.delete(f);
    };
  }

  private layout() {
    if (!this.app?.renderer) return;
    this.W = this.app.screen.width;
    this.H = this.app.screen.height;
    const px = pickPX(this.W, this.H);
    if (px !== PX) {
      setPX(px);
      this.app.renderer.resize(this.W, this.H, 1 / px);
    }
    this.k = PX / 4;
    if (this.mode === "home") {
      this.zoomTarget = this.homeZoom();
      if (!this.res) this.zoom = this.zoomTarget; // first layout: start zoomed out
    }
    this.res = 0; // renderer was resized; pick the resolution again next frame
    this.world.resize(this.W, this.focusX);
    this.world.setScale(this.k);
    this.layoutReveal();
  }

  // phone-sized screens get a few layout tweaks; desktop never does
  private narrow() {
    return this.W < 600;
  }

  private freeBand() {
    const top = this.insetTop;
    const h = Math.max(160, this.H - this.insetTop - this.insetBottom);
    return { top, h };
  }

  private rockCount = 3;

  private layoutReveal() {
    const { top, h } = this.freeBand();
    const n = this.rockCount;
    const spacing = n === 1 ? 0 : Math.min((this.W * 0.92) / n, 200);
    const size = n === 1 ? clamp(this.W * 0.3, 80, 130) : clamp(spacing * 0.62, 44, 104);
    // leave room under the rocks for the gem labels (number, name, rank, %)
    const y = Math.round(Math.min(top + h * 0.62, top + h - size * 0.5 - 132));
    this.rocksY = y;
    this.rockSize = size;
    this.anchors = Array.from({ length: n }, (_, i) => ({ x: this.W / 2 + (i - (n - 1) / 2) * spacing, y, size }));
    this.reveal.setAnchors(this.anchors, size);
    if (this.mode === "reveal") this.placeDiscovery();
    for (const f of this.anchorListeners) f(this.anchors);
  }

  private rocksY = 0;
  private rockSize = 80;

  // the miner stands just above the row of rocks
  private revealFeetY() {
    return this.rocksY - this.rockSize * 0.75;
  }

  private placeDiscovery() {
    const { top, h } = this.freeBand();
    const worldY = top + h * 0.4 - this.camY;
    const head = this.revealFeetY() - SPR_H * PX - 14;
    const bottom = this.rocksY + this.rockSize * 0.62;
    const cy = (head + bottom) / 2 - worldY;
    this.world.setDiscovery({ x: this.W / 2, y: cy, rx: Math.min(this.W * 0.48, 330), ry: (bottom - head) / 2 + 8 });
  }

  // ---- mode changes -------------------------------------------------------

  // zoomed out, each art pixel is a whole number of screen pixels (2 or 3)
  private homePX() {
    return Math.min(PX, Math.max(2, Math.round(PX * 0.7)));
  }

  private homeZoom() {
    return this.homePX() / PX;
  }

  setMode(m: SceneMode) {
    if (m === this.mode) return;
    const prev = this.mode;
    this.mode = m;
    this.zoomTarget = m === "home" ? this.homeZoom() : 1;
    if (m === "home" || m === "pregame") {
      this.level = 1;
      this.reveal.clear();
      this.world.resetPath();
      this.depth = this.depthTarget = 0;
      this.drilling = false;
      this.urgent = false;
      this.miner.urgent = false;
      this.miner.setState("idle");
      if (prev !== "home" && prev !== "pregame") this.particles.clear();
    }
  }

  // First swing into the chamber floor. Resolves when the round should begin.
  rev(): Promise<void> {
    this.mode = "play";
    this.miner.setState("rev");
    return new Promise((res) =>
      setTimeout(
        () => {
          this.miner.setState("drill");
          this.drilling = true;
          this.depthTarget = Math.max(this.depthTarget, this.depth + 40 * this.k);
          res();
        },
        this.reduced ? 150 : 350,
      ),
    );
  }

  // After a level's reveal: clear the rocks and drop to where the next level
  // starts. He falls down the shaft while the countdown runs.
  prepareLevel(levelIndex: number) {
    this.reveal.clear();
    this.world.setDiscovery(undefined);
    this.mode = "play";
    this.drilling = false;
    this.setUrgent(false);
    this.miner.setState("idle");
    this.level = levelIndex + 1;
    const start = LEVELS[levelIndex].startM * this.world.ppm;
    this.depthTarget = Math.max(this.depthTarget, start);
  }

  // current depth in meters, for the HUD gauge
  getDepthM() {
    return Math.max(0, this.depth / this.world.ppm);
  }

  valid() {
    this.miner.surge();
    this.depthTarget += 110 * this.k;
    const p = this.minerPoint(0, -SPR_H - 4);
    this.particles.emit({ kind: "spark", x: p.x, y: p.y, count: 5, color: 0xffe14a, speed: [60, 140], angle: [-Math.PI, 0], gravity: 160, life: [0.35, 0.6], size: [0.8, 1.2], endScale: 0.4, spread: 6 });
    this.shake(1.5);
  }

  invalid() {
    this.miner.sputter();
    const p = this.minerPoint(14, -2);
    this.particles.emit({ kind: "smoke", x: p.x, y: p.y, count: 4, color: 0xb8b0c8, speed: [15, 45], angle: [-2.4, -0.7], gravity: -40, life: [0.4, 0.7], size: [0.8, 1.1], endScale: 1.4 });
  }

  setUrgent(on: boolean, final5 = false) {
    this.urgent = on;
    this.miner.urgent = on;
    this.miner.final5 = final5;
  }

  endRound(): Promise<void> {
    this.drilling = false;
    this.urgent = false;
    this.miner.setState("winddown");
    const p = this.minerPoint(0, 0);
    this.particles.emit({ kind: "dust", x: p.x, y: p.y, count: 12, color: 0xffe0b0, speed: [20, 70], angle: [-Math.PI, 0], gravity: -10, life: [0.6, 1.1], size: [1, 2], endScale: 1.5, spread: 30 });
    return new Promise((res) => setTimeout(res, this.reduced ? 250 : 800));
  }

  startReveal(slots: RevealSlot[], seed: number, cb: RevealCallbacks) {
    this.mode = "reveal";
    this.gemColors = slots.map((s) => (s.tier ? GEM[s.tier].light : 0x9a8f98));
    this.rockCount = slots.length;
    this.layoutReveal();
    this.placeDiscovery();
    this.miner.setState("watch");
    this.reveal.start(slots, seed, {
      ...cb,
      onCrackStart: (i) => {
        this.miner.lookAt(i - 1);
        cb.onCrackStart?.(i);
      },
      onGem: (i) => {
        this.miner.wow();
        cb.onGem(i);
      },
      onDone: () => {
        this.miner.releaseLook();
        cb.onDone();
      },
    });
  }

  // results screen: rocks gone, the miner celebrates in the chamber
  clearRocks() {
    this.reveal.clear();
    this.miner.setState("victory");
  }

  skipReveal() {
    this.reveal.skip();
  }

  // every few finds during play: a confetti pop without breaking his rhythm
  milestone() {
    this.miner.surge();
    const p = this.minerPoint(0, -30);
    for (const tier of ["platinum", "diamond", "gold", "copper"]) {
      this.particles.emit({ kind: "spark", x: p.x, y: p.y, count: 5, color: GEM[tier].base, speed: [100, 240], angle: [-Math.PI, 0], gravity: 300, life: [0.5, 0.9], size: [0.8, 1.2], spread: 10 });
    }
    this.shake(2);
  }

  celebrate(big = false) {
    this.miner.setState("victory");
    const p = this.minerPoint(0, -20);
    for (const tier of big ? ["platinum", "diamond", "gold", "copper"] : ["gold", "diamond"]) {
      this.particles.emit({ kind: Math.random() < 0.5 ? "spark" : "chunk", x: p.x, y: p.y, count: big ? 14 : 8, color: GEM[tier].base, speed: [90, 260], angle: [-Math.PI, 0], gravity: 260, life: [0.7, 1.3], size: [0.8, 1.3], spread: 20 });
    }
  }

  // ---- internals ----------------------------------------------------------

  private shake(a: number) {
    if (this.reduced) return;
    this.shakeAmp = Math.max(this.shakeAmp, a * this.k * (1 + (this.level - 1) * 0.25));
  }

  // a point on the miner in sprite pixels, converted to world space
  private minerPoint(x: number, y: number) {
    const m = this.miner.root;
    return { x: m.x + x * m.scale.x, y: m.y + y * m.scale.y };
  }

  private strike(x: number, y: number, power: number) {
    const p = this.minerPoint(x, y);
    const pal = this.world.bandAt(p.y + 10);
    const n = Math.round(4 * power);
    this.particles.emit({ kind: "chunk", x: p.x, y: p.y, count: n, color: pal.base, speed: [80, 200 * power], angle: [-Math.PI + 0.3, -0.3], gravity: 700, life: [0.3, 0.55], size: [0.7, 1.1], spread: 4 });
    this.particles.emit({ kind: "dust", x: p.x, y: p.y, count: Math.ceil(n / 2), color: pal.fleck, speed: [20, 70], angle: [-Math.PI, 0], gravity: 100, life: [0.3, 0.5], size: [1, 1.5], spread: 6 });
    if (this.drilling) this.depthTarget += 7 * this.k;
    if (power > 1) this.shake(1.2);
    this.onStrike?.(power);
  }

  private tick(rawDt: number) {
    if (this.destroyed || !this.world) return;
    // physics gets a clamped step; the reveal timeline follows the wall clock
    const dt = Math.min(0.05, rawDt);
    const timelineDt = Math.min(0.25, rawDt);
    const { top, h } = this.freeBand();
    const k = this.k;
    const floorY = 96 * k; // chamber floor, where his boots rest

    let mx = this.world.homeX;
    let my = floorY;
    let anchorY = top + h * 0.55;
    let camXTarget = 0;

    if (this.mode === "home" || this.mode === "pregame") {
      this.camTarget = 0;
      // zoomed out, he sits lower so more sky shows above the surface
      anchorY = top + h * (this.mode === "home" ? 0.55 + (1 - this.zoom) * 0.25 : 0.48);
    } else if (this.mode === "play") {
      const creep = (this.drilling ? (this.urgent ? 34 : 18) : 0) * k;
      this.depthTarget += creep * dt;
      this.depth = approach(this.depth, this.depthTarget, 7, dt);
      // into the mountain, then wandering down through the earth
      const p = this.world.digPoint(this.depth);
      mx = p.x;
      my = p.y;
      this.camTarget = my - floorY;
      anchorY = top + h * 0.55;
      if (this.narrow()) {
        // a phone is too narrow to show the whole dig: follow him sideways, keeping
        // him a little left of center (the depth gauge sits on the right), and give
        // him more headroom since the band between the HUD and keyboard is short
        camXTarget = mx - this.W * 0.44;
        anchorY = top + h * 0.7;
      }
      this.world.extendPath(mx, my - FEET_UP * k);
    } else if (this.mode === "reveal") {
      anchorY = top + h * 0.4;
      mx = this.W / 2;
      my = this.camY + this.revealFeetY() - anchorY;
      this.camTarget = this.camY;
    }

    if (this.mode !== "reveal") this.camY = approach(this.camY, this.camTarget, this.mode === "play" ? 5 : 3, dt);
    this.camX = this.reduced ? camXTarget : approach(this.camX, camXTarget, 4, dt);
    if (Math.abs(this.camX - camXTarget) < 0.5) this.camX = camXTarget;
    const cx = Math.round(this.camX);
    const worldY = Math.round(anchorY - this.camY);
    let sx = 0;
    let sy = 0;
    if (this.shakeAmp > 0.3) {
      sx = Math.round((Math.random() - 0.5) * this.shakeAmp * 2);
      sy = Math.round((Math.random() - 0.5) * this.shakeAmp * 2);
      this.shakeAmp = approach(this.shakeAmp, 0, 9, dt);
    }
    // zoom toward the target, scaling the world around the miner
    this.zoom = this.reduced ? this.zoomTarget : approach(this.zoom, this.zoomTarget, 3.2, dt);
    if (Math.abs(this.zoom - this.zoomTarget) < 0.002) this.zoom = this.zoomTarget;
    const z = this.zoom;
    const wantRes = z < 1 || this.zoomTarget < 1 ? 1 / this.homePX() : 1 / PX;
    if (wantRes !== this.res) {
      this.res = wantRes;
      this.app.renderer.resize(this.W, this.H, wantRes);
    }
    // zoom around the miner. On desktop that's always his home spot; on phones he
    // may already be walking into the mine while the zoom runs
    const fx = this.narrow() ? sx - cx + mx : this.world.homeX + sx;
    const fy = worldY + sy + (this.narrow() ? my : floorY) - SPR_H * PX * 0.5;
    const place = (c: Container, x: number, y: number) => {
      c.scale.set(z);
      c.position.set(fx + (x - fx) * z, fy + (y - fy) * z);
    };
    place(this.worldC, sx - cx, worldY + sy);
    place(this.worldC2, sx - cx, worldY + sy);
    // the depth ruler stays on the left edge of the screen however far the camera pans
    this.world.ruler.x = cx;
    // phones: the sky is a thin strip during a dig, so the moon would fill it
    this.world.moon.visible = !(this.narrow() && this.mode !== "home");
    place(this.world.back, sx, Math.round(anchorY - this.camY * 0.5) + sy);
    // the depth ruler only makes sense zoomed in
    this.world.ruler.visible = z > 0.97;
    this.world.near.position.set(0, Math.round(anchorY - this.camY * 1.35));
    const darkA = Math.max(0, Math.min(0.5, (this.getDepthM() - 25) / 260));
    this.dark.clear();
    if (darkA > 0.01) this.dark.rect(0, 0, this.W, this.H).fill({ color: 0x0a0418, alpha: darkA });
    this.reveal.root.position.set(sx, sy);

    // miner
    const m = this.miner.root;
    m.scale.set(PX);
    if (this.mode === "reveal") {
      m.x = approach(m.x, mx, 5, dt);
      m.y = approach(m.y, my, 5, dt);
    } else if (this.mode === "play" && Math.abs(m.x - mx) > 6 * PX) {
      // walks in from the ledge to the far timber as the round starts
      m.x = approach(m.x, mx, 6, dt);
      m.y = my;
    } else {
      m.position.set(mx, my);
    }
    // snap to the art grid so his pixels line up with the world's
    m.x = Math.round(m.x / PX) * PX;
    m.y = Math.round(m.y / PX) * PX;
    this.miner.update(dt);

    this.drawMood(dt);
    if (this.mode === "play") this.levelAmbience(dt);

    // ambient dust motes when not digging
    this.ambientAcc += dt;
    if (this.ambientAcc > (this.reduced ? 1.2 : 0.4) && this.mode !== "play") {
      this.ambientAcc = 0;
      const pal = this.world.bandAt(m.y);
      this.particles.emit({ kind: "dust", x: m.x + (Math.random() - 0.5) * 260 * k, y: m.y - Math.random() * 200 * k, count: 1, color: pal.fleck, speed: [4, 14], angle: [-Math.PI, 0], gravity: -3, life: [2.5, 4], size: [0.8, 1], endScale: 1, drag: 0.2 });
    }

    // world rows on screen, allowing for the zoom
    const camTop = (0 - this.worldC.position.y) / z;
    this.world.ensure(camTop, camTop + this.H / z, this.camY);
    this.world.updateLantern(dt, this.mode === "home" || this.mode === "pregame");

    this.reveal.update(
      timelineDt,
      (a) => this.shake(a),
      (i, x, y) => this.gemBurst(i, x, y - worldY),
    );
    this.particles.update(dt);
  }

  // Level 1 drifting dust, level 2 rising embers, level 3 twinkling crystal
  // sparkles. Denser when the clock is low.
  private ambAcc = 0;
  private levelAmbience(dt: number) {
    const rate = (this.level === 1 ? 4 : this.level === 2 ? 9 : 12) * (this.urgent ? 1.8 : 1) * (this.reduced ? 0.3 : 1);
    this.ambAcc += dt * rate;
    const top = this.camY - (this.freeBand().top + this.freeBand().h * 0.55);
    while (this.ambAcc >= 1) {
      this.ambAcc -= 1;
      const x = Math.random() * this.W;
      if (this.level === 1) {
        this.particles.emit({ kind: "dust", x, y: top + Math.random() * this.H * 0.3, count: 1, color: 0xf2d0a0, speed: [5, 20], angle: [1.2, 1.9], gravity: 12, life: [2, 3.5], size: [0.8, 1], endScale: 1, drag: 0.3 });
      } else if (this.level === 2) {
        this.particles.emit({ kind: "dust", x, y: top + this.H * (0.7 + Math.random() * 0.3), count: 1, color: Math.random() < 0.5 ? 0xff7a2a : 0xffc040, speed: [20, 50], angle: [-1.9, -1.2], gravity: -20, life: [1.5, 2.6], size: [0.8, 1.1], endScale: 0.5, drag: 0.4 });
      } else {
        this.particles.emit({ kind: "spark", x, y: top + Math.random() * this.H, count: 1, color: Math.random() < 0.5 ? 0x5ff0e0 : 0xc58cf0, speed: [2, 10], gravity: 0, life: [0.6, 1.2], size: [0.5, 0.8], endScale: 0.1, drag: 0.5 });
      }
    }
  }

  private drawMood(dt: number) {
    this.moodT += dt;
    const g = this.vignette.clear();
    const deep = this.mode === "play" || this.mode === "reveal";
    const base = !deep ? 0 : this.level === 1 ? 0.12 : this.level === 2 ? 0.3 : 0.42;
    const color = this.level === 1 ? 0x3a1a08 : this.level === 2 ? 0x7a1408 : 0x1a1060;
    const pulse = this.urgent ? 0.25 + 0.2 * Math.sin(this.moodT * 9) : 0;
    const u = PX;
    const bands = 6;
    for (let k = 0; k < bands; k++) {
      const a = (base * (bands - k)) / bands;
      if (a > 0.01) this.frame(g, k * 3 * u, 3 * u, color, a);
      const pa = (pulse * (bands - k)) / bands;
      if (pa > 0.01) this.frame(g, k * 3 * u, 3 * u, 0xff2010, pa);
    }
  }

  private frame(g: Graphics, inset: number, t: number, color: number, alpha: number) {
    const W = this.W;
    const H = this.H;
    g.rect(inset, inset, W - inset * 2, t).fill({ color, alpha });
    g.rect(inset, H - inset - t, W - inset * 2, t).fill({ color, alpha });
    g.rect(inset, inset + t, t, H - inset * 2 - t * 2).fill({ color, alpha });
    g.rect(W - inset - t, inset + t, t, H - inset * 2 - t * 2).fill({ color, alpha });
  }

  private gemBurst(i: number, x: number, y: number) {
    const pal = this.world.bandAt(y);
    const c = this.gemColors[i] ?? 0xffffff;
    this.particles.emit({ kind: "chunk", x, y, count: 16, color: 0x9a8f98, speed: [120, 300], angle: [-Math.PI, 0], gravity: 900, life: [0.5, 0.9], size: [0.8, 1.4], spread: 20 });
    this.particles.emit({ kind: "dust", x, y, count: 10, color: pal.fleck, speed: [30, 120], gravity: -20, life: [0.6, 1.1], size: [1, 2], endScale: 2 });
    this.particles.emit({ kind: "spark", x, y: y - 10, count: 12, color: c, speed: [90, 260], gravity: 120, life: [0.5, 1], size: [0.8, 1.3], spread: 10 });
    this.particles.emit({ kind: "shard", x, y: y - 10, count: 6, color: c, speed: [140, 280], angle: [-Math.PI, 0], gravity: 700, life: [0.5, 0.8], size: [0.8, 1.1] });
  }
}
