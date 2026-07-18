import { describe, it, expect } from "vitest";
import { applyGender, isFemaleCaution } from "../gender";
import { calcGokaku, calcScore } from "../kumazaki";

describe("性別による吉凶差", () => {
  it("女性注意数（21,23,29,32,33,39）を判定する", () => {
    for (const n of [21, 23, 29, 32, 33, 39]) {
      expect(isFemaleCaution(n)).toBe(true);
    }
    expect(isFemaleCaution(24)).toBe(false);
  });

  it("女性の場合、注意数の大吉/吉は半吉に引き下げられ注記が付く", () => {
    const r = applyGender("daikichi", 33, "female");
    expect(r.category).toBe("hankichi");
    expect(r.caution).toBeTruthy();
  });

  it("男性・未指定では引き下げない", () => {
    expect(applyGender("daikichi", 33, "male").category).toBe("daikichi");
    expect(applyGender("daikichi", 33, "unspecified").category).toBe("daikichi");
  });

  it("凶はもともと下げないのでそのまま", () => {
    expect(applyGender("kyo", 33, "female").category).toBe("kyo");
  });

  it("性別でスコアが変わりうる（総格33画のケース）", () => {
    // 総格が33画になる姓名で、女性はスコアが下がる（総格の品質が下がるため）
    const g = calcGokaku({ sei: [10, 13], mei: [5, 5] }); // soukaku=33
    expect(g.soukaku).toBe(33);
    const male = calcScore(g, "male");
    const female = calcScore(g, "female");
    expect(female).toBeLessThan(male);
  });
});
