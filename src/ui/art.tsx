// Pixel art for the DOM layer, drawn from character grids with the same
// palette as the Pixi scene so both layers look like one game.

import type { Tier } from "@/game/rules/scoring";
import { PAL, PICK } from "@/scene/minerSprites";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function Pixels({
  rows,
  pal,
  size,
  className,
  title,
}: {
  rows: string[];
  pal: Record<string, string>;
  size?: number;
  className?: string;
  title?: string;
}) {
  const w = rows[0].length;
  const h = rows.length;
  const rects: React.ReactNode[] = [];
  rows.forEach((r, y) => {
    let x = 0;
    while (x < w) {
      const c = r[x];
      if (c === "." || !pal[c]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < w && r[x + run] === c) run++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={pal[c]} />);
      x += run;
    }
  });
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      width={size ? size * w : undefined}
      height={size ? size * h : undefined}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
}

const MINER_PAL: Record<string, string> = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hex(v)]));

export function PickaxeArt({ size = 3 }: { size?: number }) {
  return <Pixels rows={PICK} pal={MINER_PAL} size={size} />;
}

export function Logo() {
  return (
    <div className="logo" role="img" aria-label="Digly">
      <span aria-hidden>DIGLY</span>
      <span className="logo-pick" aria-hidden>
        <PickaxeArt size={3} />
      </span>
    </div>
  );
}

// ---- treasures --------------------------------------------------------------

export const GEM_FILL: Record<Tier["key"], { base: string; shade: string; light: string }> = {
  copper: { base: "#d9773a", shade: "#9a4a1e", light: "#ffb27a" },
  gold: { base: "#ffc928", shade: "#c98a00", light: "#fff0a0" },
  diamond: { base: "#9ff0ff", shade: "#4fb8d8", light: "#ffffff" },
  ruby: { base: "#e0304a", shade: "#8e1630", light: "#ff9aa8" },
  platinum: { base: "#e8ecf6", shade: "#9aa2c4", light: "#ffffff" },
};

// Same shapes as the Pixi treasures in Reveal.ts: nugget, coin, bar, round
// cut, brilliant cut. All 10x9 so they line up in lists.
export const GEM_ROWS: Record<Tier["key"], string[]> = {
  copper: [
    "..........",
    "...KKKK...",
    "..KLLBBK..",
    ".KLBBBBBK.",
    "KBBBBBBSSK",
    "KBBBBSSSSK",
    ".KBSSSSSK.",
    "..KKKKKK..",
    "..........",
  ],
  gold: [
    "..........",
    "..........",
    "..KKKKKK..",
    ".KLLLLLLK.",
    "KKKKKKKKKK",
    "KBBBBBBBSK",
    "KBSSSSSBSK",
    "KKKKKKKKKK",
    "..........",
  ],
  platinum: [
    "....KK....",
    "...KLLK...",
    "KKKKLBKKKK",
    "KLLBBBBBSK",
    ".KBBBBBSK.",
    "..KBBBBK..",
    ".KBBKKBSK.",
    "KBSK..KSSK",
    "KKK....KKK",
  ],
  // round cut, like the ruby in the Pixi reveal
  ruby: [
    "..KKKKKK..",
    ".KLLBBBBK.",
    "KLLLBBBBSK",
    "KLLBBBBBSK",
    "KBBBBBBSSK",
    "KBBBBBSSSK",
    ".KBBSSSSK.",
    "..KKKKKK..",
    "..........",
  ],
  diamond: [
    "..KKKKKK..",
    ".KLLBBBBK.",
    "KLLBBBBSSK",
    "KKKKKKKKKK",
    ".KBBBBBSK.",
    "..KBBBSK..",
    "...KBSK...",
    "....KK....",
    "..........",
  ],
};

export function GemIcon({ tier, size = 3 }: { tier: Tier["key"]; size?: number }) {
  const c = GEM_FILL[tier];
  return <Pixels rows={GEM_ROWS[tier]} pal={{ K: "#1b1030", L: c.light, B: c.base, S: c.shade }} size={size} title={undefined} />;
}

