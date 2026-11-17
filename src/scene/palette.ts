// Bright, saturated, chunky. The scene renders at low resolution and is
// scaled up with nearest-neighbor, so every shape lands on a pixel grid.
// PX = screen pixels per art pixel. Outlines are always one art pixel.

export let PX = 4;
export function setPX(v: number) {
  PX = v;
}
export const lw = (n = 1) => n * PX;

export const INK = 0x1b1030;

// Strata from the surface down. Each band: base, shade, fleck.
export const STRATA: { base: number; shade: number; fleck: number }[] = [
  { base: 0xb5651d, shade: 0x8a4512, fleck: 0xd98a3a }, // topsoil
  { base: 0xd9822b, shade: 0xa85d17, fleck: 0xf2a94e }, // clay
  { base: 0xf0b24a, shade: 0xc4862a, fleck: 0xffd27a }, // sandstone
  { base: 0xd2553a, shade: 0xa13a26, fleck: 0xf07a5a }, // red rock
  { base: 0x9a4f8f, shade: 0x733668, fleck: 0xc274b5 }, // magenta shale
  { base: 0x5b4fb0, shade: 0x413886, fleck: 0x7e72d6 }, // violet stone
  { base: 0x3a4a9e, shade: 0x293676, fleck: 0x5a6ccc }, // blue deep
  { base: 0x262f6e, shade: 0x1a2150, fleck: 0x3c4a99 }, // abyss
];

export const CAVE = {
  back: 0x2a1640,
  backDetail: 0x3a2256,
  rim: 0x1b1030,
  lantern: 0xffd23f,
};

export const CRYSTALS = [0x5ff0e0, 0xff7ae0, 0xffe14a, 0x7ab8ff];

// The treasure ladder: copper, silver, gold, ruby, diamond. Each has its own
// shape so the rank reads even without color.
export const GEM: Record<string, { base: number; shade: number; light: number }> = {
  copper: { base: 0xd9773a, shade: 0x9a4a1e, light: 0xffb27a },
  silver: { base: 0xc8ccd8, shade: 0x868aa0, light: 0xffffff },
  gold: { base: 0xffc928, shade: 0xc98a00, light: 0xfff0a0 },
  ruby: { base: 0xe0304a, shade: 0x8e1630, light: 0xff9aa8 },
  diamond: { base: 0x9ff0ff, shade: 0x4fb8d8, light: 0xffffff },
  platinum: { base: 0xe8ecf6, shade: 0x9aa2c4, light: 0xffffff },
};

export const ROCK = { base: 0x9a8f98, shade: 0x6b6070, light: 0xc4bcc4 };
