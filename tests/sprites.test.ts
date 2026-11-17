import { describe, expect, it } from "vitest";
import { FRAMES, PAL, PICK } from "../src/scene/minerSprites";

describe("miner sprites", () => {
  it("every frame is a clean 22x28 grid using known colors", () => {
    for (const [name, rows] of Object.entries(FRAMES)) {
      expect(rows, name).toHaveLength(28);
      for (const r of rows) {
        expect(r.length, `${name}: ${r}`).toBe(22);
        for (const c of r) expect(c === "." || c in PAL, `${name} uses ${c}`).toBe(true);
      }
    }
    for (const r of PICK) expect(r.length).toBe(14);
  });
});
