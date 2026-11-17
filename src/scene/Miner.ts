import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { FRAMES, HAND, LAMP_HOT, PAL, PICK, PICK_GRIP, PICK_TIP, SPR_H, SPR_W, type FrameName } from "./minerSprites";
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
      const v = swap?.[ch] ?? PAL[ch];
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

const REST = 0.35;
const WINDUP = -0.25;
const STRIKE = 2.35;
const PLANTED = 2.75;

// Digly the miner. Units inside are sprite pixels; the scene scales the root
// so one sprite pixel is one screen "art pixel". Origin is between his boots.
export class Miner {
  readonly root = new Container();
  private rig = new Container();
  private body: Sprite;
  private pick: Sprite;
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

  constructor() {
    for (const [name, rows] of Object.entries(FRAMES)) {
      this.tex[name] = { cool: textureFrom(rows), hot: textureFrom(rows, { L: LAMP_HOT }) };
    }
    this.body = new Sprite(this.tex.stand.cool);
    this.body.anchor.set(0.5, 1);
    this.pick = new Sprite(textureFrom(PICK));
    this.pick.anchor.set(PICK_GRIP.x / 14, PICK_GRIP.y / 16);
    this.rig.addChild(this.pick, this.body, this.glow);
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
  readonly lampPoint = { x: 0, y: 3.5 - SPR_H };

  private setMood(m: FrameName, hold: number) {
    this.holdMood = m;
    this.moodHold = hold;
  }

  private pickTip() {
    const a = this.pick.rotation;
    const x = PICK_TIP.x * Math.cos(a) - PICK_TIP.y * Math.sin(a);
    const y = PICK_TIP.x * Math.sin(a) + PICK_TIP.y * Math.cos(a);
    return { x: this.pick.x + x, y: this.pick.y + y };
  }

  update(dt: number) {
    this.t += dt;
    const rm = this.reducedMotion;
    const digging = this.state === "drill" || this.state === "rev";

    // ---- the swing ---------------------------------------------------------
    let target = REST;
    if (digging) {
      const period = this.urgent ? 0.34 : 0.5;
      this.swingT += dt / period;
      if (this.forceStrike) {
        // jump straight to the downswing
        if (this.swingT % 1 < 0.55) this.swingT = Math.floor(this.swingT) + 0.55;
        this.forceStrike = false;
      }
      const p = this.swingT % 1;
      if (p < 0.55) {
        const k = p / 0.55;
        target = STRIKE + (WINDUP - STRIKE) * (1 - Math.pow(1 - k, 2));
      } else if (p < 0.72) {
        const k = (p - 0.55) / 0.17;
        target = WINDUP + (STRIKE - WINDUP) * k * k;
      } else {
        target = STRIKE;
      }
      const prev = (this.swingT - dt / period) % 1;
      if (prev < 0.72 && p >= 0.72) {
        const tip = this.pickTip();
        this.squash = rm ? 0 : 0.08 * this.power;
        this.onStrike?.(tip.x, tip.y, this.power);
        this.power = 1;
      }
      this.angle = target;
      this.angleVel = 0;
    } else {
      if (this.state === "winddown" || this.state === "watch") target = PLANTED;
      if (this.state === "victory") target = WINDUP - 0.25 + Math.sin(this.t * 10) * 0.25;
      // springy settle toward the pose
      this.angleVel += (-(this.angle - target) * 120 - this.angleVel * 14) * dt;
      this.angle += this.angleVel * dt;
    }
    if (digging && this.angleVel !== 0) this.angleVel = 0;

    // pick pivots at the hand, lifted when raised so it clears the helmet
    const raised = clamp((STRIKE - this.angle) / (STRIKE - WINDUP), 0, 1);
    this.pick.rotation = this.angle;
    this.pick.position.set(Math.round(HAND.x - SPR_W / 2), Math.round(HAND.y - SPR_H - raised * 6));
    // raised pick goes behind his head, striking pick comes in front
    const behind = this.angle < 1.2;
    const idx = this.rig.getChildIndex(this.pick);
    if (behind && idx !== 0) this.rig.setChildIndex(this.pick, 0);
    if (!behind && idx === 0) this.rig.setChildIndex(this.pick, 1);

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
    this.body.scale.set(1 + this.squash * 0.6, 1 - this.squash);

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
    const lx = this.lampPoint.x;
    const ly = this.lampPoint.y + this.rig.y * 0;
    if (this.hot) {
      g.circle(lx, ly, 10).fill({ color: LAMP_HOT, alpha: 0.25 });
      g.circle(lx, ly, 6).fill({ color: LAMP_HOT, alpha: 0.45 });
    } else if (!this.urgent) {
      g.circle(lx, ly, 5).fill({ color: 0xfff7b0, alpha: 0.18 });
    }
  }
}
