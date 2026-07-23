import { describe, it, expect } from "vitest";
import {
  suggest,
  normalizeIncludeChar,
  matchesPreferences,
  containsWantedChar,
  wantedCharKind,
  SuggestInvalidError,
  SUGGEST_DEFAULT_COUNT,
} from "../pet/suggest";
import type { LlmProvider } from "../llm";

/** LLMモック（改行区切りのテキストを返す）。 */
function llmMock(text: string): LlmProvider[] {
  return [{ id: "mock", generate: async () => text }];
}
/** LLMを使わせない（空プロバイダ）。 */
const NO_LLM: LlmProvider[] = [];
const SEED_ONLY = { disableRemote: true } as const;

describe("ペット命名提案（基本）", () => {
  it("指定件数の候補が条件に沿って返る（不足分はマスタからランダム）", async () => {
    const { candidates } = await suggest({ target: "cat", count: 6 });
    expect(candidates.length).toBe(6);
    for (const it of candidates) {
      expect(it.strokeTotal).toBeGreaterThan(0);
      expect(it.fortuneLabel).toBeTruthy();
    }
  });

  it("count 未指定なら既定件数（SUGGEST_DEFAULT_COUNT）", async () => {
    const { candidates } = await suggest({ target: "dog" });
    expect(candidates.length).toBe(SUGGEST_DEFAULT_COUNT);
  });

  it("出力文字種フィルタ（T-104）", async () => {
    const { candidates } = await suggest({
      target: "cat",
      charTypes: ["katakana"],
      limit: 30,
    });
    expect(candidates.length).toBeGreaterThan(0);
    for (const it of candidates) expect(it.type).toBe("katakana");
  });

  it("希望のよみは必ず候補に含まれ、先頭に来る", async () => {
    const { candidates } = await suggest({
      target: "cat",
      sex: "female",
      categories: ["かわいい"],
      reading: "ぬぬ",
      llmProviders: NO_LLM,
      count: 8,
    });
    expect(["ぬぬ", "ヌヌ"]).toContain(candidates[0].name);
    expect(candidates[0].reasons).toContain("ご希望のよみ");
    expect(candidates[0].source).toBe("dynamic");
    expect(candidates.some((i) => i.source === "master")).toBe(true);
  });

  it("希望のよみの漢字表記をLLM生成で候補に含める（F-004）", async () => {
    const { candidates } = await suggest({
      target: "dog",
      reading: "たけじろう",
      charTypes: ["kanji"],
      llmProviders: llmMock("1. 竹次郎（たけじろう）\n2. 武次郎\n健次郎\n嶽次郎"),
      lookup: SEED_ONLY,
      count: 10,
    });
    const takejiro = candidates.find((i) => i.name === "竹次郎");
    expect(takejiro).toBeTruthy();
    expect(takejiro!.type).toBe("kanji");
    expect(takejiro!.reasons.some((r) => r.includes("漢字"))).toBe(true);
    expect(candidates.some((i) => i.name === "武次郎")).toBe(true);
  });
});

