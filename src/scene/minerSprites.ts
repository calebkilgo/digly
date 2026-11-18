// Digly the miner, side view facing right, hand-placed pixel by pixel.
// One character = one pixel.
//   Z helmet shine  Y helmet  y helmet shade  e lamp housing  L headlamp
//   R hair  S skin  s skin shade  K eye  O shirt  o shirt shade
//   T overalls  t overalls shade  B button  N boots  n boot shade
//   (no arms: the pickaxe floats and circles his waist)
//   H handle  q handle shade  h handle cap  W steel shine  G steel  g steel dark  m steel mid

export const MPAL: Record<string, number> = {
  Z: 0xffe36a,
  Y: 0xf5c518,
  y: 0xd19a0a,
  e: 0xc9a227,
  L: 0xfff7b8,
  R: 0x5a3320,
  S: 0xf3bb8c,
  s: 0xd49467,
  K: 0x231440,
  O: 0xec7430,
  o: 0xbd5018,
  T: 0x3070d8,
  t: 0x2150a5,
  B: 0xf5c518,
  N: 0x6a3a1d,
  n: 0x4a2610,
  H: 0xa8692f,
  q: 0x7a4a20,
  h: 0x5e3a18,
  W: 0xe6edf5,
  G: 0xb8c4d3,
  g: 0x56637a,
  m: 0x7e8ca2,
};

export const LAMP_HOT = 0xff3b30;
export const SPR_W = 14;
export const SPR_H = 27;
// the root sits between his boots, this many pixels from the sprite's left edge
export const FEET_X = 4;

const BODY = [
  ".ZZZZZZZ......",
  "yYYYYYYYY.....",
  "yYYYYYYYeLL...",
  "yYYYYYYYeee...",
  "yyyyyyyyyyyy..",
  ".RRRSSSS......",
  "RRRRSSRRS.....",
  "RSSsSSKSs.....",
  "RSSsSSSs......",
  "RsssSSSS......",
  ".oOTTOOo......",
  ".oOTTOOo......",
  ".oTTTTTo......",
  ".oTBTTTo......",
  ".tTTTTTt......",
  ".tTTTTTt......",
  ".tTTTTTt......",
  ".tTTTTTt......",
  ".tTTTTTt......",
  ".tttTTT.......",
  ".tttTTT.......",
  ".tttTTT.......",
  ".tttTTT.......",
  ".tttTTT.......",
  ".tttTTT.......",
  "nnnNNNNN......",
  "nnnNNNNN......",
];

function face(rows: Record<number, string>): string[] {
  return BODY.map((r, i) => rows[i] ?? r);
}

export const FRAMES = {
  stand: BODY,
  blink: face({ 7: "RSSsSSSSs....." }),
  focus: face({ 6: "RRRRSSSRS.....", 7: "RSSsSSKRs....." }),
  happy: face({ 6: "RRRRSSKKS.....", 7: "RSSsSSSSs....." }),
  oops: face({ 6: "RRRRSRRSS.....", 7: "RSSsSSKSs.....", 8: "RSSsSSKs......" }),
} satisfies Record<string, string[]>;

export type FrameName = keyof typeof FRAMES;

// The pickaxe on its own (he has no arms): it circles around his front hip.
export const ARM = [
  ".....hh.....",
  ".....Hq.....",
  ".....Hq.....",
  ".....Hq.....",
  ".....Hq.....",
  ".....Hq.....",
  ".....Hq.....",
  ".....Hq.....",
  "W....Gg....W",
  "mW...gg...Wm",
  ".mWW.gg.WWm.",
  "..mmWGGWmm..",
  "....mmmm....",
];
// where ARM's top-left corner sits on the body, in body pixels
export const ARM_AT = { x: 6.5, y: 14.5 }; // puts the pivot on his front hip, at body pixel (7, 18)
// the pivot (his front hip) and the pick's striking point, in ARM pixels
export const ARM_PIVOT = { x: 0.5, y: 3.5 };
export const ARM_TIP = { x: 6, y: 12.5 };

// ---- the old front-facing pickaxe, still used by the logo in the UI --------

export const PAL: Record<string, number> = {
  K: 0x1b1030,
  G: 0xd6d6e4,
  g: 0x8a8aa6,
  H: 0xc0782f,
  h: 0x85491a,
};

export const PICK = [
  "...KKKKKKKK...",
  ".KKGGGGGGGGKK.",
  "KGGGgKHHKgGGGK",
  "KGgKKKHHKKKgGK",
  "KgK..KHHK..KgK",
  ".K...KHHK...K.",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KHhK.....",
  ".....KKKK.....",
];