// neutral ore nugget: every correct answer looks the same during play
const ORE_ROWS = [".KKKK.", "KWccdK", "KccddK", "KcdddK", ".KKKK."];
export function OreIcon({ size = 3 }: { size?: number }) {
  return <Pixels rows={ORE_ROWS} pal={{ K: "#1b1030", W: "#fff4dc", c: "#d9822b", d: "#a85d17" }} size={size} />;
}

// ---- workshop icons ---------------------------------------------------------

const UI_PAL: Record<string, string> = {
  K: "#1b1030",
  Y: "#ffd23f",
  y: "#e09a00",
  O: "#ff6b2c",
  B: "#2f8fff",
  G: "#2fd16a",
  P: "#b04dff",
  W: "#ffffff",
  N: "#9c5a2c",
  n: "#6b3b1c",
  S: "#c9ccd6",
  s: "#8b8fa0",
  R: "#ff4a3d",
};

const ICONS: Record<string, string[]> = {
  board: [
    "......KKK.......",
    ".....KYYYK......",
    ".....KYyYK......",
    "......KKK.......",
    "......KYK.......",
    ".....KKKKK......",
    ".....KYYYK......",
    "KKKKKKYYYKKKKK..",
    "KSSSSKYYYKOOOOK.",
    "KSSSSKYYYKOOOOK.",
    "KSSSSKYYYKOOOOK.",
    "KsssssyyyyOOOOK.",
    "KKKKKKKKKKKKKKK.",
  ],
  vault: [
    "...KKKKKKKKKK...",
    "..KNNNNNNNNNNK..",
    ".KNNNNNNNNNNNNK.",
    ".KnnnnnnnnnnnnK.",
    "KKKKKKKKKKKKKKKK",
    "KNNNNNNKKNNNNNNK",
    "KNNNNNKYYKNNNNNK",
    "KNNNNNKYyKNNNNNK",
    "KnnnnnnKKnnnnnnK",
    "KNNNNNNNNNNNNNNK",
    "KnnnnnnnnnnnnnnK",
    "KKKKKKKKKKKKKKKK",
  ],
  log: [
    "KKKKKKKKKKKKK...",
    "KBBKWWWWWWWWWK..",
    "KBBKWKKKKKKWWK..",
    "KBBKWWWWWWWWWK..",
    "KBBKWKKKKKWWWK..",
    "KBBKWWWWWWWWWK..",
    "KBBKWKKKKKKWWK..",
    "KBBKWWWWWWWWWK..",
    "KBBKWWWWWRWWWK..",
    "KBBKWWWWWRWWWK..",
    "KBBKKKKKKRKKKK..",
    "KKKK.....R......",
  ],
  gear: [
    ".....KKKK.......",
    "..KK.KSSK.KK....",
    ".KSSKKSSKKSSK...",
    ".KSSSSSSSSSSK...",
    "..KSSSKKSSSK....",
    "KKKSSK..KSSKKK..",
    "KSSSSK..KSSSSK..",
    "KKKSSK..KSSKKK..",
    "..KSSSKKSSSK....",
    ".KSSSSSSSSsSK...",
    ".KSSKKSSKKssK...",
    "..KK.KSSK.KK....",
    ".....KKKK.......",
  ],
  cart: [
    "...KKK..KKK.....",
    "..KYYYKKOOOK....",
    "KKKKKKKKKKKKKK..",
    "KNNNNNNNNNNNNK..",
    ".KNNNNNNNNNNK...",
    ".KnnnnnnnnnnK...",
    "..KKKKKKKKKK....",
    "..KSK....KSK....",
    "...K......K.....",
  ],
  lamp: [
    "...KKKK...",
    "..KYYYYK..",
    ".KYYKKYYK.",
    ".KYKWWKYK.",
    ".KYKWWKYK.",
    "KKKKKKKKKK",
    "KyyyyyyyyK",
    "KKKKKKKKKK",
  ],
};

export function Icon({ name, size = 3 }: { name: keyof typeof ICONS; size?: number }) {
  return <Pixels rows={ICONS[name]} pal={UI_PAL} size={size} />;
}

export function CheckMark() {
  return <Pixels rows={["......K", ".....KK", "K...KK.", "KK.KK..", ".KKK...", "..K...."]} pal={{ K: "currentColor" }} size={2} />;
}
