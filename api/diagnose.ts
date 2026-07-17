// POST /api/diagnose — 姓名を受け取り診断結果を返す（F-001）。
// GET  /api/diagnose?sei=..&mei=.. — URLパラメータから再計算（F-006 共有用）。
// LLMコメントは含まない（別リクエスト POST /api/comment で非同期取得）。

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  diagnose,
  InvalidInputError,
  DiagnosisUnavailableError,
} from "./_lib/diagnose";
import type { Sex } from "./_lib/fortune";

function getParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function normalizeSex(v: string): Sex {
  return v === "male" || v === "female" ? v : "unspecified";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let sei = "";
  let mei = "";
  let sex: Sex = "unspecified";

  if (req.method === "POST") {
    const body = (req.body ?? {}) as { sei?: string; mei?: string; sex?: string };
    sei = body.sei ?? "";
    mei = body.mei ?? "";
    sex = normalizeSex(body.sex ?? "");
  } else if (req.method === "GET") {
    sei = getParam(req.query.sei);
    mei = getParam(req.query.mei);
    sex = normalizeSex(getParam(req.query.sex));
  } else {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const result = await diagnose({ sei, mei, sex });
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
