import { describe, it, expect, vi } from "vitest";
import { buildDiagnosisPrompt, generateComment } from "../comment";
import type { LlmProvider } from "../llm";
import { LlmUnavailableError } from "../llm";

const payload = {
  strokeTotal: 21,
  tenkaku: 8,
  jinkaku: 9,
  chikaku: 13,
  gaikaku: 12,
  soukaku: 21,
  score: 65,
  rank: "A",
  sei: "山田",
  mei: "太郎",
};

describe("診断コメント（F-012）", () => {
  it("プロンプトに確定済みの数値・ランクが含まれる", () => {
    const prompt = buildDiagnosisPrompt(payload);
    expect(prompt).toContain("65");
    expect(prompt).toContain("ランク A");
    expect(prompt).toContain("人格: 9");
    // 再計算をさせない指示が含まれる
    expect(prompt).toContain("再計算");
  });

  it("プロバイダ成功時はコメント文字列を返す", async () => {
    const p: LlmProvider = { id: "ollama", generate: vi.fn(async () => "良い運勢です。") };
    const c = await generateComment("diagnosis", payload, [p]);
    expect(c).toBe("良い運勢です。");
  });

  it("全プロバイダ失敗時は null（コメント領域非表示）", async () => {
    const p: LlmProvider = {
      id: "ollama",
      generate: async () => {
        throw new LlmUnavailableError("ollama", "down");
      },
    };
    const c = await generateComment("diagnosis", payload, [p]);
    expect(c).toBeNull();
  });

  it("petName（Phase2）は Phase1 では null", async () => {
    const p: LlmProvider = { id: "ollama", generate: async () => "x" };
    const c = await generateComment("petName", payload, [p]);
    expect(c).toBeNull();
  });
});
