// GET /api/health — ヘルスチェック（T-001）。DB接続状態も返す（T-002）。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dbPing } from "./_lib/db";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const db = await dbPing(); // { enabled:false } または { enabled:true, ok:boolean }
  res.status(200).json({
    status: "ok",
    service: "naming-service-api",
    phase: 1,
    db,
  });
}
