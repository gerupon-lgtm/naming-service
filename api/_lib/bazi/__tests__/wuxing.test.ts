import { describe, it, expect } from "vitest";
import {
  calcWuxingBalance,
  calcWuxingBonus,
  decideTargetElements,
  judgeBonusLevel,
} from "../wuxing";
import { buildMeishiki } from "../meishiki";
import {
  judgeStrength,
  elementThatGenerates,
  elementGeneratedBy,
  elementControlledBy,
  elementThatControls,
} from "../strength";
import type { Wuxing } from "../types";

// ============================================================
//  用神論（⑦）: 「最も少ない五行を補う」ではないこと
// ============================================================

describe("用神の決定（用神論）", () => {
  it("身弱なら日干を支える方向（印星・比劫）が用神になる", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    const targets = decideTargetElements(m, "weak");
    expect(targets[0]).toBe(elementThatGenerates(m.dayElement)); // 印星
    expect(targets).toContain(m.dayElement); // 比劫
  });

  it("身強なら日干を漏らす／抑える方向（食傷・財・官）が用神になる", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    const targets = decideTargetElements(m, "strong");
    expect(targets[0]).toBe(elementGeneratedBy(m.dayElement)); // 食傷
    expect(targets).toContain(elementControlledBy(m.dayElement)); // 財
    expect(targets).toContain(elementThatControls(m.dayElement)); // 官
  });

  it("身強と身弱で用神の向きが逆になる（同じ命式でも結論が変わる）", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    const weak = decideTargetElements(m, "weak");
    const strong = decideTargetElements(m, "strong");
    expect(weak[0]).not.toBe(strong[0]);
    // 身弱の用神（支える側）は身強の用神に含まれない
    expect(strong).not.toContain(weak[0]);
  });

  it("用神リストに重複がない", () => {
    const m = buildMeishiki({ birthDate: "1985-11-20" });
    for (const s of ["weak", "neutral", "strong"] as const) {
      const t = decideTargetElements(m, s);
      expect(new Set(t).size).toBe(t.length);
    }
  });
});

// ============================================================
//  身強／身弱の判定
// ============================================================

describe("身強／身弱の判定", () => {
  it("strong / neutral / weak のいずれかを返す", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    const r = judgeStrength(m);
    expect(["strong", "neutral", "weak"]).toContain(r.strength);
  });

  it("L1（時柱なし）でも判定できる（月令中心のため）", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    expect(m.time).toBeNull();
    const r = judgeStrength(m);
    expect(r.summary.length).toBeGreaterThan(0);
    expect(typeof r.score).toBe("number");
  });

  it("日干が月支に通根しているかを返す", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    expect(typeof judgeStrength(m).rootedInMonth).toBe("boolean");
  });
});

// ============================================================
//  calcWuxingBalance（Phase A/B で不変にする契約）
// ============================================================

describe("calcWuxingBalance", () => {
  it("生年月日のみで完結する", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    expect(b.level).toBe("L1");
    expect(b.targetElements.length).toBeGreaterThan(0);
    expect(Object.values(b.counts).reduce((a, c) => a + c, 0)).toBe(7);
  });

  it("出生時刻・出生地を足すとレベルが上がる", () => {
    const l2 = calcWuxingBalance({ birthDate: "1990-05-05", birthTime: "10:30" });
    const l3 = calcWuxingBalance({
      birthDate: "1990-05-05",
      birthTime: "10:30",
      birthPlace: "13",
    });
    expect(l2.level).toBe("L2");
    expect(l3.level).toBe("L3");
  });

  it("weakElement（最少五行）と targetElements（用神）は別物", () => {
    // weakElement は参考値として保持するが、用神の決定には使わない
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    expect(b.weakElement).toBeDefined();
    expect(b.targetElements).toBeDefined();
  });

  it("supportElement は日干を生む五行", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    expect(b.supportElement).toBe(elementThatGenerates(b.dayElement));
  });
});

// ============================================================
//  五行ボーナスの判定（3段階＋星）
// ============================================================

