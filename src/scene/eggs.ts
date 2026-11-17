import type { Graphics } from "pixi.js";

// Things buried in the rock. Each level has its own set, so digging deeper
// turns up older and stranger finds. One character = one art pixel.

const PAL: Record<string, number> = {
  K: 0x1b1030, // ink
  B: 0xefe3c4, // bone
  b: 0xc9b58c,
  F: 0xb8a890, // fossil stone
  f: 0x8a7a62,
  W: 0x8a5a2b, // wood
  w: 0x5e3a1a,
  M: 0xa8a8b8, // metal
  m: 0x6a6a7a,
  Y: 0xffc928, // gold
  O: 0xc8643a, // terracotta
  o: 0x9a4424,
  s: 0x6b6070, // geode shell
  C: 0xc58cf0, // crystal
  c: 0x8a52c0,
  E: 0xee6a1f, // old robot orange
  e: 0xb54611,
  V: 0xf4e7cc, // visor
  L: 0xff6a1a, // lava
  l: 0xffc040,
  D: 0x2a1640, // dark opening
  G: 0x5ff0e0, // aqua gem
  g: 0x2fb3a6,
};

export interface Egg {
  name: string;
  rows: string[];
}

const BONE: Egg = { name: "bone", rows: [".KK....KK.", "KBBKKKKBBK", ".KBBBBBBK.", "KBBKKKKBBK", ".KK....KK."] };

const BOOT: Egg = {
  name: "boot",
  rows: ["..KKKKK...", "..KWWWK...", "..KWWWK...", "..KWWWK...", "..KWWWKKK.", ".KWWWWWWWK", "KWWWWWWWWK", "KwwwwwwwwK", "KKKKKKKKKK"],
};

const VASE: Egg = {
  name: "vase",
  rows: ["..KKKKK..", "...KOK...", "..KOOOK..", ".KOOOOOK.", "KOOoooOOK", "KOOOOOOOK", "KOoooooOK", "KOOOOOOOK", ".KOOOOOK.", "..KOOOK..", "..KKKKK.."],
};

const CHEST: Egg = {
  name: "chest",
  rows: [
    "..KKKKKKKKKK..",
    ".KWWWWWWWWWWK.",
    "KWWWWWWWWWWWWK",
    "KMMMMMMMMMMMMK",
    "KWWWWWKKWWWWWK",
    "KWWWWKYYKWWWWK",
    "KWWWWWKKWWWWWK",
    "KwwwwwwwwwwwwK",
    "KMMMMMMMMMMMMK",
    "KKKKKKKKKKKKKK",
  ],
};

const MINESHAFT: Egg = {
  name: "mineshaft",
  rows: [
    "KKKKKKKKKKKKKKKKKKKKKKKK",
    "KWWWWWWWWWWWWWWWWWWWWWWK",
    "KwwwwwwwwwwwwwwwwwwwwwwK",
    "KKWWKDDDDDDDDDDDDDDKWWKK",
    ".KWWKDDDDDDDDDDDDDDKWWK.",
    ".KWWKDDDDDDDDDDDDDDKWWK.",
    ".KWWKDDDDDKKKKKDDDDKWWK.",
    ".KWWKDDDDKMMMMMKDDDKWWK.",
    ".KWWKDDDDKmmmmmKDDDKWWK.",
    ".KWWKDDDDDKmDmKDDDDKWWK.",
    ".KWWKMMMMMMMMMMMMMMKWWK.",
    ".KwwKKKKKKKKKKKKKKKKwwK.",
  ],
};

const DINO_SKULL: Egg = {
  name: "dino skull",
  rows: [
    "......KKKKKKKKK.......",
    "....KKBBBBBBBBBKK.....",
    "...KBBBBKKBBBBBBBK....",
    "..KBBBBKbbKBBBBBBBKK..",
    ".KBBBBBBKKBBBBBBBBBBK.",
    "KBBBBBBBBBBBBBBBBBBBBK",
    "KBBKBKBKBKBKBBBBBBBBK.",
    ".KK.K.K.K.K.KBBBBBBK..",
    "..KBKBKBKBKBKBBBBBK...",
    "...KBBBBBBBBBBBBBK....",
    "....KKKKKKKKKKKKK.....",
  ],
};

