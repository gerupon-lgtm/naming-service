// 四柱推命モジュール（F-015）の公開インターフェース。
//
// Phase B（四柱推命アプリのエンジンへ一元化）では、calcWuxingBalance の
// 実装だけを差し替える。ここで公開する型・シグネチャは不変に保つこと。

export type {
  BaziInput,
  Branch,
  BonusLevel,
  InputLevel,
  Meishiki,
  Pillar,
  Stem,
  Strength,
  StrengthResult,
  Wuxing,
  WuxingBalance,
  WuxingBonus,
} from "./types";

export { INPUT_LEVEL_LABEL, STRENGTH_LABEL } from "./types";

export {
  buildMeishiki,
  detectLevel,
  dayPillarIndex,
  pickZoukan,
  BAZI_USE_EARLY_ZISHI,
  BAZI_ZOUKAN_TABLE,
  ZOUKAN_TABLES,
  STEMS,
  BRANCHES,
  STEM_ELEMENT,
  BRANCH_ELEMENT,
} from "./meishiki";

export {
  judgeStrength,
  STRENGTH_CONFIG,
  elementThatGenerates,
  elementGeneratedBy,
  elementControlledBy,
  elementThatControls,
} from "./strength";

export {
  calcWuxingBalance,
  calcWuxingBonus,
  decideTargetElements,
  judgeBonusLevel,
  inputLevelLabel,
  WUXING_BONUS_LABELS,
  WUXING_BONUS_STARS,
  WUXING_INCLUDE_SUPPORT,
} from "./wuxing";

export {
  PREFECTURES,
  findPrefecture,
  calcTimeShiftMinutes,
  equationOfTimeMinutes,
  JST_STANDARD_LONGITUDE,
} from "./longitude";

export {
  SOLAR_TERMS,
  getSolarTermsOfYear,
  findMonthTerm,
  getRisshunMs,
  apparentSolarLongitude,
  _clearSolarTermCache,
} from "./solarTerms";
