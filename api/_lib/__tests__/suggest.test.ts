import { describe, it, expect } from "vitest";
import {
  suggest,
  normalizeIncludeChars,
  SuggestInvalidError,
} from "../pet/suggest";

describe("ペット命名提案（F-002〜F-005）", () => {
  it("対象動物で候補が返り、スコア降順に並ぶ", async () => {
    const items = await suggest({ target: "cat", limit: 10 });
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].score).toBeGreaterThanOrEqual(items[i].score);
    }
    // 地格＝総格（画数合計）が入っている
    expect(items[0].strokeTotal).toBeGreaterThan(0);
    expect(items[0].fortuneLabel).toBeTruthy();
  });

  it("使いたい文字（AND）で絞り込む（T-102）", async () => {
    const items = await suggest({
      target: "dog",
      includeChars: ["も"],
      limit: 30,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      // 動的補完を除き、マスタ候補は「も」を含む
      if (it.source === "master") expect(it.name).toContain("も");
    }
  });

  it("出力文字種フィルタ（T-104）", async () => {
    const items = await suggest({
      target: "cat",
      charTypes: ["katakana"],
      limit: 30,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(it.type).toBe("katakana");
  });

  it("性別重みが強く反映される（男の子指定で male 向きが上位）", async () => {
    const items = await suggest({ target: "dog", sex: "male", limit: 40 });
    // 上位に male 向き候補（reasons に「男の子向き」）が含まれる
    const top = items.slice(0, 8);
    expect(top.some((i) => i.reasons.some((r) => r.includes("男の子")))).toBe(
      true
    );
  });

  it("使いたい文字と出力文字種の矛盾はエラー（T-104）", async () => {
    await expect(
      suggest({
        target: "dog",
        includeChars: ["空"],
        charTypes: ["hiragana"],
      })
    ).rejects.toBeInstanceOf(SuggestInvalidError);
  });

  it("希望のよみは必ず候補に含まれ、先頭に来る（マスタが十分でも）", async () => {
    const items = await suggest({
      target: "cat",
      sex: "female",
      categories: ["かわいい"],
      reading: "ぬぬ", // マスタには無いよみ
      limit: 8,
    });
    // 先頭が希望のよみ候補（ぬぬ/ヌヌ）で、理由に「ご希望のよみ」
    expect(["ぬぬ", "ヌヌ"]).toContain(items[0].name);
    expect(items[0].reasons).toContain("ご希望のよみ");
    expect(items[0].source).toBe("dynamic");
    // マスタ候補も続けて含まれる
    expect(items.some((i) => i.source === "master")).toBe(true);
  });

  it("normalizeIncludeChars: 区切りを正規化して1文字配列に", () => {
    expect(normalizeIncludeChars(["も, さ、く ら"])).toEqual([
      "も",
      "さ",
      "く",
      "ら",
    ]);
    expect(normalizeIncludeChars(undefined)).toEqual([]);
  });
});
