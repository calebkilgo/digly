import { describe, expect, it } from "vitest";
import { ARM, FRAMES, MPAL, PAL, PICK, SPR_H, SPR_W } from "../src/scene/minerSprites";

describe("miner sprites", () => {
  it("every frame is a clean grid using known colors", () => {
    for (const [name, rows] of Object.entries(FRAMES)) {
      expect(rows, name).toHaveLength(SPR_H);
      for (const r of rows) {
        expect(r.length, `${name}: ${r}`).toBe(SPR_W);
        for (const c of r) expect(c === "." || c in MPAL, `${name} uses ${c}`).toBe(true);
      }
    }
    for (const r of ARM) {
      expect(r.length).toBe(ARM[0].length);
      for (const c of r) expect(c === "." || c in MPAL).toBe(true);
    }
    for (const r of PICK) {
      expect(r.length).toBe(14);
      for (const c of r) expect(c === "." || c in PAL).toBe(true);
    }
  });
});
