// 1つの画数を「性別を加味して」評価する統合ヘルパー。
// スコア算出（kumazaki）と各格の詳細組み立て（diagnose）で共通利用し、整合性を保つ。

import {
  categoryOf,
  reduceTo81,
  CATEGORY_QUALITY,
  CATEGORY_LABEL,
  type FortuneCategory,
} from "./fortuneTable81";
import { applyGender, type Sex } from "./gender";
import { meaningOf } from "./strokeMeaning";

export interface StrokeEval {
  strokes: number;
  category: FortuneCategory; // 性別適用後
  categoryLabel: string;
  quality: number; // 0〜100（性別適用後）
  keyword: string;
  summary: string;
  caution?: string; // 女性注意数などの注記
}

/** 画数を性別込みで評価する。 */
export function evaluateStroke(strokes: number, sex: Sex): StrokeEval {
  const reduced = reduceTo81(strokes);
  const base = categoryOf(strokes);
  const { category, caution } = applyGender(base, reduced, sex);
  const meaning = meaningOf(strokes);
  return {
    strokes,
    category,
    categoryLabel: CATEGORY_LABEL[category],
    quality: CATEGORY_QUALITY[category],
    keyword: meaning.keyword,
    summary: meaning.summary,
    caution,
  };
}
