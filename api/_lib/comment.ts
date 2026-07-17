// LLMコメント生成（F-012 姓名診断結果向け／将来 F-011 命名候補向けに拡張）。
//
// LLMは「ロジックで確定した結果への肉付け」役に徹する。プロンプトでは数値・ランク・
// 吉凶・五行の再計算をさせず、与えられた豊富な材料を自然な解説にまとめさせる。

import { LlmProvider, generateWithFallback } from "./llm";

export type CommentType = "diagnosis" | "petName";

/** 各格の詳細（diagnose の KakuDetail と同形）。 */
export interface KakuDetailPayload {
  label: string;
  nickname?: string;
  strokes: number;
  categoryLabel: string;
  role: string;
  plain?: string;
  keyword: string;
  summary: string;
  caution?: string;
}

export interface SansaiPayload {
  tenLabel: string;
  jinLabel: string;
  chiLabel: string;
  relationTenJin: string;
  relationJinChi: string;
  categoryLabel: string;
  summary: string;
}

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
  sexLabel?: string; // 男性 / 女性 / 未指定
  details?: KakuDetailPayload[];
  sansai?: SansaiPayload;
}

/** 診断結果を解説させるプロンプトを組み立てる（豊富な材料を渡す）。 */
export function buildDiagnosisPrompt(p: DiagnosisPayload): string {
  const name =
    p.sei || p.mei ? `お名前「${p.sei ?? ""}${p.mei ?? ""}」` : "この姓名";
  const lines: string[] = [
    "あなたは姓名判断（熊崎式）のやさしい解説者です。",
    "以下はロジックで既に確定した診断結果です。数値・ランク・吉凶・五行は絶対に変更・再計算せず、",
    "この内容を前提に、要点を押さえた前向きで具体的な解説を日本語で書いてください。",
    "占いは断定せず、あくまで参考として楽しめるトーンにしてください。",
    "全体で6〜8文程度。まず総合印象、次に人格・総格など重要な格の意味、三才（五行）の流れ、",
    "最後に日々の心がけを一言、という流れでまとめてください。",
    "女性の注意数などの注記がある場合は、断定を避け『伝統的にはこう言われる』程度にやわらかく触れてください。",
    "",
    `【${name}の診断結果】`,
    `総合運勢: ${p.rank}（参考スコア ${p.score}点）／性別: ${p.sexLabel ?? "未指定"}`,
    "",
    "■ 五格の内訳",
  ];

  if (p.details && p.details.length > 0) {
    for (const d of p.details) {
      const nick = d.nickname ? `${d.nickname}（${d.label}）` : d.label;
      let line = `・${nick} ${d.strokes}画・${d.categoryLabel}: ${d.plain ?? d.role} 象意=「${d.keyword}」 ${d.summary}`;
      if (d.caution) line += `【注記】${d.caution}`;
      lines.push(line);
    }
  } else {
    lines.push(
      `・天格${p.tenkaku} 人格${p.jinkaku} 地格${p.chikaku} 外格${p.gaikaku} 総格${p.soukaku}`
    );
  }

  if (p.sansai) {
    lines.push(
      "",
      "■ 三才配置（五行）",
      `天=${p.sansai.tenLabel}・人=${p.sansai.jinLabel}・地=${p.sansai.chiLabel}（${p.sansai.categoryLabel}）`,
      `天と人=${p.sansai.relationTenJin}、人と地=${p.sansai.relationJinChi}。${p.sansai.summary}`
    );
  }

  lines.push(
    "",
    "コメント本文のみを出力してください（前置き・箇条書き・見出し・数値の再掲は不要）。"
  );
  return lines.join("\n");
}

/** ペット命名候補向けコメントの入力（F-011・T-106）。 */
export interface PetNamePayload {
  name: string;
  reading?: string;
  strokeTotal?: number;
  fortuneLabel?: string; // 大吉 等（画数の吉凶）
  target?: string; // dog / cat / small
  sexLabel?: string; // 男の子 / 女の子
  categories?: string[];
  reasons?: string[];
}

const TARGET_LABEL: Record<string, string> = {
  dog: "犬",
  cat: "猫",
  small: "小動物",
};

/** ペット候補名を解説させるプロンプト（数値・吉凶は再計算させない）。 */
export function buildPetNamePrompt(p: PetNamePayload): string {
  const animal = p.target ? (TARGET_LABEL[p.target] ?? "ペット") : "ペット";
  const lines: string[] = [
    "あなたはペットの名付けアドバイザーです。",
    "以下はロジックで確定した候補名の情報です。画数や吉凶は変更・再計算せず、",
    `${animal}の名前として、響き・印象・込められる願いを、やさしく前向きに2〜3文で紹介してください。`,
    "占いは断定せず、飼い主が思わず微笑むようなトーンで。",
    "",
    `候補名: ${p.name}${p.reading ? `（${p.reading}）` : ""}`,
  ];
  if (p.strokeTotal != null)
    lines.push(`画数: ${p.strokeTotal}画${p.fortuneLabel ? `（${p.fortuneLabel}）` : ""}`);
  if (p.sexLabel) lines.push(`向き: ${p.sexLabel}`);
  if (p.categories && p.categories.length) lines.push(`雰囲気: ${p.categories.join("・")}`);
  lines.push("", "コメント本文のみを出力してください（前置き・箇条書き・見出し不要）。");
  return lines.join("\n");
}

/**
 * コメントを生成する。全プロバイダ応答不可なら null（呼び出し側で領域非表示）。
 * @param providers テスト用の明示注入。省略時は環境変数から連鎖を構築。
 */
export async function generateComment(
  type: CommentType,
  payload: DiagnosisPayload | PetNamePayload,
  providers?: LlmProvider[]
): Promise<string | null> {
  const prompt =
    type === "petName"
      ? buildPetNamePrompt(payload as PetNamePayload)
      : buildDiagnosisPrompt(payload as DiagnosisPayload);
  const result = await generateWithFallback(prompt, providers);
  return result?.comment ?? null;
}
