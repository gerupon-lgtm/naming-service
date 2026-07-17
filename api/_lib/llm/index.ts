// LLMフォールバック連鎖（T-013）。
// LLM_FALLBACK_ORDER の順にプロバイダを試し、最初に成功した応答を返す。
// 全プロバイダが応答不可なら null を返す（呼び出し側はコメント領域を非表示にする）。

import { LlmProvider, LlmUnavailableError } from "./types";
import { createOllamaProvider } from "./ollama";
import { createOpenRouterProvider } from "./openrouter";

export * from "./types";
export { createOllamaProvider, createOpenRouterProvider };

const FACTORIES: Record<string, () => LlmProvider> = {
  ollama: createOllamaProvider,
  openrouter: createOpenRouterProvider,
};

/** 環境変数 LLM_FALLBACK_ORDER からプロバイダ連鎖を構築する。 */
export function buildProviderChain(order?: string): LlmProvider[] {
  const raw = order ?? process.env.LLM_FALLBACK_ORDER ?? "ollama,openrouter";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => FACTORIES[id]?.())
    .filter((p): p is LlmProvider => Boolean(p));
}

/**
 * プロバイダ連鎖を順に試し、最初の成功応答を返す。全滅なら null。
 * @param providers 省略時は環境変数から構築する（テストでは明示注入できる）。
 */
export async function generateWithFallback(
  prompt: string,
  providers?: LlmProvider[]
): Promise<{ comment: string; provider: string } | null> {
  const chain = providers ?? buildProviderChain();
  for (const p of chain) {
    try {
      const comment = await p.generate(prompt);
      return { comment, provider: p.id };
    } catch (e) {
      if (e instanceof LlmUnavailableError) continue; // 次候補へ
      // 想定外エラーも握りつぶして次へ（診断結果本体に影響させない）
      continue;
    }
  }
  return null;
}
