// POST /api/bazi — 生年月日（＋任意で出生時刻・出生地）から四柱と五行カウントを返す
// 軽量エンドポイント。LLM・DBは使わない（高速・障害面を切り離す）。
//
// 【用途】四柱推命アプリ（別リポジトリ・別Vercelプロジェクト）が、命式計算を
// このエンジンに一元化するためサーバー間で呼び出す（docs/integration-shichu.md
// 5章 Phase B / B-2「サーバー間API」方式）。姓名診断の総合スコア・ランク・五格には
// 一切影響しない別軸の計算であり、ここでは命式（四柱＋五行カウント）だけを返す。
//
// GET /api/bazi — 都道府県コード一覧（フロントの選択肢生成用）。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildMeishiki } from "./_lib/bazi/meishiki";
import { PREFECTURES } from "./_lib/bazi/longitude";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();

  // 都道府県一覧（コードと名前のみ）。フロントが選択肢を組み立てるのに使える。
  if (req.method === "GET") {
    return res.status(200).json({
      prefectures: PREFECTURES.map((p) => ({ code: p.code, name: p.name })),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応" });
  }

  const body = (req.body ?? {}) as {
    birthDate?: string;
    birthTime?: string;
    birthPlace?: string;
    timezone?: string;
  };

  const birthDate = String(body.birthDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return res
      .status(400)
      .json({ error: "birthDate は YYYY-MM-DD 形式で必須です" });
  }
  // 出生時刻・出生地は任意。未入力なら計算から外す（勝手に補完しない）。
  const birthTime =
    typeof body.birthTime === "string" && /^\d{1,2}:\d{2}$/.test(body.birthTime)
      ? body.birthTime
      : undefined;
  const birthPlace = body.birthPlace ? String(body.birthPlace) : undefined;

  try {
    const meishiki = buildMeishiki({
      birthDate,
      birthTime,
      birthPlace,
      timezone: body.timezone,
    });
    return res.status(200).json({ meishiki });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) });
  }
}
