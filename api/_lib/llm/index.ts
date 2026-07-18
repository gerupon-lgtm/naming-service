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

export interface LlmInfo {
  provider: string; // ollama / openrouter
  model: string;
}

let _probeCache: LlmInfo | null = null;

/**
 * 「最初に正常に接続できたLLM」のサービス名・モデル名を返す（表示用）。
 * 一度成功したら結果をキャッシュする。全滅なら null。
 * @param providers テスト用の明示注入。
 */
export async function probeLlm(providers?: LlmProvider[]): Promise<LlmInfo | null> {
  if (_probeCache) return _probeCache;
  const chain = providers ?? buildProviderChain();
  for (const p of chain) {
    try {
      const out = await p.generate("こんにちは");
      if (out && out.trim().length > 0) {
        _probeCache = { provider: p.id, model: p.model ?? "" };
        return _probeCache;
      }
    } catch {
      continue; // 次候補へ
    }
  }
  return null;
}

/** テスト用: プローブのキャッシュをクリア。 */
export function _clearProbeCache(): void {
  _probeCache = null;
}

/**
 * プロバイダ連鎖を順に試し、最初の「妥当な」応答を返す。全滅なら null。
 * @param providers 省略時は環境変数から構築する（テストでは明示注入できる）。
 * @param validate  応答の妥当性チェック（false のプロバイダは失敗扱いで次へ）。
 */
export async function generateWithFallback(
  prompt: string,
  providers?: LlmProvider[],
  validate?: (comment: string) => boolean
): Promise<{ comment: string; provider: string } | null> {
  const chain = providers ?? buildProviderChain();
  for (const p of chain) {
    try {
      const comment = await p.generate(prompt);
      if (validate && !validate(comment)) continue; // 不正な出力は次候補へ
      return { comment, provider: p.id };
    } catch (e) {
      if (e instanceof LlmUnavailableError) continue; // 次候補へ
      // 想定外エラーも握りつぶして次へ（診断結果本体に影響させない）
      continue;
    }
  }
  return null;
}
