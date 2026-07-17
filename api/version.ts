// GET /api/version — アプリのバージョンと、最初に正常接続できたLLM（サービス名:モデル名）を返す。
// フッター表示用。LLMプローブ結果はサーバー側でキャッシュされる。

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { APP_VERSION } from "./_lib/version";
import { probeLlm } from "./_lib/llm";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  let llm: { provider: string; model: string } | null = null;
  try {
    llm = await probeLlm();
  } catch {
    llm = null;
  }
  res.status(200).json({ version: APP_VERSION, llm });
}
