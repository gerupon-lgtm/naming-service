import { describe, it, expect } from "vitest";
import { diagnose } from "../diagnose";
import { buildDiagnosisPrompt, type DiagnosisPayload } from "../comment";

// 同梱のseed辞書だけで計算する（kanjiapi.devを呼ばない）。
const base = {
  sei: "山田",
  mei: "太郎",
  sex: "male" as const,
  lookup: { disableRemote: true },
};

describe("五行ボーナスは診断結果本体に影響しない（最重要の不変条件）", () => {
  it("生年月日の有無でスコア・ランク・五格が一切変わらない", async () => {
    const without = await diagnose(base);
    const with1 = await diagnose({ ...base, birthDate: "1990-05-05" });
    const with2 = await diagnose({
      ...base,
      birthDate: "1975-11-23",
      birthTime: "23:30",
      birthPlace: "13",
    });

    for (const withBirth of [with1, with2]) {
      expect(withBirth.score).toBe(without.score);
      expect(withBirth.rank).toBe(without.rank);
      expect(withBirth.tenkaku).toBe(without.tenkaku);
      expect(withBirth.jinkaku).toBe(without.jinkaku);
      expect(withBirth.chikaku).toBe(without.chikaku);
      expect(withBirth.gaikaku).toBe(without.gaikaku);
      expect(withBirth.soukaku).toBe(without.soukaku);
      expect(withBirth.sansai).toEqual(without.sansai);
      expect(withBirth.wuxing).toEqual(without.wuxing);
    }
  });

  it("生年月日なしのレスポンスは wuxingBonus を含まない（後方互換）", async () => {
    const r = await diagnose(base);
    expect(r.wuxingBonus).toBeUndefined();
    expect("wuxingBonus" in r).toBe(false);
  });

  it("生年月日ありなら wuxingBonus が付く", async () => {
    const r = await diagnose({ ...base, birthDate: "1990-05-05" });
    expect(r.wuxingBonus).toBeDefined();
    expect(r.wuxingBonus!.source).toBe("shichu");
    expect(["★★★", "★★☆", "★☆☆"]).toContain(r.wuxingBonus!.stars);
  });

  it("生年月日が違えばボーナスは変わり得るが、本体は同一のまま", async () => {
    const a = await diagnose({ ...base, birthDate: "1990-05-05" });
    const b = await diagnose({ ...base, birthDate: "1960-01-15" });
    expect(a.score).toBe(b.score);
    expect(a.rank).toBe(b.rank);
    // ボーナス側は独立して算出される
    expect(a.wuxingBonus).toBeDefined();
    expect(b.wuxingBonus).toBeDefined();
  });
});

describe("入力レベルの縮退（生年月日だけで完結する）", () => {
  it("生年月日のみで L1 として算出される", async () => {
    const r = await diagnose({ ...base, birthDate: "1990-05-05" });
    expect(r.wuxingBonus!.inputLevel).toBe("L1");
    expect(r.wuxingBonus!.levelHint).toContain("出生時刻");
  });

  it("＋出生時刻で L2", async () => {
    const r = await diagnose({
      ...base,
      birthDate: "1990-05-05",
      birthTime: "10:30",
    });
    expect(r.wuxingBonus!.inputLevel).toBe("L2");
    expect(r.wuxingBonus!.levelHint).toContain("出生地");
  });

  it("＋出生地で L3（案内は出ない）", async () => {
    const r = await diagnose({
      ...base,
      birthDate: "1990-05-05",
      birthTime: "10:30",
      birthPlace: "13",
    });
    expect(r.wuxingBonus!.inputLevel).toBe("L3");
    expect(r.wuxingBonus!.levelHint).toBeNull();
  });
});

