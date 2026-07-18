import { describe, it, expect } from "vitest";
import { parseKanjiNames, generateKanjiNames } from "../pet/kanjiNameLLM";
import type { LlmProvider } from "../llm";

describe("LLM漢字生成（F-004・自然さ重視）", () => {
  it("番号・読み仮名・記号が混じっても漢字表記を抽出する", () => {
    const text = [
      "1. 竹次郎（たけじろう）※「竹」はたけ",
      "2. 武次郎",
      "健次郎 - たけじろう",
      "たけじろう → 嶽次郎",
      "", // 空行
    ].join("\n");
    expect(parseKanjiNames(text)).toEqual([
      "竹次郎",
      "武次郎",
      "健次郎",
      "嶽次郎",
    ]);
  });

  it("generateKanjiNames: LLM出力から漢字名リストを得る", async () => {
    const p: LlmProvider = {
      id: "mock",
      generate: async () => "竹次郎\n武次郎\n健次郎",
    };
    const names = await generateKanjiNames("たけじろう", "dog", [p], 6);
    expect(names).toEqual(["竹次郎", "武次郎", "健次郎"]);
  });

  it("LLM応答不可（空プロバイダ）なら空配列", async () => {
    const names = await generateKanjiNames("たけじろう", "dog", []);
    expect(names).toEqual([]);
  });
});
