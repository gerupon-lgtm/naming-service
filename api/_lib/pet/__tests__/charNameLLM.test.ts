import { describe, it, expect } from "vitest";
import { parseGeneratedNames, generateNamesByChars } from "../charNameLLM";
import type { LlmProvider } from "../../llm";

function provider(text: string): LlmProvider {
  return { id: "test", model: "t", generate: async () => text };
}

describe("LLM出力の解析", () => {
  it("「よみ/表記」形式を取り込む", () => {
    const r = parseGeneratedNames("あずみ/梓実\nみあ/実杏");
    expect(r).toEqual([
      { reading: "あずみ", name: "梓実" },
      { reading: "みあ", name: "実杏" },
    ]);
  });

  it("「よみ（表記）」形式にも対応する", () => {
    const r = parseGeneratedNames("あずみ（梓実）\nみあ(実杏)");
    expect(r).toEqual([
      { reading: "あずみ", name: "梓実" },
      { reading: "みあ", name: "実杏" },
    ]);
  });

  it("行頭の番号・記号を落とす", () => {
    const r = parseGeneratedNames("1. あずみ/梓実\n・みあ/実杏\n- あみ/亜実");
    expect(r.map((g) => g.reading)).toEqual(["あずみ", "みあ", "あみ"]);
  });

  it("表記が無いひらがなだけの行も拾う", () => {
    const r = parseGeneratedNames("もなか\nあずき");
    expect(r).toEqual([
      { reading: "もなか", name: "もなか" },
      { reading: "あずき", name: "あずき" },
    ]);
  });

  it("重複を除く", () => {
    const r = parseGeneratedNames("あずみ/梓実\nあずみ/梓実");
    expect(r).toHaveLength(1);
  });

  it("説明文や英語の行は無視する", () => {
    const r = parseGeneratedNames(
      "以下に提案します。\nHere are some names:\nあずみ/梓実"
    );
    expect(r).toEqual([{ reading: "あずみ", name: "梓実" }]);
  });
});

describe("使いたい文字による生成（機械検証つき）", () => {
  const base = { includeChars: ["あ", "み"], target: "cat", count: 6 };

  it("条件を満たす候補だけを返す", async () => {
    // 「あ」「み」を両方含まないものを混ぜても、ロジック側で落とす
    const p = provider(
      ["あずみ/梓実", "もなか/最中", "みあ/実杏", "さくら/桜"].join("\n")
    );
    const r = await generateNamesByChars({ ...base, providers: [p] });
    expect(r.map((g) => g.reading)).toEqual(["あずみ", "みあ"]);
  });

  it("LLMが条件を守らなくても、含まないものは必ず除外する", async () => {
    const p = provider(["さくら/桜", "もも/桃"].join("\n"));
    const r = await generateNamesByChars({ ...base, providers: [p] });
    expect(r).toEqual([]);
  });

  it("使いたい文字が空なら呼び出さず空配列", async () => {
    let called = false;
    const p: LlmProvider = {
      id: "test",
      generate: async () => {
        called = true;
        return "あずみ/梓実";
      },
    };
    const r = await generateNamesByChars({
      ...base,
      includeChars: [],
      providers: [p],
    });
    expect(r).toEqual([]);
    expect(called).toBe(false);
  });

  it("LLMが応答不可なら空配列（マスタ補完に委ねる）", async () => {
    const dead: LlmProvider = {
      id: "dead",
      generate: async () => {
        throw new Error("down");
      },
    };
    const r = await generateNamesByChars({ ...base, providers: [dead] });
    expect(r).toEqual([]);
  });

  it("件数の上限を守る", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `あみ${i}/亜実`).join("\n");
    const r = await generateNamesByChars({
      ...base,
      count: 3,
      providers: [provider(many)],
    });
    expect(r.length).toBeLessThanOrEqual(3);
  });
});
