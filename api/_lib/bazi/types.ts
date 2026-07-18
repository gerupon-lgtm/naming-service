// 四柱推命（F-015）の型定義。
//
// 【設計の要点】docs/integration-shichu.md を正とする。
// - 人の五行は四柱推命式・名前の五行は画数一の位式（fortune/sansai.ts の wuxingOf）。
//   同じ計算式に統一しないこと。
// - 補うべき五行は「用神」で決める（身弱→印星・比劫／身強→食傷・財・官）。
//   「最も少ない五行を補う」という簡易方式は採用しない。
// - 生年月日のみで判定を完了できること。出生時刻・出生地は任意で、
//   未入力でも処理を止めない（L1→L2→L3 の積み上げ式）。
//   未入力項目を勝手に補完しない（「正午」「東京」等とみなさない）。

import type { Wuxing } from "../fortune/sansai";

export type { Wuxing };

/** 天干（十干）。 */
export type Stem =
  | "甲" | "乙" | "丙" | "丁" | "戊"
  | "己" | "庚" | "辛" | "壬" | "癸";

/** 地支（十二支）。 */
export type Branch =
  | "子" | "丑" | "寅" | "卯" | "辰" | "巳"
  | "午" | "未" | "申" | "酉" | "戌" | "亥";

/**
 * 入力レベル（縮退動作）。docs/integration-shichu.md 3.5。
 * - L1: 生年月日のみ → 三柱（年・月・日）。時柱なし・時差補正なし
 * - L2: ＋出生時刻   → 四柱。時差補正は明石基準のまま（経度補正なし）
 * - L3: ＋出生地     → 四柱＋経度補正＋均時差
 */
export type InputLevel = "L1" | "L2" | "L3";

export const INPUT_LEVEL_LABEL: Record<InputLevel, string> = {
  L1: "標準",
  L2: "詳しい",
  L3: "最も詳しい",
};

export interface BaziInput {
  /** "YYYY-MM-DD"（必須。これだけで判定可能）。 */
  birthDate: string;
  /** "HH:mm"（任意。無ければ時柱なしで計算）。 */
  birthTime?: string;
  /** 都道府県コード（任意。無ければ経度補正なし）。longitude.ts の PREFECTURES のキー。 */
  birthPlace?: string;
  /** 既定 "Asia/Tokyo"。現状は日本のみ想定。 */
  timezone?: string;
}

/** 一柱（干支のペア）。 */
export interface Pillar {
  stem: Stem;
  branch: Branch;
  stemElement: Wuxing;
  branchElement: Wuxing;
}

/** 命式。時柱は出生時刻未入力なら null（勝手に補完しない）。 */
export interface Meishiki {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  /** 出生時刻が無ければ null。 */
  time: Pillar | null;
  /** 日干の五行（その人の核）。 */
  dayElement: Wuxing;
  /** 月支の分野蔵干（節入りからの経過日数で決まる）。 */
  monthZoukan: Stem | null;
  /** 五行カウント（天干＋地支＋月令蔵干）。 */
  gogyoCount: Record<Wuxing, number>;
  /** どのレベルで計算したか。 */
  level: InputLevel;
  /** 早子時により日柱を翌日扱いにしたか（表示・デバッグ用）。 */
  earlyZishiApplied: boolean;
  /** 適用した時差補正（分）。未適用なら 0。 */
  timeShiftMinutes: number;
}

/** 日干の強弱。 */
export type Strength = "strong" | "neutral" | "weak";

export const STRENGTH_LABEL: Record<Strength, string> = {
  strong: "身強",
  neutral: "中和",
  weak: "身弱",
};

export interface StrengthResult {
  strength: Strength;
  /** 判定点数（閾値は設定値。strength.ts 参照）。 */
  score: number;
  /** 日干が月支に通根しているか（判定の中心）。 */
  rootedInMonth: boolean;
  /** 表示用の要約。 */
  summary: string;
}

/**
 * 五行バランスと用神。
 * Phase A（内蔵計算）/ Phase B（四柱推命エンジン）で不変にする契約。
 */
export interface WuxingBalance {
  counts: Record<Wuxing, number>;
  /** 日干の五行。 */
  dayElement: Wuxing;
  /** 最もカウントの少ない五行（参考値。用神の決定には使わない）。 */
  weakElement: Wuxing;
  /** 日干を生む五行（＝印星。身弱時の用神候補）。 */
  supportElement: Wuxing;
  /** 日干の強弱。 */
  strength: Strength;
  /**
   * 用神・喜神の優先リスト（順序付き）。
   * 身弱 → 印星（日干を生む）・比劫（日干と同じ）
   * 身強 → 食傷（日干が生む）・財（日干が剋す）・官（日干を剋す）
   */
  targetElements: Wuxing[];
  level: InputLevel;
}

/**
 * 五行ボーナスの4段階。記号3枠に★を0〜3個ともす。
 *   3=★★★ 総格が第1用神に一致
 *   2=★★☆ 総格が第2以降の用神に一致
 *   1=★☆☆ 総格は不一致だが三才のいずれかが用神に一致
 *   0=☆☆☆ どれにも一致しない（恩恵なし）
 * 総格が主・三才が従という役割分担に沿って段階を切る。
 */
export type BonusLevel = 3 | 2 | 1 | 0;

/**
 * 五行ボーナス（姓名判断の総合ランク・点数・五格には一切影響しない）。
 * 数値（0〜100）は持たず、3段階の言葉＋星で表す。
 */
export interface WuxingBonus {
  /** その人にとって吉となる五行（用神・喜神）。 */
  targetElements: Wuxing[];
  /** 総格の五行（名前の主たる五行）。 */
  soukakuElement: Wuxing;
  /** 三才の五行（天・人・地）。 */
  sansaiElements: Wuxing[];
  /** 実際に補えている五行。 */
  matched: Wuxing[];
  level: BonusLevel;
  /** "★★★" / "★★☆" / "★☆☆" / "☆☆☆" */
  stars: string;
  /**
   * 度合いのラベル。**画面には表示しない**（星と本文で伝えるため）。
   * スクリーンリーダー向けの aria-label など、テキスト等価物としてのみ使う。
   */
  label: string;
  /** 表示用の一文。 */
  summary: string;
  /** 由来が四柱推命であることを明示（表示・テキスト出力で使用）。 */
  source: "shichu";
  /** 計算に使った入力レベル。 */
  inputLevel: InputLevel;
  /** 上位レベルがある場合の案内文（無ければ null）。 */
  levelHint: string | null;
}