describe("五行ボーナスの判定（4段階・総格が主／三才が従）", () => {
  const targets: Wuxing[] = ["water", "metal"];

  it("総格が第1用神に一致すれば ★★★", () => {
    expect(judgeBonusLevel(targets, "water", ["wood", "fire", "earth"])).toBe(3);
  });

  it("総格が第2以降の用神に一致すれば ★★☆", () => {
    expect(judgeBonusLevel(targets, "metal", ["wood", "fire", "earth"])).toBe(2);
  });

  it("総格は不一致でも三才が用神を含めば ★☆☆", () => {
    expect(judgeBonusLevel(targets, "fire", ["wood", "water", "earth"])).toBe(1);
    expect(judgeBonusLevel(targets, "fire", ["wood", "metal", "earth"])).toBe(1);
  });

  it("いずれにも一致しなければ ☆☆☆（恩恵なし）", () => {
    expect(judgeBonusLevel(targets, "fire", ["wood", "fire", "earth"])).toBe(0);
  });

  it("総格の一致は三才の一致より優先される", () => {
    // 総格が第1用神なら、三才が何であれ ★★★
    expect(judgeBonusLevel(targets, "water", ["metal", "metal", "metal"])).toBe(3);
  });

  it("★の数が level と一致し、常に3枠で表される", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    const primary = b.targetElements[0];
    const bonus = calcWuxingBonus(b, primary, ["wood", "fire", "earth"]);
    expect(bonus.level).toBe(3);
    expect(bonus.stars).toBe("★★★");
    // 星は常に3文字（★と☆の合計）
    expect(Array.from(bonus.stars)).toHaveLength(3);
    expect(Array.from(bonus.stars).filter((c) => c === "★")).toHaveLength(
      bonus.level
    );
  });

  it("恩恵なしのときは ☆☆☆ になる", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    const notTarget = (["wood", "fire", "earth", "metal", "water"] as Wuxing[]).find(
      (e) => !b.targetElements.includes(e)
    )!;
    const bonus = calcWuxingBonus(b, notTarget, [notTarget, notTarget, notTarget]);
    expect(bonus.level).toBe(0);
    expect(bonus.stars).toBe("☆☆☆");
  });

  it("否定的な断定の文言を使わない（生々しさを避ける）", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    const notTarget = (["wood", "fire", "earth", "metal", "water"] as Wuxing[]).find(
      (e) => !b.targetElements.includes(e)
    )!;
    const bonus = calcWuxingBonus(b, notTarget, [notTarget, notTarget, notTarget]);
    expect(bonus.summary).not.toContain("補えていません");
    expect(bonus.label).not.toContain("補えていません");
  });

  it("四柱推命由来であることを source に持つ", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    const bonus = calcWuxingBonus(b, "water", ["wood", "fire", "earth"]);
    expect(bonus.source).toBe("shichu");
  });

  it("L1・L2では上位レベルの案内が出る。L3では出ない", () => {
    const b1 = calcWuxingBalance({ birthDate: "1990-05-05" });
    const b2 = calcWuxingBalance({ birthDate: "1990-05-05", birthTime: "10:30" });
    const b3 = calcWuxingBalance({
      birthDate: "1990-05-05",
      birthTime: "10:30",
      birthPlace: "13",
    });
    expect(calcWuxingBonus(b1, "water", []).levelHint).toContain("出生時刻");
    expect(calcWuxingBonus(b2, "water", []).levelHint).toContain("出生地");
    expect(calcWuxingBonus(b3, "water", []).levelHint).toBeNull();
  });

  it("恩恵なしでも必ず本文を返す（入力に対して無反応にしない）", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    const notTarget = (["wood", "fire", "earth", "metal", "water"] as Wuxing[]).find(
      (e) => !b.targetElements.includes(e)
    )!;
    const bonus = calcWuxingBonus(b, notTarget, [notTarget, notTarget, notTarget]);
    expect(bonus.level).toBe(0);
    expect(bonus.summary.length).toBeGreaterThan(0);
    expect(bonus.summary).toContain("意識すると");
  });

  it("全4段階で本文・星・ラベルが揃う", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    const all: Wuxing[] = ["wood", "fire", "earth", "metal", "water"];
    const notTarget = all.find((e) => !b.targetElements.includes(e))!;

    const cases: Array<[Wuxing, Wuxing[], number]> = [
      [b.targetElements[0], [notTarget, notTarget, notTarget], 3],
      [notTarget, [b.targetElements[0], notTarget, notTarget], 1],
      [notTarget, [notTarget, notTarget, notTarget], 0],
    ];
    for (const [soukaku, sansai, expected] of cases) {
      const bonus = calcWuxingBonus(b, soukaku, sansai);
      expect(bonus.level).toBe(expected);
      expect(bonus.summary.length).toBeGreaterThan(0);
      expect(bonus.label.length).toBeGreaterThan(0);
      expect(Array.from(bonus.stars)).toHaveLength(3);
    }
  });
});
