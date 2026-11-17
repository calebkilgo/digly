import type { Graphics } from "pixi.js";

// 3x5 bitmap font drawn as solid rects on the art grid, so world labels are
// as crisp as the sprites (canvas text blurs when the scene is scaled up).
const G: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  " ": "000000000000000", "-": "000000111000000", x: "000101010101000", ".": "000000000000010",
};

export function textWidth(text: string, s: number) {
  return text.length * 4 * s - s;
}

// s = art pixels per font pixel; u = screen pixels per art pixel
export function drawPixelText(g: Graphics, text: string, x: number, y: number, s: number, u: number, color: number, ink: number) {
  const px = s * u;
  const glyphs = [...text].map((c) => G[c] ?? G[c.toUpperCase()] ?? G[" "]);
  // outline first: every lit pixel stamped one font pixel around in ink
  for (const pass of [0, 1]) {
    glyphs.forEach((bits, i) => {
      const ox = x + i * 4 * px;
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++) {
          if (bits[r * 3 + c] !== "1") continue;
          if (pass === 0) g.rect(ox + (c - 1) * px, y + (r - 1) * px, px * 3, px * 3).fill(ink);
          else g.rect(ox + c * px, y + r * px, px, px).fill(color);
        }
    });
  }
}
