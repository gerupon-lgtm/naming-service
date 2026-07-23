import { describe, it, expect } from "vitest";
import { parseGeneratedNames, generateNamesByChar } from "../charNameLLM";
import type { LlmProvider } from "../../llm";

function provider(text: string): LlmProvider {
  return { id: "test", model: "t", generate: async () => text };
}

describe("LLM出力の解析", () => {
  it("「よみ/漢字」形式を取り込む", () => {
    const r = parseGeneratedNames("あずみ/梓実\nみあ/実杏");
    expect(r).toEqual([
      { reading: "あずみ", kanji: "梓実" },
      { reading: "みあ", kanji: "実杏" },
    ]);
  });

  it("「よみ（漢字）」形式にも対応する", () => {
    const r = parseGeneratedNames("あずみ（梓実）\nみあ(実杏)");
    expect(r).toEqual([
      { reading: "あずみ", kanji: "梓実" },
      { reading: "みあ", kanji: "実杏" },
    ]);
  });

  it("行頭の番号・記号を落とす", () => {
    const r = parseGeneratedNames("1. あずみ/梓実\n・みあ/実杏");
    expect(r.map((g) => g.reading)).toEqual(["あずみ", "みあ"]);
  });

  it("漢字が無いひらがなだけの行も拾う（kanji は undefined）", () => {
    const r = parseGeneratedNames("もなか\nあずき");
    expect(r).toEqual([{ reading: "もなか" }, { reading: "あずき" }]);
  });

  it("説明文や英語の行は無視する", () => {
    const r = parseGeneratedNames("以下に提案します。\nHere are names:\nあずみ/梓実");
    expect(r).toEqual([{ reading: "あずみ", kanji: "梓実" }]);
  });
});

describe("使いたい文字による生成（表記照合・機械検証つき）", () => {
  it("漢字：漢字表記にその字を含むものだけ返す", async () => {
    const p = provider(["あおぞら/青空", "もも/桃", "みそら/美空"].join("\n"));
    const r = await generateNamesByChar({
      char: "空",
      charKind: "kanji",
      target: "cat",
      providers: [p],
    });
    // 「桃」は空を含まないので除外
    expect(r.map((g) => g.kanji)).toEqual(["青空", "美空"]);
  });

  it("かな：よみ（＝かな表記）にその字を含むものだけ返す", async () => {
    const p = provider(["もなか", "さくら", "もも"].join("\n"));
    const r = await generateNamesByChar({
      char: "も",
      charKind: "kana",
      target: "cat",
      providers: [p],
    });
    expect(r.map((g) => g.reading)).toEqual(["もなか", "もも"]);
  });

  it("アルファベット：ローマ字にその字を含むものだけ返す", async () => {
    const p = provider(["さくら", "もも", "こたろう"].join("\n"));
    const r = await generateNamesByChar({
      char: "k",
      charKind: "alphabet",
      target: "dog",
      providers: [p],
    });
    // さくら=Sakura, こたろう=Kotaro に k。もも=Momo には無い
    expect(r.map((g) => g.reading)).toEqual(["さくら", "こたろう"]);
  });

  it("希望のよみが指定されたら、そのよみと一致するものだけ", async () => {
    const p = provider(["そら/空", "そら/青空", "みそら/美空"].join("\n"));
    const r = await generateNamesByChar({
      char: "空",
      charKind: "kanji",
      target: "cat",
      reading: "そら",
      providers: [p],
    });
    expect(r.every((g) => g.reading === "そら")).toBe(true);
    expect(r.length).toBe(2);
  });

  it("空文字は呼び出さず空配列", async () => {
    let called = false;
    const p: LlmProvider = {
      id: "t",
      generate: async () => {
        called = true;
        return "x";
      },
    };
    const r = await generateNamesByChar({
      char: "",
      charKind: "kana",
      target: "cat",
      providers: [p],
    });
    expect(r).toEqual([]);
    expect(called).toBe(false);
  });

  it("LLM応答不可なら空配列（マスタ補完に委ねる）", async () => {
    const dead: LlmProvider = {
      id: "dead",
      generate: async () => {
        throw new Error("down");
      },
    };
    const r = await generateNamesByChar({
      char: "も",
      charKind: "kana",
      target: "cat",
      providers: [dead],
    });
    expect(r).toEqual([]);
  });
});
