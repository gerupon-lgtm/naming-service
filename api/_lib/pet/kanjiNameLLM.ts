// よみ → 漢字表記の候補を LLM に生成させる（F-004・自然さ重視）。
//
// 機械的な逆引き合成は不自然な並び（例:「丈人桜」）を生みやすいため、
// LLM に「そのよみで読める自然な漢字表記」を複数あげさせ、ロジック側で
// 画数が引けるものだけを採用する。LLM 応答不可時は空配列（かな＋マスタで代替）。

import { generateWithFallback, type LlmProvider } from "../llm";

const TARGET_LABEL: Record<string, string> = {
  dog: "犬",
  cat: "猫",
  small: "小動物",
};

/** 出力から漢字表記だけを1行ずつ抽出する。 */
export function parseKanjiNames(text: string): string[] {
  const names: string[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    // 各行の最初の「漢字の連なり」を名前として取り出す（読み仮名・番号・記号は無視）
    const m = line.match(/[一-鿿々]{1,6}/);
    if (m) names.push(m[0]);
  }
  return Array.from(new Set(names));
}

/** 少なくとも1つ漢字表記が取れる出力を妥当とみなす。 */
function hasKanji(text: string): boolean {
  return parseKanjiNames(text).length > 0;
}

/**
 * 「reading」と読む、その動物にふさわしい自然な漢字表記を count 個生成する。
 * @param providers テスト用の明示注入。省略時は環境変数から連鎖を構築。
 */
export async function generateKanjiNames(
  reading: string,
  target: string,
  providers?: LlmProvider[],
  count = 6
): Promise<string[]> {
  const rd = (reading ?? "").trim();
  if (!rd) return [];
  const animal = TARGET_LABEL[target] ?? "ペット";
  const prompt = [
    `「${rd}」と読む、${animal}の名前にふさわしい漢字表記を${count}個あげてください。`,
    "一般的で自然な表記だけにしてください。奇抜な当て字や見慣れない漢字は避けてください。",
    "1行に1個、漢字のみを書いてください。読み仮名・番号・記号・説明・英語は書かないでください。",
    "例: たろう → 太郎",
  ].join("\n");
  const result = await generateWithFallback(prompt, providers, hasKanji);
  if (!result) return [];
  return parseKanjiNames(result.comment).slice(0, count);
}
