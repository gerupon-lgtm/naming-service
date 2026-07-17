// POST /api/diagnose — 姓名を受け取り診断結果を返す（F-001）。
// GET  /api/diagnose?sei=..&mei=.. — URLパラメータから再計算（F-006 共有用）。
// LLMコメントは含まない（別リクエスト POST /api/comment で非同期取得）。

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  diagnose,
  InvalidInputError,
  DiagnosisUnavailableError,
} from "./_lib/diagnose";

function getParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let sei = "";
  let mei = "";

  if (req.method === "POST") {
    const body = (req.body ?? {}) as { sei?: string; mei?: string };
    sei = body.sei ?? "";
    mei = body.mei ?? "";
  } else if (req.method === "GET") {
    sei = getParam(req.query.sei);
    mei = getParam(req.query.mei);
  } else {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const result = await diagnose({ sei, mei });
    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof InvalidInputError) {
      return res.status(400).json({ error: "INVALID_INPUT", message: e.message });
    }
    if (e instanceof DiagnosisUnavailableError) {
      return res.status(422).json({
        error: "DIAGNOSIS_UNAVAILABLE",
        message:
          "一部の文字の画数情報を取得できませんでした。表記を変えて試すか、しばらくしてから再度お試しください。",
      });
    }
    // kanjiapi.dev 障害等の想定外エラー
    return res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message:
        "現在、文字情報の取得に問題が発生しています。しばらくしてから再度お試しください。",
    });
  }
}
