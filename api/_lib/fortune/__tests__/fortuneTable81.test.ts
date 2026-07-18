import { describe, it, expect } from "vitest";
import {
  FORTUNE_TABLE_81,
  reduceTo81,
  categoryOf,
  qualityOf,
} from "../fortuneTable81";

describe("81画吉凶テーブル", () => {
  it("1〜81 のすべてに分類が存在する（抜け漏れなし）", () => {
    for (let n = 1; n <= 81; n++) {
      expect(FORTUNE_TABLE_81[n], `画数 ${n} が未定義`).toBeDefined();
    }
    expect(Object.keys(FORTUNE_TABLE_81).length).toBe(81);
  });

  it("81画還元（reduceTo81）", () => {
    expect(reduceTo81(81)).toBe(81);
    expect(reduceTo81(82)).toBe(2);
    expect(reduceTo81(100)).toBe(20);
    expect(reduceTo81(161)).toBe(81);
    expect(reduceTo81(5)).toBe(5);
  });

  it("categoryOf / qualityOf が還元後の値を返す", () => {
    // 82 は 2 に還元され、2 は凶(25)
    expect(categoryOf(82)).toBe(FORTUNE_TABLE_81[2]);
    expect(qualityOf(82)).toBe(qualityOf(2));
  });

  it("代表値：1=大吉(100), 2=凶(25)", () => {
    expect(qualityOf(1)).toBe(100);
    expect(qualityOf(2)).toBe(25);
  });
});
