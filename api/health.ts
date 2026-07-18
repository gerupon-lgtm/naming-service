// GET /api/health — ヘルスチェック（T-001）。DB接続状態も返す（T-002）。
// どんな失敗でも 200 でJSONを返し、原因を error に載せる（関数を落とさない）。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dbPing } from "./_lib/db";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const db = await dbPing(); // { enabled } / { enabled, ok } / { enabled, ok:false, error }
    res.status(200).json({
      status: "ok",
      service: "naming-service-api",
      phase: 1,
      node: process.version,
      db,
    });
  } catch (e) {
    res.status(200).json({
      status: "error",
      service: "naming-service-api",
      node: process.version,
      error: String(e).slice(0, 300),
    });
  }
}
