import type { DigResult } from "@/game/service/types";
import { tierOf, type Tier } from "@/game/rules/scoring";
import { GEM_FILL, GEM_ROWS } from "./art";

// Spoiler-free: points and gems, never answer names.

const EMOJI: Record<Tier["key"], string> = { copper: "🟫", gold: "🟨", diamond: "💎", ruby: "🟥", platinum: "⭐" };

// the address printed on the share text and card
export function siteName() {
  return process.env.NEXT_PUBLIC_SITE_NAME || "digly.io";
}

function bestGem(r: DigResult): Tier["key"] | null {
  const order: Tier["key"][] = ["platinum", "ruby", "diamond", "gold", "copper"];
  const all = r.levels.flatMap((l) => l.top.map((t) => tierOf(t).key));
  return order.find((k) => all.includes(k)) ?? null;
}

// the line under the score: how you compare, or what you dug up
export function subline(r: DigResult, beat: number | null) {
  if (beat !== null) return `Rarer than ${beat}% of diggers`;
  const c: Record<string, number> = {};
  for (const l of r.levels) for (const t of l.top) c[tierOf(t).key] = (c[tierOf(t).key] ?? 0) + 1;
  const parts = (["platinum", "ruby", "diamond", "gold"] as const).filter((k) => c[k]).map((k) => `${c[k]} ${k}`);
  if (parts.length) return parts.join(" · ");
  const finds = r.levels.reduce((n, l) => n + l.accepted.length, 0);
  return finds ? `${finds} find${finds === 1 ? "" : "s"}` : "Back tomorrow";
}

export function shareText(number: string, r: DigResult, beat: number | null, site = siteName()) {
  const head = `Digly ${number} ⛏️ ${r.total.toLocaleString()}${r.mode === "practice" ? " (practice)" : ""}`;
  const rows = r.levels.map((l) => `L${l.level} ${l.top.map((t) => EMOJI[tierOf(t).key]).join("") || "▫️"}`);
  const best = bestGem(r);
  const brag = beat !== null ? `Rarer than ${beat}% of diggers` : best === "platinum" ? "Found the Platinum" : null;
  return [head, ...(brag ? [brag] : []), ...rows, site].join("\n");
}

// 1080x1080 pixel card, drawn on a canvas.
export async function shareImage(number: string, r: DigResult, beat: number | null, site = siteName()): Promise<Blob | null> {
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
  const cream = "#fff4dc";

  // strata background
  const bands = ["#b5651d", "#d9822b", "#f0b24a", "#d2553a", "#9a4f8f", "#5b4fb0", "#3a4a9e", "#262f6e"];
  const bh = H / bands.length;
  bands.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, i * bh, W, bh + 1);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let x = 0; x < W; x += 48) g.fillRect(x + ((i * 17) % 48), i * bh + 8, 12, 12);
  });

  // panel
  const px = 84, py = 84, pw = W - 168, ph = H - 168, b = 12;
  g.fillStyle = "rgba(10,4,20,0.5)";
  g.fillRect(px + b, py + b * 2, pw, ph);
  g.fillStyle = ink;
  g.fillRect(px, py - b, pw, ph + b * 2);
  g.fillRect(px - b, py, pw + b * 2, ph);
  g.fillStyle = "#3a2256";
  g.fillRect(px, py, pw, ph);

  const display = (s: number) => `400 ${s}px 'Jersey 10', 'Pixelify Sans', monospace`;
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center") => {
    g.font = display(size);
    g.textAlign = align;
    g.fillStyle = color;
    g.fillText(s, x, y);
  };

  text(`DIGLY ${number}${r.mode === "practice" ? " · PRACTICE" : ""}`, W / 2, py + 96, 72, cream);
  // big score with a hard drop shadow
  const score = r.total.toLocaleString();
  text(score, W / 2 + 12, py + 312, 230, ink);
  text(score, W / 2, py + 300, 230, "#ffc928");
  text(subline(r, beat), W / 2, py + 384, 56, "#35c759");

  // one row per level: label, gems, points. Gems shrink to fit the widest row.
  const most = Math.max(1, ...r.levels.map((l) => l.top.length));
  const labelX = px + 56;
  const gemsX = px + 160;
  const ptsX = px + pw - 56;
  const room = ptsX - 150 - gemsX; // leave space for the points
  const s = Math.max(6, Math.min(11, Math.floor(room / most / 11.5))); // pixel size; a gem is 10 px wide
  const step = s * 11.5;
  const rowH = 128;
  const top = py + 440;
  r.levels.forEach((l, row) => {
    const oy = top + row * rowH;
    const mid = oy + (9 * s) / 2;
    g.textBaseline = "middle";
    text(`L${l.level}`, labelX, mid, 60, cream, "left");
    text(l.points.toLocaleString(), ptsX, mid, 60, "#ffc928", "right");
    g.textBaseline = "alphabetic";
    if (!l.top.length) {
      g.textBaseline = "middle";
      text("—", gemsX + 20, mid, 60, "#8a7fa6", "left");
      g.textBaseline = "alphabetic";
      return;
    }
    l.top.forEach((t, i) => {
      const key = tierOf(t).key;
      const col = GEM_FILL[key];
      const ox = Math.round(gemsX + i * step);
      GEM_ROWS[key].forEach((line, y) =>
        [...line].forEach((ch, x) => {
          const fill = ch === "K" ? ink : ch === "L" ? col.light : ch === "B" ? col.base : ch === "S" ? col.shade : null;
          if (!fill) return;
          g.fillStyle = fill;
          g.fillRect(ox + x * s, oy + y * s, s, s);
        }),
      );
    });
  });

  // footer
  g.fillStyle = "#2a1842";
  g.fillRect(px, py + ph - 92, pw, 92);
  text("Dig deep.", px + 48, py + ph - 30, 54, cream, "left");
  text(site, px + pw - 48, py + ph - 30, 54, "#ffc928", "right");

  return new Promise((res) => c.toBlob((bl) => res(bl), "image/png"));
}
