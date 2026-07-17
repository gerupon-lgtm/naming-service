import { describe, it, expect } from "vitest";
import {
  suggest,
  normalizeIncludeChars,
  matchesPreferences,
  SuggestInvalidError,
  SUGGEST_DEFAULT_COUNT,
} from "../pet/suggest";
import type { LlmProvider } from "../llm";

/** 漢字生成LLMのモック（改行区切りで漢字名を返す）。 */
function llmMock(text: string): LlmProvider[] {
  return [{ id: "mock", generate: async () => text }];
}
/** 漢字生成をさせない（空プロバイダ）。 */
const NO_LLM: LlmProvider[] = [];

describe("ペット命名提案（F-002〜F-005）", () => {
  it("指定件数の候補が条件に沿って返る（不足分はマスタからランダム）", async () => {
    const items = await suggest({ target: "cat", count: 6 });
    expect(items.length).toBe(6); // マスタに十分あるので count 通り
    // 地格＝総格（画数合計）と吉凶が入っている
    for (const it of items) {
      expect(it.strokeTotal).toBeGreaterThan(0);
      expect(it.fortuneLabel).toBeTruthy();
    }
  });

  it("count 未指定なら既定件数（SUGGEST_DEFAULT_COUNT）", async () => {
    const items = await suggest({ target: "dog" });
    expect(items.length).toBe(SUGGEST_DEFAULT_COUNT);
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

  it("性別条件に沿ってマスタから選ばれる（女の子専用は男の子指定で除外）", () => {
    // 選定は matchesPreferences で条件フィルタ（性別・カテゴリ）される
    const femaleOnly = { name: "花子", reading: "はなこ", type: "kanji" as const, targets: ["dog" as const], genders: ["female" as const], categories: [] };
    const neutral = { name: "そら", reading: "そら", type: "hiragana" as const, targets: ["dog" as const], genders: ["neutral" as const], categories: [] };
    const male = { name: "たろう", reading: "たろう", type: "hiragana" as const, targets: ["dog" as const], genders: ["male" as const], categories: [] };
    expect(matchesPreferences(femaleOnly, { target: "dog", sex: "male" })).toBe(false);
    expect(matchesPreferences(neutral, { target: "dog", sex: "male" })).toBe(true);
    expect(matchesPreferences(male, { target: "dog", sex: "male" })).toBe(true);
    // 性別未指定なら全て一致
    expect(matchesPreferences(femaleOnly, { target: "dog" })).toBe(true);
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
      llmProviders: NO_LLM, // 漢字生成はしない（ネット非依存）
      count: 8,
    });
    // 先頭が希望のよみ候補（ぬぬ/ヌヌ）で、理由に「ご希望のよみ」
    expect(["ぬぬ", "ヌヌ"]).toContain(items[0].name);
    expect(items[0].reasons).toContain("ご希望のよみ");
    expect(items[0].source).toBe("dynamic");
    // 不足分はマスタからランダムに埋まる
    expect(items.some((i) => i.source === "master")).toBe(true);
  });

  it("希望のよみの漢字表記をLLM生成で候補に含める（F-004）", async () => {
    // LLMが自然な漢字表記を返す想定。読み仮名や番号が混じっても抽出できる。
    const items = await suggest({
      target: "dog",
      reading: "たけじろう",
      charTypes: ["kanji"],
      llmProviders: llmMock("1. 竹次郎（たけじろう）\n2. 武次郎\n健次郎\n嶽次郎"),
      lookup: { disableRemote: true }, // 画数はシードのみ（ネット非依存）
      count: 10,
    });
    // LLMの先頭「竹次郎」が採用され、理由に「ご希望のよみ（漢字）」
    const takejiro = items.find((i) => i.name === "竹次郎");
    expect(takejiro).toBeTruthy();
    expect(takejiro!.type).toBe("kanji");
    expect(takejiro!.reasons.some((r) => r.includes("漢字"))).toBe(true);
    expect(takejiro!.strokeTotal).toBeGreaterThan(0);
    // 「武次郎」も含まれる（先頭2つは自然さ優先で採用）
    expect(items.some((i) => i.name === "武次郎")).toBe(true);
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
