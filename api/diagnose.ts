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
  // 四柱推命による五行ボーナス（F-015）用。POSTでのみ受け取る。
  let birthDate: string | undefined;
  let birthTime: string | undefined;
  let birthPlace: string | undefined;
  // 共有URL用。算出済みの用神リスト（生年月日そのものではない）。
  let wuxingTargets: string | undefined;

  if (req.method === "POST") {
    const body = (req.body ?? {}) as {
      sei?: string;
      mei?: string;
      sex?: string;
      birthDate?: string;
      birthTime?: string;
      birthPlace?: string;
      wuxingTargets?: string;
    };
    sei = body.sei ?? "";
    mei = body.mei ?? "";
    sex = normalizeSex(body.sex ?? "");
    birthDate = body.birthDate || undefined;
    birthTime = body.birthTime || undefined;
    birthPlace = body.birthPlace || undefined;
    wuxingTargets = body.wuxingTargets || undefined;
  } else if (req.method === "GET") {
    // 【重要】共有URL（F-006）では**生年月日を受け取らない**。
    // 代わりに算出済みの用神リスト（wx）だけを受け取り、ボーナスを再現する。
    // wx からは生年月日を復元できないため、URLに個人情報は載らない。
    sei = getParam(req.query.sei);
    mei = getParam(req.query.mei);
    sex = normalizeSex(getParam(req.query.sex));
    wuxingTargets = getParam(req.query.wx) || undefined;
  } else {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const result = await diagnose({
      sei,
      mei,
      sex,
      birthDate,
      birthTime,
      birthPlace,
      wuxingTargets,
    });
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
