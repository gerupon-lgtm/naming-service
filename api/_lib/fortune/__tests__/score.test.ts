import { describe, it, expect } from "vitest";
import { scoreToRank, RANK_THRESHOLDS } from "../score";

describe("スコア→総合ランク変換（6段階・境界値）", () => {
  it("大吉/吉 境界（90/89）", () => {
    expect(scoreToRank(90)).toBe("大吉");
    expect(scoreToRank(89)).toBe("吉");
  });
  it("吉/中吉 境界（76/75）", () => {
    expect(scoreToRank(76)).toBe("吉");
    expect(scoreToRank(75)).toBe("中吉");
  });
  it("中吉/小吉 境界（62/61）", () => {
    expect(scoreToRank(62)).toBe("中吉");
    expect(scoreToRank(61)).toBe("小吉");
  });
  it("小吉/末吉 境界（48/47）", () => {
    expect(scoreToRank(48)).toBe("小吉");
    expect(scoreToRank(47)).toBe("末吉");
  });
  it("末吉/凶 境界（34/33）", () => {
    expect(scoreToRank(34)).toBe("末吉");
    expect(scoreToRank(33)).toBe("凶");
  });
  it("下限・上限", () => {
    expect(scoreToRank(0)).toBe("凶");
    expect(scoreToRank(100)).toBe("大吉");
  });
  it("閾値は上から降順（設定値化）", () => {
    const mins = RANK_THRESHOLDS.map((r) => r.min);
    for (let i = 1; i < mins.length; i++) {
      expect(mins[i]).toBeLessThan(mins[i - 1]);
    }
    expect(RANK_THRESHOLDS[0].rank).toBe("大吉");
    expect(RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1].rank).toBe("凶");
  });
});
