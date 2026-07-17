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
export { FORTUNE_TABLE_81, CATEGORY_QUALITY } from "./fortuneTable81";
