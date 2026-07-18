import { describe, it, expect } from "vitest";
import { calcGokaku, calcScore } from "../kumazaki";

describe("熊崎式 五格計算", () => {
  it("2文字姓＋2文字名（山田太郎: 3,5 / 4,9）を正しく計算する", () => {
    const g = calcGokaku({ sei: [3, 5], mei: [4, 9] });
    expect(g.tenkaku).toBe(8); // 姓合計 3+5
    expect(g.chikaku).toBe(13); // 名合計 4+9
    expect(g.jinkaku).toBe(9); // 姓末字5 + 名頭字4
    expect(g.soukaku).toBe(21); // 全合計 3+5+4+9
    expect(g.gaikaku).toBe(12); // 総格21 − 人格9（外字 山3+郎9）
  });

  it("外格＝外側の文字の和になる（2+2）", () => {
    const g = calcGokaku({ sei: [3, 5], mei: [4, 9] });
    expect(g.gaikaku).toBe(3 + 9);
  });

  it("1文字姓＋1文字名は霊数1を補い破綻しない（林一: 8 / 1）", () => {
    const g = calcGokaku({ sei: [8], mei: [1] });
    expect(g.tenkaku).toBe(9); // 8 + 霊数1
    expect(g.chikaku).toBe(2); // 1 + 霊数1
    expect(g.jinkaku).toBe(9); // 8 + 1（霊数なし）
    expect(g.soukaku).toBe(9); // 8 + 1（総格に霊数は含めない）
    expect(g.gaikaku).toBe(2); // 総格9 − 人格9 + 霊数(1+1)
  });

  it("1文字姓＋2文字名の霊数補正（姓のみ霊数）", () => {
    const g = calcGokaku({ sei: [8], mei: [3, 5] });
    expect(g.tenkaku).toBe(9); // 8 + 霊数1
    expect(g.chikaku).toBe(8); // 3+5（名は2文字なので霊数なし）
    expect(g.jinkaku).toBe(11); // 8 + 3
    expect(g.soukaku).toBe(16); // 8+3+5
    expect(g.gaikaku).toBe(6); // 16 − 11 + 霊数1 = 6（外字 霊数1 + 名末字5）
  });

  it("空の姓または名はエラー", () => {
    expect(() => calcGokaku({ sei: [], mei: [1] })).toThrow();
    expect(() => calcGokaku({ sei: [1], mei: [] })).toThrow();
  });
});

describe("スコア算出", () => {
  it("山田太郎のスコアは重み合成で65（ランクA相当）", () => {
    const g = calcGokaku({ sei: [3, 5], mei: [4, 9] });
    // jinkaku9=凶25, soukaku21=大吉100, chikaku13=大吉100, gaikaku12=凶25, tenkaku8=吉85
    // 25*.3 + 100*.25 + 100*.2 + 25*.15 + 85*.1 = 64.75 → 65
    expect(calcScore(g)).toBe(65);
  });

  it("スコアは0〜100の範囲に収まる", () => {
    const g = calcGokaku({ sei: [3, 5], mei: [4, 9] });
    const s = calcScore(g);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
