import { describe, it, expect, vi } from "vitest";
import {
  generateWithFallback,
  LlmProvider,
  LlmUnavailableError,
} from "../index";

function okProvider(id: string, text: string): LlmProvider {
  return { id, generate: vi.fn(async () => text) };
}
function failProvider(id: string): LlmProvider {
  return {
    id,
    generate: vi.fn(async () => {
      throw new LlmUnavailableError(id, "down");
    }),
  };
}

describe("LLMフォールバック連鎖（T-013）", () => {
  it("先頭プロバイダが成功すればその応答を返し、次は呼ばない", async () => {
    const p1 = okProvider("ollama", "こんにちは");
    const p2 = okProvider("openrouter", "別応答");
    const r = await generateWithFallback("prompt", [p1, p2]);
    expect(r).toEqual({ comment: "こんにちは", provider: "ollama" });
    expect(p2.generate).not.toHaveBeenCalled();
  });

  it("先頭が応答不可なら次候補にフォールバックする", async () => {
    const p1 = failProvider("ollama");
    const p2 = okProvider("openrouter", "予備の応答");
    const r = await generateWithFallback("prompt", [p1, p2]);
    expect(r).toEqual({ comment: "予備の応答", provider: "openrouter" });
    expect(p1.generate).toHaveBeenCalled();
  });

  it("全プロバイダ応答不可なら null を返す", async () => {
    const r = await generateWithFallback("prompt", [
      failProvider("ollama"),
      failProvider("openrouter"),
    ]);
    expect(r).toBeNull();
  });

  it("指定順にプロバイダが呼ばれる（順序入れ替え）", async () => {
    const calls: string[] = [];
    const track = (id: string): LlmProvider => ({
      id,
      generate: async () => {
        calls.push(id);
        throw new LlmUnavailableError(id, "down");
      },
    });
    await generateWithFallback("p", [track("openrouter"), track("ollama")]);
    expect(calls).toEqual(["openrouter", "ollama"]);
  });
});
