import { describe, it, expect } from "vitest";
import { scoreToRank } from "../score";

describe("スコア→ランク変換（境界値）", () => {
  it("SS/S 境界（90/89）", () => {
    expect(scoreToRank(90)).toBe("SS");
    expect(scoreToRank(89)).toBe("S");
  });
  it("S/A 境界（80/79）", () => {
    expect(scoreToRank(80)).toBe("S");
    expect(scoreToRank(79)).toBe("A");
  });
  it("A/B 境界（65/64）", () => {
    expect(scoreToRank(65)).toBe("A");
    expect(scoreToRank(64)).toBe("B");
  });
  it("B/C 境界（50/49）", () => {
    expect(scoreToRank(50)).toBe("B");
    expect(scoreToRank(49)).toBe("C");
  });
  it("下限・上限", () => {
    expect(scoreToRank(0)).toBe("C");
    expect(scoreToRank(100)).toBe("SS");
  });
});
