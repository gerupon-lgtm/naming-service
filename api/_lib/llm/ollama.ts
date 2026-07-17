// Ollama プロバイダ（第一候補）。自宅サーバーの公開エンドポイントを叩く。
// タイムアウト（既定5秒）・5xx・接続エラーで応答不可と判定し、次候補へフォールバックする。

import { LlmProvider, LlmUnavailableError, LlmCommonConfig } from "./types";

export interface OllamaConfig extends Partial<LlmCommonConfig> {
  endpoint?: string;
  model?: string;
}

export function createOllamaProvider(config: OllamaConfig = {}): LlmProvider {
  const endpoint = config.endpoint ?? process.env.LLM_OLLAMA_ENDPOINT ?? "";
  const model = config.model ?? process.env.LLM_OLLAMA_MODEL ?? "";
  const timeoutMs = config.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 10000);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;

  return {
    id: "ollama",
    async generate(prompt: string): Promise<string> {
      if (!endpoint) {
        throw new LlmUnavailableError("ollama", "LLM_OLLAMA_ENDPOINT 未設定");
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${endpoint.replace(/\/$/, "")}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            // 低温で安定させ、外国語・記号の混入や暴走を抑える
            options: { temperature: 0.6, top_p: 0.9, repeat_penalty: 1.15 },
          }),
          signal: ctrl.signal,
        });
        // 4xx・5xx いずれも応答不可と判定してフォールバックする（未解決No.1の決定）
        if (!res.ok) {
          throw new LlmUnavailableError("ollama", `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { response?: string };
        const text = (data.response ?? "").trim();
        if (!text) throw new LlmUnavailableError("ollama", "空応答");
        return text;
      } catch (e) {
        if (e instanceof LlmUnavailableError) throw e;
        throw new LlmUnavailableError("ollama", String(e)); // AbortError・ネットワーク等
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
