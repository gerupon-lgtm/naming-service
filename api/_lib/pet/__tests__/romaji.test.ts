import { describe, it, expect } from "vitest";
import { romajiOf, romajiName } from "../romaji";

describe("ヘボン式ローマ字変換", () => {
  it("清音の基本", () => {
    expect(romajiOf("さくら")).toBe("sakura");
    expect(romajiOf("もも")).toBe("momo");
    expect(romajiOf("そら")).toBe("sora");
  });

  it("ヘボン式の特徴的なつづり", () => {
    expect(romajiOf("し")).toBe("shi");
    expect(romajiOf("つ")).toBe("tsu");
    expect(romajiOf("ち")).toBe("chi");
    expect(romajiOf("ふ")).toBe("fu");
    expect(romajiOf("じ")).toBe("ji");
    expect(romajiOf("すし")).toBe("sushi");
  });

  it("濁音・半濁音", () => {
    expect(romajiOf("がっこう")).toBe("gakkou");
    expect(romajiOf("ぱんだ")).toBe("panda");
    expect(romajiOf("ずんだ")).toBe("zunda");
  });

  it("拗音", () => {
    expect(romajiOf("きゃべつ")).toBe("kyabetsu");
    expect(romajiOf("しゃちく")).toBe("shachiku");
    expect(romajiOf("じゅり")).toBe("juri");
    expect(romajiOf("りょう")).toBe("ryou");
  });

  it("促音（次の子音を重ねる。ch の前は t）", () => {
    expect(romajiOf("にっこう")).toBe("nikkou");
    expect(romajiOf("まっちゃ")).toBe("matcha");
    expect(romajiOf("ずっと")).toBe("zutto");
  });

  it("撥音（b/m/p の前は m、その他は n）", () => {
    expect(romajiOf("なんば")).toBe("namba");
    expect(romajiOf("ほんだ")).toBe("honda");
    expect(romajiOf("さんま")).toBe("samma");
    expect(romajiOf("あんこ")).toBe("anko");
  });

  it("長音符「ー」は直前の母音を繰り返す", () => {
    expect(romajiOf("ラー")).toBe("raa");
    expect(romajiOf("モーモ")).toBe("moomo");
  });

  it("カタカナも変換できる", () => {
    expect(romajiOf("モモ")).toBe("momo");
    expect(romajiOf("ソラ")).toBe("sora");
  });

  it("表示用は先頭大文字", () => {
    expect(romajiName("さくら")).toBe("Sakura");
    expect(romajiName("もも")).toBe("Momo");
  });

  it("空文字は空文字", () => {
    expect(romajiOf("")).toBe("");
    expect(romajiName("")).toBe("");
  });

  // アルファベット「使いたい文字」の照合に使えることの確認
  it("使いたい文字の照合に使える（大小無視で部分一致）", () => {
    const r = romajiOf("さくら"); // sakura
    expect(r.toLowerCase().includes("k")).toBe(true);
    expect(r.toLowerCase().includes("r")).toBe(true);
    // 日本語ローマ字に l は基本現れない
    expect(r.toLowerCase().includes("l")).toBe(false);
  });
});