describe("使いたい文字（単体1文字・表記照合・v2.4.0）", () => {
  it("normalizeIncludeChar: 複数入っても先頭1文字のみ", () => {
    expect(normalizeIncludeChar(["も, さ、く ら"])).toBe("も");
    expect(normalizeIncludeChar(["　空　"])).toBe("空");
    expect(normalizeIncludeChar([""])).toBeNull();
    expect(normalizeIncludeChar(undefined)).toBeNull();
  });

  it("wantedCharKind: 文字種を判定する", () => {
    expect(wantedCharKind("空")).toBe("kanji");
    expect(wantedCharKind("も")).toBe("kana");
    expect(wantedCharKind("モ")).toBe("kana");
    expect(wantedCharKind("R")).toBe("alphabet");
  });

  it("containsWantedChar: かなは表記照合（ひらがな・カタカナ同一視）", () => {
    expect(containsWantedChar({ name: "もも", reading: "もも" }, "も")).toBe(true);
    expect(containsWantedChar({ name: "モモ", reading: "もも" }, "も")).toBe(true); // カタカナ表記も一致
    expect(containsWantedChar({ name: "さくら", reading: "さくら" }, "も")).toBe(false);
  });

  it("containsWantedChar: 漢字は表記照合", () => {
    expect(containsWantedChar({ name: "青空", reading: "あおぞら" }, "空")).toBe(true);
    expect(containsWantedChar({ name: "さくら", reading: "さくら" }, "空")).toBe(false);
  });

  it("containsWantedChar: アルファベットはローマ字表記照合（大小無視）", () => {
    expect(containsWantedChar({ name: "Sakura", reading: "さくら" }, "k")).toBe(true);
    expect(containsWantedChar({ name: "Sakura", reading: "さくら" }, "K")).toBe(true);
    expect(containsWantedChar({ name: "Momo", reading: "もも" }, "k")).toBe(false);
    // 日本語ローマ字に l は現れない
    expect(containsWantedChar({ name: "Rui", reading: "るい" }, "l")).toBe(false);
  });

  it("かな使いたい文字：候補の表記にその字が含まれる", async () => {
    const { candidates } = await suggest({
      target: "dog",
      includeChars: ["も"],
      llmProviders: NO_LLM, // マスタのみ
      limit: 30,
    });
    for (const it of candidates) {
      // 表記（ひらがな化して照合）に「も」が含まれる
      expect(containsWantedChar(it, "も")).toBe(true);
    }
  });

  it("漢字使いたい文字：LLM生成で表記に漢字を含む候補（source: chars）", async () => {
    const { candidates } = await suggest({
      target: "dog",
      includeChars: ["空"],
      charTypes: ["kanji"],
      llmProviders: llmMock("あおぞら/青空\nそら/大空\nみそら/美空"),
      lookup: SEED_ONLY,
      limit: 10,
    });
    const chars = candidates.filter((it) => it.source === "chars");
    expect(chars.length).toBeGreaterThan(0);
    for (const it of chars) {
      expect(it.name).toContain("空");
      expect(it.type).toBe("kanji");
    }
  });

  it("アルファベット使いたい文字：ローマ字表記の候補が出る", async () => {
    const { candidates } = await suggest({
      target: "dog",
      includeChars: ["K"],
      charTypes: ["romaji"],
      llmProviders: llmMock("さくら\nこたろう\nもも"),
      lookup: SEED_ONLY,
      limit: 10,
    });
    const chars = candidates.filter((it) => it.source === "chars");
    expect(chars.length).toBeGreaterThan(0);
    for (const it of chars) {
      expect(it.type).toBe("romaji");
      expect(it.name.toLowerCase()).toContain("k");
    }
    // 「もも」(Momo) は k を含まないので除外される
    expect(candidates.some((it) => it.reading === "もも")).toBe(false);
  });

  it("矛盾チェック：漢字の使いたい文字×漢字なし出力はエラー", async () => {
    await expect(
      suggest({ target: "dog", includeChars: ["空"], charTypes: ["hiragana"] })
    ).rejects.toBeInstanceOf(SuggestInvalidError);
  });

  it("矛盾チェック：アルファベット×ローマ字なし出力はエラー", async () => {
    await expect(
      suggest({ target: "dog", includeChars: ["R"], charTypes: ["hiragana"] })
    ).rejects.toBeInstanceOf(SuggestInvalidError);
  });
});

describe("使いたい文字＋希望のよみ（2段構え・v2.4.0）", () => {
  it("両立できればボーナス無し。使いたい文字が表記に、よみが一致", async () => {
    const { candidates, notice } = await suggest({
      target: "cat",
      includeChars: ["空"],
      reading: "そら",
      charTypes: ["kanji"],
      llmProviders: llmMock("そら/空\nそら/青空"),
      lookup: SEED_ONLY,
      count: 8,
    });
    expect(notice).toBeUndefined();
    const chars = candidates.filter((it) => it.source === "chars");
    expect(chars.length).toBeGreaterThan(0);
    for (const it of chars) {
      expect(it.reading).toBe("そら");
      expect(it.name).toContain("空");
    }
  });

  it("両立できなければ、よみを優先し notice を返す", async () => {
    // 使いたい文字「空」とよみ「もも」を両立する漢字は作れない → よみ優先
    const { candidates, notice } = await suggest({
      target: "cat",
      includeChars: ["空"],
      reading: "もも",
      charTypes: ["hiragana", "kanji"],
      llmProviders: llmMock("もも/桃"),
      lookup: SEED_ONLY,
      count: 8,
    });
    expect(notice).toBeDefined();
    expect(notice!.kind).toBe("reading_over_char");
    expect(notice!.droppedChar).toBe("空");
    expect(notice!.reading).toBe("もも");
    // よみ優先なので「もも」の候補が出る
    expect(candidates.some((it) => it.reading === "もも")).toBe(true);
  });
});

describe("matchesPreferences", () => {
  it("性別条件に沿う（女の子専用は男の子指定で除外）", () => {
    const femaleOnly = { name: "花子", reading: "はなこ", type: "kanji" as const, targets: ["dog" as const], genders: ["female" as const], categories: [] };
    const neutral = { name: "そら", reading: "そら", type: "hiragana" as const, targets: ["dog" as const], genders: ["neutral" as const], categories: [] };
    const male = { name: "たろう", reading: "たろう", type: "hiragana" as const, targets: ["dog" as const], genders: ["male" as const], categories: [] };
    expect(matchesPreferences(femaleOnly, { target: "dog", sex: "male" })).toBe(false);
    expect(matchesPreferences(neutral, { target: "dog", sex: "male" })).toBe(true);
    expect(matchesPreferences(male, { target: "dog", sex: "male" })).toBe(true);
    expect(matchesPreferences(femaleOnly, { target: "dog" })).toBe(true);
  });
});
