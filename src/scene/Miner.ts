import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { ARM, ARM_AT, ARM_PIVOT, ARM_TIP, FEET_X, FRAMES, LAMP_HOT, MPAL, SPR_H, SPR_W, type FrameName } from "./minerSprites";
import { approach, clamp } from "./rng";

export type MinerState = "idle" | "rev" | "drill" | "winddown" | "watch" | "victory";

function textureFrom(rows: string[], swap?: Record<string, number>): Texture {
  const w = rows[0].length;
  const h = rows.length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  rows.forEach((r, y) => {
    for (let x = 0; x < w; x++) {
      const ch = r[x];
      if (ch === ".") continue;
      const v = swap?.[ch] ?? MPAL[ch];
      const i = (y * w + x) * 4;
      img.data[i] = (v >> 16) & 255;
      img.data[i + 1] = (v >> 8) & 255;
      img.data[i + 2] = v & 255;
      img.data[i + 3] = 255;
    }
  });
  g.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = "nearest";
  return t;
}

const TAU = Math.PI * 2;
// Angles of the arm piece around his hip. 0 is the rest pose from the art: the
// pick head on the ground in front of him. Positive turns clockwise, so one
// swing is a full turn: down behind him, up over his head, then hard into the
// ground in front.
const REST = 0;
const OVERHEAD = 4.15; // pick straight above his hip (valid answers skip ahead to here)
const SWING_SHARE = 0.82; // part of each swing spent turning; the rest it sits planted

// Digly the miner. Units inside are sprite pixels; the scene scales the root
// so one sprite pixel is one screen "art pixel". Origin is between his boots.
export class Miner {
  readonly root = new Container();
  private rig = new Container();
  private body: Sprite;
  private arm: Sprite;
  private glow = new Graphics();
  private tex: Record<string, { cool: Texture; hot: Texture }> = {};

  state: MinerState = "idle";
  urgent = false;
  reducedMotion = false;
  onStrike?: (x: number, y: number, power: number) => void;

  private t = 0;
  private swingT = 0;
  private angle = REST;
  private angleVel = 0;
  private hop = 0;
  private hopVel = 0;
  private squash = 0;
  private blinkT = 2;
  private mood: FrameName = "stand";
  private moodHold = 0;
  private holdMood: FrameName = "stand";
  private forceStrike = false;
  private power = 1;
  private hot = false;
  private flashT = 0;
  final5 = false;
  private lean = 0;
  private leanTarget = 0;

  // the hip, relative to the root
  private readonly pivot = { x: ARM_AT.x + ARM_PIVOT.x - FEET_X, y: ARM_AT.y + ARM_PIVOT.y - SPR_H };

  constructor() {
    for (const [name, rows] of Object.entries(FRAMES)) {
      this.tex[name] = { cool: textureFrom(rows), hot: textureFrom(rows, { L: LAMP_HOT }) };
    }
    this.body = new Sprite(this.tex.stand.cool);
    this.body.anchor.set(FEET_X / SPR_W, 1);
    this.arm = new Sprite(textureFrom(ARM));
    this.arm.anchor.set(ARM_PIVOT.x / ARM[0].length, ARM_PIVOT.y / ARM.length);
    this.arm.position.set(this.pivot.x, this.pivot.y);
    this.rig.addChild(this.body, this.arm, this.glow);
    this.root.addChild(this.rig);
  }

  setState(s: MinerState) {
    this.state = s;
    if (s === "rev") {
      this.swingT = 0;
      this.setMood("happy", 0.5);
    }
    if (s === "winddown") {
      this.urgent = false;
      this.setMood("blink", 0.5);
    }
    if (s === "victory") {
      this.hopVel = -90;
      this.setMood("happy", 2);
    }
  }

  // A valid answer: an extra-hard swing right now and a happy hop.
  surge() {
    this.forceStrike = true;
    this.power = 1.8;
    if (!this.reducedMotion) this.hopVel = Math.min(this.hopVel, -55);
    this.setMood("happy", 0.45);
  }

  // A miss: the pick bounces off and he winces.
  sputter() {
    this.angleVel -= 14;
    this.setMood("oops", 0.45);
  }

  wow() {
    this.setMood("oops", 0.35);
    if (!this.reducedMotion) this.hopVel = -40;
  }

  lookAt(x: number) {
    this.leanTarget = clamp(x, -1, 1) * 0.12;
  }

  releaseLook() {
    this.leanTarget = 0;
  }

  // world-space-ish points in sprite pixels, relative to the root
  readonly lampPoint = { x: 9.5 - FEET_X, y: 2.5 - SPR_H };

  private setMood(m: FrameName, hold: number) {
    this.holdMood = m;
    this.moodHold = hold;
  }

