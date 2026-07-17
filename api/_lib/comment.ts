// LLMコメント生成（F-012 姓名診断結果向け／将来 F-011 命名候補向けに拡張）。
//
// LLMは「ロジックで確定した結果への肉付け」役に徹する。プロンプトでは数値・ランクの
// 再計算をさせず、与えられた結果を解説させるだけにする。

import { LlmProvider, generateWithFallback } from "./llm";

export type CommentType = "diagnosis" | "petName";

export interface DiagnosisPayload {
  strokeTotal: number;
  tenkaku: number;
  jinkaku: number;
  chikaku: number;
  gaikaku: number;
  soukaku: number;
  score: number;
  rank: string;
  sei?: string;
  mei?: string;
}

/** 診断結果を解説させるプロンプトを組み立てる。 */
export function buildDiagnosisPrompt(p: DiagnosisPayload): string {
  const name = p.sei || p.mei ? `お名前「${p.sei ?? ""}${p.mei ?? ""}」の` : "";
  return [
    "あなたは姓名判断（熊崎式）の解説者です。",
    "以下はロジックで既に確定した診断結果です。数値やランクは絶対に変更・再計算せず、",
    "この結果を前提として、やわらかく前向きな解説コメントを日本語で3〜4文で書いてください。",
    "占いを断定せず、参考として楽しめるトーンにしてください。",
    "",
    `${name}診断結果:`,
    `- 総合点: ${p.score}（ランク ${p.rank}）`,
    `- 天格: ${p.tenkaku}（家系運）`,
    `- 人格: ${p.jinkaku}（主運・中心の運）`,
    `- 地格: ${p.chikaku}（初年運）`,
    `- 外格: ${p.gaikaku}（社会運）`,
    `- 総格: ${p.soukaku}（総合運）`,
    "",
    "コメント本文のみを出力してください（前置き・箇条書き・見出しは不要）。",
  ].join("\n");
}

/**
 * コメントを生成する。全プロバイダ応答不可なら null（呼び出し側で領域非表示）。
 * @param providers テスト用の明示注入。省略時は環境変数から連鎖を構築。
 */
export async function generateComment(
  type: CommentType,
  payload: DiagnosisPayload,
  providers?: LlmProvider[]
): Promise<string | null> {
  if (type !== "diagnosis") {
    // Phase2（petName）は T-106 で対応。Phase1では diagnosis のみ。
    return null;
  }
  const prompt = buildDiagnosisPrompt(payload);
  const result = await generateWithFallback(prompt, providers);
  return result?.comment ?? null;
}
