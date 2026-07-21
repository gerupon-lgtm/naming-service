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
    "三才、五行などの専門用語には（）区切りで姓名診断に適した内容で簡単に説明を追加してください。",
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

/** ペット命名候補向けコメントの入力（F-011・T-106）。響き中心。画数・吉凶は使わない。 */
export interface PetNamePayload {
  reading: string; // 名前のよみ（響き）— これがコメントの主題
  name?: string; // 表記（任意・プロンプトでは主題にしない）
  target?: string; // dog / cat / small
  sexLabel?: string; // 男の子 / 女の子
  categories?: string[];
}

const TARGET_LABEL: Record<string, string> = {
  dog: "犬",
  cat: "猫",
  small: "小動物",
};

/**
 * ペット候補名を解説させるプロンプト。
 * 画数・吉凶には触れず、よみ（響き）と雰囲気だけを材料にして、
 * 日本語のみの自然な短文を書かせる（AIっぽさ・外国語混入を避ける）。
 */
export function buildPetNamePrompt(p: PetNamePayload): string {
  const animal = p.target ? (TARGET_LABEL[p.target] ?? "ペット") : "ペット";
  const vibe = p.categories && p.categories.length ? p.categories.join("・") : "";
  const lines: string[] = [
    `あなたは日本のペットの名付けアドバイザーです。${animal}の名前「${p.reading}」について、`,
    "その響きから受ける印象を、飼い主が微笑むような自然な日本語で1〜2文だけ書いてください。",
    "制約: 必ず日本語のみ。英語・韓国語・中国語・意味不明な記号や文字を混ぜない。",
    "画数・運勢・吉凶・点数には触れない。絵文字や顔文字は使わない。前置き・見出し・箇条書きは書かない。",
    "『AIとして』のような説明もしない。コメント本文だけを出力する。",
  ];
  if (p.sexLabel) lines.push(`（${p.sexLabel}の子です）`);
  if (vibe) lines.push(`（希望の雰囲気: ${vibe}）`);
  return lines.join("\n");
}

// ハングル・ラテン文字が混じる／日本語がほとんど無い出力を「不正」とみなす。
const HANGUL = /[가-힣ᄀ-ᇿ]/;
const LATIN = /[A-Za-z]/g;
const JP = /[぀-ヿ一-鿿]/g;

/** LLM出力が「自然な日本語コメント」として妥当か。 */
export function isJapaneseComment(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 4) return false;
  if (HANGUL.test(t)) return false; // ハングル混入は不可
  const latin = (t.match(LATIN) ?? []).length;
  const jp = (t.match(JP) ?? []).length;
  if (jp < 3) return false; // 日本語がほぼ無い
  if (latin > 3) return false; // 英字が目立つ
  return true;
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
  // 日本語として妥当な出力のみ採用（ハングル・英字混入は弾いて次候補へ）
  const result = await generateWithFallback(prompt, providers, isJapaneseComment);
  return result?.comment ?? null;
}
