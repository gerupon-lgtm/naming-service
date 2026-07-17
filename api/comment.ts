// POST /api/comment — 構造化済みの診断結果を受け取り、LLM解説コメントを生成する（F-012）。
// LLMコメントは診断結果本体とは別リクエスト。全プロバイダ応答不可なら comment: null を返す
// （フロントはコメント領域を非表示にし、診断結果本体はそのまま表示する）。

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  generateComment,
  type DiagnosisPayload,
  type PetNamePayload,
} from "./_lib/comment";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const body = (req.body ?? {}) as {
    type?: string;
    payload?: DiagnosisPayload | PetNamePayload;
  };

  if (
    (body.type !== "diagnosis" && body.type !== "petName") ||
    !body.payload
  ) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "type（diagnosis / petName）と payload が必要です",
    });
  }

  try {
    const comment = await generateComment(body.type, body.payload);
    return res.status(200).json({ comment }); // comment は string | null
  } catch {
    // 想定外エラーでもコメントは任意扱い。診断結果本体を壊さないよう null を返す。
    return res.status(200).json({ comment: null });
  }
}
