// Digly the miner, hand-placed pixel by pixel. One character = one pixel.
//   K ink   Y helmet   y helmet shade   L headlamp   S skin   s skin shade
//   O shirt   o shirt shade   T overalls   t overalls shade   N boots
//   M mouth   W white   G steel   g steel shade   H handle   h handle shade

export const PAL: Record<string, number> = {
  K: 0x1b1030,
  Y: 0xffd23f,
  y: 0xe09a00,
  L: 0xfff7b0,
  S: 0xffc58f,
  s: 0xe0956a,
  O: 0xff6b2c,
  o: 0xc9461a,
  T: 0x2f8fe8,
  t: 0x1d5fb0,
  N: 0x7a4122,
  M: 0x8a3a2a,
  W: 0xffffff,
  G: 0xd6d6e4,
  g: 0x8a8aa6,
  H: 0xc0782f,
  h: 0x85491a,
};

export const LAMP_HOT = 0xff3b30;
export const SPR_W = 22;
export const SPR_H = 28;

const BODY = [
  ".......KKKKKKKK.......",
  ".....KKYYYYYYYYKK.....",
  "....KYYYYYKKYYYYYK....",
  "...KYYYYYKLLKYYYYYK...",
  "...KYYYYYKLLKYYYYYK...",
  "..KYYYYYYYKKYYYYYYyK..",
  "..KyYYYYYYYYYYYYYyyK..",
  ".KKKKKKKKKKKKKKKKKKKK.",
  ".KyyyyyyyyyyyyyyyyyyK.",
  "...KssssssssssssssK...",
  "...KSSSSSSSSSSSSSSK...",
  "...KSSKKSSSSSSKKSSK...",
  "...KSSSKKSSSSKKSSSK...",
  "...KSSSSSSssSSSSSSK...",
  "...KsSSSSSSSSSSSSsK...",
  "....KsSSSKKKKSSSsK....",
  ".....KKssssssssKK.....",
  "....KOOKKKKKKKKOOK....",
  "...KOOOTKOOOOKTOOOK...",
  "..KOOOOTTTTTTTTOOOOK..",
  "..KSKOOTTTTTTTTOOKSK..",
  "..KSKoOTTTKKTTTOoKSK..",
  "...KK.KTTTTTTTTK.KK...",
  "......KTTTTTTTTK......",
  "......KTTTttTTTK......",
  "......KTTTKKTTTK......",
  ".....KNNNNKKNNNNK.....",
  ".....KKKKKK.KKKKK.....",
];

function face(rows: Record<number, string>): string[] {
  return BODY.map((r, i) => rows[i] ?? r);
}

export const FRAMES = {
  stand: BODY,
  blink: face({ 12: "...KSSSssSSSSssSSSK..." }),
  focus: face({ 11: "...KSSSKKSSSSKKSSSK...", 12: "...KSSSKKSSSSKKSSSK..." }),
  happy: face({ 15: "....KsSSKSSSSKSSsK....", 16: ".....KKssKKKKssKK....." }),
  oops: face({ 11: "...KSKKSSSSSSSSKKSK...", 15: "....KsSSSSKKSSSSsK....", 16: ".....KKsssKKsssKK....." }),
} satisfies Record<string, string[]>;

export type FrameName = keyof typeof FRAMES;

// where the pickaxe handle sits in the right hand, in body pixels
export const HAND = { x: 18.5, y: 21 };

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
export const PICK_GRIP = { x: 7, y: 13.5 };
export const PICK_TIP = { x: -6, y: -10 };
