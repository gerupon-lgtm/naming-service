// LLMプロバイダの共通インターフェース（T-013）。
// Ollama・OpenRouter を同一インターフェースで扱い、フォールバック連鎖を構成する。

export interface LlmProvider {
  /** プロバイダ識別子（"ollama" / "openrouter"）。 */
  readonly id: string;
  /** 使用モデル名（表示用）。 */
  readonly model?: string;
  /** プロンプトからコメント文を生成する。応答不可時は LlmUnavailableError を投げる。 */
  generate(prompt: string): Promise<string>;
}

/** プロバイダが応答不可（タイムアウト・5xx・接続エラー・設定不足）。次候補にフォールバックする。 */
export class LlmUnavailableError extends Error {
  constructor(
    public readonly provider: string,
    message: string
  ) {
    super(`[${provider}] ${message}`);
    this.name = "LlmUnavailableError";
  }
}

/** 共通設定。 */
export interface LlmCommonConfig {
  timeoutMs: number;
  fetchImpl: typeof fetch;
}