const DINO_RIBS: Egg = {
  name: "dino ribs",
  rows: [
    "KKKKKKKKKKKKKKKKKKKK",
    "KBBBBBBBBBBBBBBBBBBK",
    "KKBKKBKKBKKBKKBKKBKK",
    ".KBK.KBK.KBK.KBK.KBK",
    ".KBK.KBK.KBK.KBK.KBK",
    "..KBK.KBK.KBK.KBK.K.",
    "...K...K...K...K....",
  ],
};

const TRILOBITE: Egg = {
  name: "trilobite",
  rows: ["..KKKKK..", ".KfFFFfK.", "KfFKFKFfK", "KKKKKKKKK", "KfFFFFFfK", "KKKKKKKKK", "KfFFFFFfK", "KKKKKKKKK", ".KfFFFfK.", "..KfFfK..", "...KKK..."],
};

const GEODE: Egg = {
  name: "geode",
  rows: [
    "....KKKKKK....",
    "..KKssssssKK..",
    ".KssKKKKKKssK.",
    "KssKCKCCKCKssK",
    "KsKCCcCCcCCKsK",
    "KsKCcCCCCcCKsK",
    "KsKCCCcCCCCKsK",
    "KssKCCCCCCKssK",
    ".KssKKKKKKssK.",
    "..KKssssssKK..",
    "....KKKKKK....",
  ],
};

const DEPOSIT: Egg = {
  name: "gem deposit",
  rows: [
    "...K......K.....",
    "..KGK....KCK....",
    ".KGgGK..KCcCK..K",
    ".KGgGK.KCCcCK.KG",
    "KGGggGKKCCccCKGg",
    "KssssssssssssssK",
    ".KKKKKKKKKKKKKK.",
  ],
};

const ROBOT: Egg = {
  name: "old robot",
  rows: [
    ".....KKKK.....",
    "....KYYYYK....",
    "...KKKKKKKK...",
    "..KEEEEEEEEK..",
    ".KEEEEEEEEEEK.",
    ".KEKKKKKKKKEK.",
    ".KEKVVKKVVKEK.",
    ".KEKKKKKKKKEK.",
    ".KEEEEEEEEEEK.",
    ".KeeeeeeeeeeK.",
    "..KKKKKKKKKK..",
    "....KMMMMK....",
    ".....KMMK.....",
    "......KK......",
  ],
};

const LAVA: Egg = {
  name: "lava pocket",
  rows: [
    "....KKKKKKKK....",
    "..KKLLLLLLLLKK..",
    ".KLLLlllLLLLLLK.",
    "KLLlllllllLLLLLK",
    "KLLLlllllLLLlLLK",
    ".KLLLLLLLLLLLLK.",
    "..KKLLLLLLLLKK..",
    "....KKKKKKKK....",
  ],
};

export const EGGS_BY_LEVEL: Egg[][] = [
  [BONE, BOOT, VASE, CHEST, MINESHAFT],
  [DINO_SKULL, DINO_RIBS, TRILOBITE, MINESHAFT, CHEST],
  [GEODE, DEPOSIT, ROBOT, LAVA, DEPOSIT],
];

export function eggSize(e: Egg) {
  return { w: e.rows[0].length, h: e.rows.length };
}

// draw at (x, y) top-left; u = screen pixels per art pixel
export function drawEgg(g: Graphics, e: Egg, x: number, y: number, u: number) {
  e.rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      const ch = row[c];
      if (ch === "." || PAL[ch] === undefined) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < row.length && row[c + run] === ch) run++;
      g.rect(Math.round(x + c * u), Math.round(y + r * u), run * u, u).fill(PAL[ch]);
      c += run;
    }
  });
}
