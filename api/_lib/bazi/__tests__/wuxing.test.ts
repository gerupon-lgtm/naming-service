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

describe("五行ボーナスの判定", () => {
  const targets: Wuxing[] = ["water", "metal"];

  it("総格が最優先の用神に一致すれば ★★★", () => {
    expect(judgeBonusLevel(targets, "water", ["wood", "fire", "earth"])).toBe(3);
  });

  it("総格が次点の用神に一致すれば ★★☆", () => {
    expect(judgeBonusLevel(targets, "metal", ["wood", "fire", "earth"])).toBe(2);
  });

  it("三才が最優先の用神を含めば ★★☆", () => {
    expect(judgeBonusLevel(targets, "fire", ["wood", "water", "earth"])).toBe(2);
  });

  it("いずれにも一致しなければ ★☆☆", () => {
    expect(judgeBonusLevel(targets, "fire", ["wood", "fire", "earth"])).toBe(1);
  });

  it("星とラベルが3段階で対応する", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    const primary = b.targetElements[0];
    const bonus = calcWuxingBonus(b, primary, ["wood", "fire", "earth"]);
    expect(bonus.level).toBe(3);
    expect(bonus.stars).toBe("★★★");
    expect(bonus.label).toBe("十分に補えています");
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

  it("★☆☆ のときは前向きな一言を添える", () => {
    const b = calcWuxingBalance({ birthDate: "1990-05-05" });
    // 用神に含まれない五行を総格・三才に据える
    const notTarget = (["wood", "fire", "earth", "metal", "water"] as Wuxing[]).find(
      (e) => !b.targetElements.includes(e)
    )!;
    const bonus = calcWuxingBonus(b, notTarget, [notTarget]);
    expect(bonus.level).toBe(1);
    expect(bonus.summary).toContain("意識すると");
  });
});
