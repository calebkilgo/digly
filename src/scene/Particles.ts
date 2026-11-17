import { Container, Graphics, Sprite, Texture, type Renderer } from "pixi.js";
import { PX } from "./palette";

export type ParticleKind = "chunk" | "dust" | "spark" | "shard" | "smoke";

interface P {
  sprite: Sprite;
  alive: boolean;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  spin: number;
  s0: number;
  s1: number;
  fade: boolean;
}

export interface EmitOptions {
  kind: ParticleKind;
  x: number;
  y: number;
  count: number;
  color: number;
  speed?: [number, number];
  angle?: [number, number]; // radians
  gravity?: number;
  life?: [number, number];
  size?: [number, number];
  drag?: number;
  endScale?: number;
  spread?: number; // spawn jitter radius
}

// Pooled sprite particles. Textures are drawn once in white with an ink edge
// and tinted per particle, so every chip of dirt matches the world's outline.
export class Particles {
  readonly layer = new Container();
  private pool: P[] = [];
  private tex: Record<ParticleKind, Texture>;
  budget = 1;

  constructor(renderer: Renderer, size = 420) {
    // Plain pixel blobs, no outlines: at art resolution they read as chips.
    const u = PX;
    const make = (g: Graphics) => {
      const t = renderer.generateTexture({ target: g, resolution: 1, antialias: false });
      t.source.scaleMode = "nearest";
      return t;
    };
    this.tex = {
      chunk: make(new Graphics().rect(0, 0, u * 2, u * 2).fill(0xffffff).rect(0, u, u * 2, u).fill(0xdddddd)),
      shard: make(new Graphics().rect(u, 0, u, u * 3).fill(0xffffff).rect(0, u, u * 3, u).fill(0xffffff)),
      dust: make(new Graphics().rect(0, 0, u, u).fill(0xffffff)),
      smoke: make(new Graphics().rect(0, 0, u * 2, u * 2).fill(0xffffff)),
      spark: make(
        new Graphics()
          .rect(u * 2, 0, u, u * 5)
          .fill(0xffffff)
          .rect(0, u * 2, u * 5, u)
          .fill(0xffffff),
      ),
    };
    for (let i = 0; i < size; i++) {
      const sprite = new Sprite(this.tex.dust);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.layer.addChild(sprite);
      this.pool.push({ sprite, alive: false, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, spin: 0, s0: 1, s1: 1, fade: true });
    }
  }

  emit(o: EmitOptions) {
    const n = Math.max(1, Math.round(o.count * this.budget));
    const [smin, smax] = o.speed ?? [60, 180];
    const [amin, amax] = o.angle ?? [0, Math.PI * 2];
    const [lmin, lmax] = o.life ?? [0.4, 0.9];
    const [zmin, zmax] = o.size ?? [0.6, 1.2];
    for (let i = 0; i < n; i++) {
      const p = this.pool.find((q) => !q.alive);
      if (!p) return;
      const a = amin + Math.random() * (amax - amin);
      const sp = smin + Math.random() * (smax - smin);
      const j = o.spread ?? 4;
      p.alive = true;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.g = o.gravity ?? 600;
      p.drag = o.drag ?? 1.5;
      p.max = p.life = lmin + Math.random() * (lmax - lmin);
      p.spin = 0; // pixel chips never rotate
      p.s0 = zmin + Math.random() * (zmax - zmin);
      p.s1 = p.s0 * (o.endScale ?? 0.4);
      p.fade = o.kind === "dust" || o.kind === "smoke" || o.kind === "spark";
      const s = p.sprite;
      s.texture = this.tex[o.kind];
      s.tint = o.color;
      s.position.set(o.x + (Math.random() - 0.5) * j * 2, o.y + (Math.random() - 0.5) * j * 2);
      s.rotation = 0;
      s.alpha = o.kind === "dust" ? 0.55 : 1;
      s.scale.set(p.s0);
      s.visible = true;
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.sprite.visible = false;
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      const s = p.sprite;
      s.x += p.vx * dt;
      s.y += p.vy * dt;
      s.rotation += p.spin * dt;
      const t = 1 - p.life / p.max;
      s.scale.set(p.s0 + (p.s1 - p.s0) * t);
      if (p.fade) s.alpha = Math.min(s.alpha, (1 - t) * 0.9 + 0.05);
      else if (t > 0.75) s.alpha = (1 - t) * 4;
    }
  }

  clear() {
    for (const p of this.pool) {
      p.alive = false;
      p.sprite.visible = false;
    }
  }
}