  private armPoint(px: number, py: number) {
    const a = this.arm.rotation;
    const dx = px - ARM_PIVOT.x;
    const dy = py - ARM_PIVOT.y;
    return { x: this.pivot.x + dx * Math.cos(a) - dy * Math.sin(a), y: this.pivot.y + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  update(dt: number) {
    this.t += dt;
    const rm = this.reducedMotion;
    const digging = this.state === "drill" || this.state === "rev";

    // ---- the swing: one full turn around the hip per strike ------------------
    if (digging) {
      const period = this.urgent ? 0.42 : 0.6;
      const before = this.swingT;
      this.swingT += dt / period;
      if (this.forceStrike) {
        // skip ahead to the pick coming over his head
        const into = this.swingT % 1;
        const overhead = Math.sqrt(OVERHEAD / TAU) * SWING_SHARE;
        if (into < overhead) this.swingT = Math.floor(this.swingT) + overhead;
        this.forceStrike = false;
      }
      const p = this.swingT % 1;
      // slow lift behind him, speeding up into the ground in front
      this.angle = p < SWING_SHARE ? TAU * Math.pow(p / SWING_SHARE, 2.2) : TAU;
      if (Math.floor(before + (1 - SWING_SHARE)) !== Math.floor(this.swingT + (1 - SWING_SHARE))) {
        // crossed the end of the turn: the pick hits the ground
        this.arm.rotation = 0;
        const tip = this.armPoint(ARM_TIP.x, ARM_TIP.y);
        this.squash = rm ? 0 : 0.08 * this.power;
        this.onStrike?.(tip.x, tip.y, this.power);
        this.power = 1;
      }
      this.angleVel = 0;
    } else {
      // celebrating, idle or watching: the pick rests on the ground
      const target = REST;
      // come back to rest the short way round
      this.angle = ((this.angle % TAU) + TAU) % TAU;
      if (this.angle - target > Math.PI) this.angle -= TAU;
      if (target - this.angle > Math.PI) this.angle += TAU;
      this.angleVel += (-(this.angle - target) * 120 - this.angleVel * 14) * dt;
      this.angle += this.angleVel * dt;
    }
    this.arm.rotation = this.angle;
    // the arm goes behind him while the pick head is behind his hip
    const head = this.armPoint(ARM_TIP.x, ARM_TIP.y);
    const behind = head.x < this.pivot.x - 1;
    const idx = this.rig.getChildIndex(this.arm);
    if (behind && idx !== 0) this.rig.setChildIndex(this.arm, 0);
    if (!behind && idx === 0) this.rig.setChildIndex(this.arm, 1);

    // ---- body: hops, squash, idle bob --------------------------------------
    this.hopVel += 520 * dt;
    this.hop += this.hopVel * dt;
    if (this.hop > 0) {
      if (this.hopVel > 60 && !rm) this.squash = 0.1;
      this.hop = 0;
      this.hopVel = this.state === "victory" && this.t % 1.2 < 0.6 && !rm ? -80 : 0;
    }
    this.squash = approach(this.squash, 0, 14, dt);
    const bob = this.state === "idle" && !rm ? (Math.sin(this.t * 3) > 0.6 ? -1 : 0) : 0;
    this.lean = approach(this.lean, this.leanTarget, 6, dt);
    this.rig.y = Math.round(this.hop) + bob;
    this.rig.rotation = this.lean;
    this.rig.scale.set(1 + this.squash * 0.6, 1 - this.squash);

    // ---- face ---------------------------------------------------------------
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    let mood: FrameName = digging ? "focus" : "stand";
    if (this.blinkT < 0.12) mood = "blink";
    if (this.moodHold > 0) {
      this.moodHold -= dt;
      mood = this.holdMood;
    }
    this.mood = mood;

    // ---- headlamp: steady warm light, flashing red when time is low ----------
    // even on/off blink: 3 per second, a bit faster in the last 5 seconds
    if (this.urgent) {
      this.flashT += dt * (this.final5 ? 5 : 3);
      this.hot = this.flashT % 1 < 0.5;
    } else {
      this.flashT = 0;
      this.hot = false;
    }
    const set = this.tex[this.mood];
    this.body.texture = this.hot ? set.hot : set.cool;
    const g = this.glow.clear();
    const { x: lx, y: ly } = this.lampPoint;
    if (this.hot) {
      g.circle(lx, ly, 9).fill({ color: LAMP_HOT, alpha: 0.25 });
      g.circle(lx, ly, 5).fill({ color: LAMP_HOT, alpha: 0.45 });
    } else if (!this.urgent) {
      g.circle(lx, ly, 4).fill({ color: 0xfff7b0, alpha: 0.2 });
    }
  }
}
