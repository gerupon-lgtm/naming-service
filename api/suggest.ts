// POST /api/suggest — 条件を受け取りペット命名候補をスコア順に返す（F-002〜F-005）。
// LLMコメントは含まない（Phase2で /api/comment を type:petName で別途呼ぶ・T-106）。

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  suggest,
  SuggestInvalidError,
  type SuggestInput,
} from "./_lib/pet/suggest";
import { allCategories } from "./_lib/pet/nameMaster";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // 画面のカテゴリ選択肢を返す補助用途
    return res.status(200).json({ categories: allCategories() });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const body = (req.body ?? {}) as Partial<SuggestInput>;
  if (body.target !== "dog" && body.target !== "cat" && body.target !== "small") {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "対象動物（dog / cat / small）を指定してください。",
    });
  }

  try {
    const items = await suggest({
      target: body.target,
      sex: body.sex === "male" || body.sex === "female" ? body.sex : undefined,
      categories: Array.isArray(body.categories) ? body.categories : undefined,
      includeChars: Array.isArray(body.includeChars)
        ? body.includeChars
        : undefined,
      charTypes: Array.isArray(body.charTypes) ? body.charTypes : undefined,
      reading: typeof body.reading === "string" ? body.reading : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });
    return res.status(200).json({ candidates: items });
  } catch (e) {
    if (e instanceof SuggestInvalidError) {
      return res.status(400).json({ error: "INVALID_INPUT", message: e.message });
    }
    return res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message:
        "現在、候補の生成に問題が発生しています。しばらくしてから再度お試しください。",
    });
  }
}
