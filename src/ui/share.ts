import type { DigResult } from "@/game/service/types";
import { tierFor } from "@/game/rules/scoring";
import { GEM_FILL } from "./art";

// Spoiler-free: numbers and treasure ranks, never answer names.
export function shareText(number: string, r: DigResult, beat: number | null) {
  const lines = r.levels.map((l) => `L${l.level} ${l.top.map((t) => tierFor(t.rarity).label).join(" · ") || "nothing"}`);
  return [
    `DIGLY ${number}${r.mode === "practice" ? " (practice)" : ""}`,
    `${r.total.toLocaleString()} points`,
    ...(beat !== null ? [`Rarer than ${beat}% of diggers`] : []),
    ...lines,
    "Dig deep. digly.io",
  ].join("\n");
}

const ROWS: Record<string, string[]> = {
  copper: ["..........", "...KKKK...", "..KLLBBK..", ".KLBBBBBK.", "KBBBBBBSSK", "KBBBBSSSSK", ".KBSSSSSK.", "..KKKKKK..", ".........."],
  silver: ["...KKKK...", "..KLLBBK..", ".KLBBBBBK.", "KBBBSSBBSK", "KBBBSSBBSK", "KBBBSSBBSK", ".KBBBBBSK.", "..KSSSSK..", "...KKKK..."],
  gold: ["..........", "..........", "..KKKKKK..", ".KLLLLLLK.", "KKKKKKKKKK", "KBBBBBBBSK", "KBSSSSSBSK", "KKKKKKKKKK", ".........."],
  ruby: ["..KKKKKK..", ".KLLBBBSK.", "KLLLLBBBSK", "KLLBBBBBSK", "KBBBBBBSSK", "KBBBBBSSSK", ".KBBSSSSK.", "..KKKKKK..", ".........."],
  diamond: ["..KKKKKK..", ".KLLBBBBK.", "KLLBBBBSSK", "KKKKKKKKKK", ".KBBBBBSK.", "..KBBBSK..", "...KBSK...", "....KK....", ".........."],
};

// Pixel-style share card drawn on a canvas.
export async function shareImage(number: string, r: DigResult, beat: number | null): Promise<Blob | null> {
  try {
    await document.fonts.load("400 40px 'Jersey 10'");
    await document.fonts.load("700 40px 'Pixelify Sans'");
  } catch {
    // draw anyway
  }
  const W = 1080, H = 1080;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  const ink = "#1b1030";
  const bands = ["#b5651d", "#d9822b", "#f0b24a", "#d2553a", "#9a4f8f", "#5b4fb0", "#3a4a9e", "#262f6e"];
  const bh = H / bands.length;
  bands.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, i * bh, W, bh + 1);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let x = 0; x < W; x += 48) g.fillRect(x + ((i * 17) % 48), i * bh + 8, 12, 12);
  });
  const px = 120, py = 110, pw = 840, ph = 860, b = 12;
  g.fillStyle = "rgba(10,4,20,0.5)";
  g.fillRect(px, py + b * 2, pw, ph);
  g.fillStyle = ink;
  g.fillRect(px, py - b, pw, ph + b * 2);
  g.fillRect(px - b, py, pw + b * 2, ph);
  g.fillStyle = "#3a2256";
  g.fillRect(px, py, pw, ph);
  g.textAlign = "center";
  const display = (s: number) => `400 ${s}px 'Jersey 10', 'Pixelify Sans', monospace`;
  g.fillStyle = "#fff4dc";
  g.font = display(80);
  g.fillText(`DIGLY ${number}`, W / 2, py + 110);
  g.font = display(250);
  g.fillStyle = ink;
  g.fillText(r.total.toLocaleString(), W / 2 + 12, py + 330 + 12);
  g.fillStyle = "#ffc928";
  g.fillText(r.total.toLocaleString(), W / 2, py + 330);
  g.font = display(64);
  g.fillStyle = "#35c759";
  g.fillText(beat !== null ? `Rarer than ${beat}% of diggers` : "Dig deep.", W / 2, py + 420);
  const s = 12;
  r.levels.forEach((l, row) => {
    const oy = py + 470 + row * 110;
    g.fillStyle = "#fff4dc";
    g.font = display(56);
    g.textAlign = "left";
    g.fillText(`L${l.level}`, px + 150, oy + 80);
    l.top.forEach((t, i) => {
      const col = GEM_FILL[tierFor(t.rarity).key];
      const ox = px + 290 + i * 150;
      ROWS[tierFor(t.rarity).key].forEach((line, y) =>
        [...line].forEach((ch, x) => {
          const fill = ch === "K" ? ink : ch === "L" ? col.light : ch === "B" ? col.base : ch === "S" ? col.shade : null;
          if (!fill) return;
          g.fillStyle = fill;
          g.fillRect(ox + x * s, oy + y * s, s, s);
        }),
      );
    });
  });
  g.textAlign = "center";
  g.font = display(56);
  g.fillStyle = "#fff4dc";
  g.fillText("Dig deep. digly.io", W / 2, py + 820);
  return new Promise((res) => c.toBlob((bl) => res(bl), "image/png"));
}