describe("プライバシー（T-308）: 生年月日がLLMプロンプトに漏れない", () => {
  it("診断結果をそのまま渡してもプロンプトに生年月日は含まれない", async () => {
    const r = await diagnose({
      ...base,
      birthDate: "1975-11-23",
      birthTime: "23:30",
      birthPlace: "13",
    });
    // フロントは {...result, sei, mei, sexLabel} を payload として送る。
    // それをそのまま渡しても、生年月日由来の情報が混ざらないことを確認する。
    const payload = {
      ...r,
      sei: "山田",
      mei: "太郎",
      sexLabel: "男性",
    } as unknown as DiagnosisPayload;
    const prompt = buildDiagnosisPrompt(payload);

    expect(prompt).not.toContain("1975");
    expect(prompt).not.toContain("11-23");
    expect(prompt).not.toContain("23:30");
    // ボーナス自体もプロンプトには渡さない（姓名判断の解説に専念させる）
    expect(prompt).not.toContain("四柱推命");
    expect(prompt).not.toContain("★");
  });

  it("wuxingBonus には生年月日そのものが含まれない（抽象化済みの情報のみ）", async () => {
    const r = await diagnose({
      ...base,
      birthDate: "1975-11-23",
      birthTime: "23:30",
      birthPlace: "13",
    });
    const json = JSON.stringify(r.wuxingBonus);
    expect(json).not.toContain("1975");
    expect(json).not.toContain("23:30");
    expect(json).not.toContain("13");
  });
});

describe("共有URL（F-006 × F-015）: 用神リストからボーナスを再現する", () => {
  it("生年月日なしでも wuxingTargets があればボーナスが付く", async () => {
    const r = await diagnose({ ...base, wuxingTargets: "metal-water-wood" });
    expect(r.wuxingBonus).toBeDefined();
    expect(r.wuxingBonus!.targetElements).toEqual(["metal", "water", "wood"]);
    expect(r.wuxingBonus!.source).toBe("shichu");
  });

  it("共有先では上位レベルの案内を出さない（生年月日を足せないため）", async () => {
    const r = await diagnose({ ...base, wuxingTargets: "metal-water-wood" });
    expect(r.wuxingBonus!.levelHint).toBeNull();
  });

  it("同じ名前・同じ用神なら、生年月日から算出した場合と星が一致する", async () => {
    const withBirth = await diagnose({ ...base, birthDate: "1990-05-05" });
    const targets = withBirth.wuxingBonus!.targetElements.join("-");
    const shared = await diagnose({ ...base, wuxingTargets: targets });
    expect(shared.wuxingBonus!.level).toBe(withBirth.wuxingBonus!.level);
    expect(shared.wuxingBonus!.stars).toBe(withBirth.wuxingBonus!.stars);
  });

  it("生年月日があればそちらを優先する", async () => {
    const r = await diagnose({
      ...base,
      birthDate: "1990-05-05",
      wuxingTargets: "fire-fire-fire",
    });
    // 生年月日から算出されるので、渡した用神リストは使われない
    expect(r.wuxingBonus!.targetElements).not.toEqual(["fire"]);
  });

  it("不正な値は無視し、診断は止めない", async () => {
    for (const bad of ["", "abc", "---", "gold-silver"]) {
      const r = await diagnose({ ...base, wuxingTargets: bad });
      expect(r.score).toBeGreaterThan(0);
      expect(r.wuxingBonus).toBeUndefined();
    }
  });

  it("共有URLに載せる値から生年月日は復元できない（五行名のみ）", async () => {
    const r = await diagnose({ ...base, birthDate: "1975-11-23" });
    const shareValue = r.wuxingBonus!.targetElements.join("-");
    expect(shareValue).not.toMatch(/\d/); // 数字を含まない
    expect(shareValue).toMatch(/^[a-z-]+$/);
  });

  it("共有由来でも総合スコア・ランクは変わらない", async () => {
    const plain = await diagnose(base);
    const shared = await diagnose({ ...base, wuxingTargets: "metal-water" });
    expect(shared.score).toBe(plain.score);
    expect(shared.rank).toBe(plain.rank);
  });
});

describe("不正な入力でも診断は止まらない", () => {
  it("不正な生年月日はボーナスなしで診断を返す", async () => {
    for (const bad of ["1990/05/05", "abc", "1990-13-01", "1990-02-30", ""]) {
      const r = await diagnose({ ...base, birthDate: bad });
      expect(r.score).toBeGreaterThan(0);
      expect(r.wuxingBonus).toBeUndefined();
    }
  });

  it("不正な出生時刻は無かったものとして L1 に縮退する（勝手に補完しない）", async () => {
    const r = await diagnose({
      ...base,
      birthDate: "1990-05-05",
      birthTime: "25:99",
    });
    expect(r.wuxingBonus!.inputLevel).toBe("L1");
  });

  it("未知の出生地は経度補正なしとして扱う", async () => {
    const r = await diagnose({
      ...base,
      birthDate: "1990-05-05",
      birthTime: "10:30",
      birthPlace: "存在しない県",
    });
    expect(r.wuxingBonus).toBeDefined();
  });
});
