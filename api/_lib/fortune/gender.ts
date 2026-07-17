// 性別による吉凶の解釈差（伝統準拠）。
//
// 姓名判断では、一部の強い大吉数を女性の場合だけ「強すぎる（注意数）」として
// 読み替える伝統的な慣習がある。五格の"計算"は性別に影響しないが、
// 算出後の"吉凶評価"にこの補正を適用する。
//
// これは時代背景を伴う価値観を含むルールであり、初期値として調整可能とする。

import { FortuneCategory } from "./fortuneTable81";

export type Sex = "male" | "female" | "unspecified";

export const SEX_LABEL: Record<Sex, string> = {
  male: "男性",
  female: "女性",
  unspecified: "未指定",
};

// 女性が注意すべきとされる代表的な画数（首領運・強運数）。文献により差があるため調整可能。
export const FEMALE_CAUTION_STROKES = new Set([21, 23, 29, 32, 33, 39]);

/** 81画還元後の値が女性注意数かどうか。 */
export function isFemaleCaution(reducedStrokes: number): boolean {
  return FEMALE_CAUTION_STROKES.has(reducedStrokes);
}

/**
 * 性別を加味した吉凶カテゴリを返す。
 * 女性で注意数に該当する場合、大吉/吉 → 半吉 に引き下げる（凶はそのまま）。
 */
export function applyGender(
  base: FortuneCategory,
  reducedStrokes: number,
  sex: Sex
): { category: FortuneCategory; caution?: string } {
  if (sex === "female" && isFemaleCaution(reducedStrokes)) {
    if (base === "daikichi" || base === "kichi") {
      return {
        category: "hankichi",
        caution:
          "伝統的な姓名判断では、女性にとってこの画数は運が強すぎるとされ注意数に挙げられます（結婚・家庭運への影響を説く流派があります）。ただし現代では見直す考え方も広まっており、五格全体のバランスで捉えるのが穏当です。",
      };
    }
  }
  return { category: base };
}
