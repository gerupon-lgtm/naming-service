// OpenRouter プロバイダ（フォールバック候補）。無料枠モデルを想定。
// APIキー未設定・タイムアウト・5xx・接続エラーで応答不可と判定する。

import { LlmProvider, LlmUnavailableError, LlmCommonConfig } from "./types";

export interface OpenRouterConfig extends Partial<LlmCommonConfig> {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export function createOpenRouterProvider(
  config: OpenRouterConfig = {}
): LlmProvider {
  const apiKey = config.apiKey ?? process.env.LLM_OPENROUTER_API_KEY ?? "";
  const model = config.model ?? process.env.LLM_OPENROUTER_MODEL ?? "";
  const baseUrl = config.baseUrl ?? "https://openrouter.ai/api/v1";
  const timeoutMs = config.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 10000);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;

  return {
    id: "openrouter",
    async generate(prompt: string): Promise<string> {
      if (!apiKey) {
        throw new LlmUnavailableError("openrouter", "LLM_OPENROUTER_API_KEY 未設定");
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: ctrl.signal,
        });
        // 4xx・5xx いずれも応答不可と判定してフォールバックする（未解決No.1の決定）
        if (!res.ok) {
          throw new LlmUnavailableError("openrouter", `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = (data.choices?.[0]?.message?.content ?? "").trim();
        if (!text) throw new LlmUnavailableError("openrouter", "空応答");
        return text;
      } catch (e) {
        if (e instanceof LlmUnavailableError) throw e;
        throw new LlmUnavailableError("openrouter", String(e));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
