import { describe, it, expect } from "vitest";
import { wuxingOf, relationOf, calcSansai } from "../sansai";

describe("三才・五行", () => {
  it("画数の一の位から五行を決める", () => {
    expect(wuxingOf(1)).toBe("wood");
    expect(wuxingOf(12)).toBe("wood");
    expect(wuxingOf(3)).toBe("fire");
    expect(wuxingOf(5)).toBe("earth");
    expect(wuxingOf(8)).toBe("metal");
    expect(wuxingOf(9)).toBe("water");
    expect(wuxingOf(10)).toBe("water"); // 0
  });

  it("相生・相剋・比和を判定する", () => {
    expect(relationOf("wood", "fire")).toBe("相生"); // 木生火
    expect(relationOf("wood", "earth")).toBe("相剋"); // 木剋土
    expect(relationOf("water", "water")).toBe("比和");
  });

  it("三才配置と五行サマリを返す", () => {
    // 天3(火) 人5(土) 地7(金): 火生土=相生, 土生金=相生 → 大吉
    const { sansai, wuxing } = calcSansai(3, 5, 7);
    expect(sansai.tenLabel).toBe("火");
    expect(sansai.jinLabel).toBe("土");
    expect(sansai.chiLabel).toBe("金");
    expect(sansai.relationTenJin).toBe("相生");
    expect(sansai.relationJinChi).toBe("相生");
    expect(sansai.category).toBe("daikichi");
    expect(wuxing.fire + wuxing.earth + wuxing.metal).toBe(3);
    expect(wuxing.lacking).toContain("wood");
    expect(wuxing.lacking).toContain("water");
  });
});
