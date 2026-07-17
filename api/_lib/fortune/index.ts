// 流派の集約点。Phase1 は熊崎式のみ。
// 将来の複数流派対応時はここで id → FortuneMethod を切り替える。

import { FortuneMethod } from "./types";
import { kumazakiMethod } from "./kumazaki";

const METHODS: Record<string, FortuneMethod> = {
  [kumazakiMethod.id]: kumazakiMethod,
};

/** Phase1 のデフォルト流派 ID。 */
export const DEFAULT_METHOD_ID = kumazakiMethod.id;

/** 流派 ID から FortuneMethod を取得する（未知 ID はデフォルトを返す）。 */
export function getMethod(id: string = DEFAULT_METHOD_ID): FortuneMethod {
  return METHODS[id] ?? kumazakiMethod;
}

export * from "./types";
export { scoreToRank, RANK_THRESHOLDS } from "./score";
export { GOKAKU_WEIGHTS } from "./kumazaki";
export {
  FORTUNE_TABLE_81,
  CATEGORY_QUALITY,
  CATEGORY_LABEL,
  type FortuneCategory,
} from "./fortuneTable81";
export { evaluateStroke, type StrokeEval } from "./evaluate";
export {
  type Sex,
  SEX_LABEL,
  FEMALE_CAUTION_STROKES,
  applyGender,
} from "./gender";
export { KAKU_INFO, KAKU_ORDER, type KakuKey } from "./gokakuMeaning";
export { meaningOf, STROKE_MEANING } from "./strokeMeaning";
export {
  calcSansai,
  wuxingOf,
  WUXING_LABEL,
  type Wuxing,
  type SansaiResult,
  type WuxingSummary,
} from "./sansai";
