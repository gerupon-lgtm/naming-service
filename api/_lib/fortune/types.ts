// 姓名判断の型定義と流派インターフェース。
// Phase1 は熊崎式のみをハードコードするが、将来の複数流派対応に備え
// FortuneMethod インターフェース経由で計算ロジックを差し替え可能にする。

import type { Sex } from "./gender";
import type { KakuKey } from "./gokakuMeaning";
import type { FortuneCategory } from "./fortuneTable81";
import type { SansaiResult, WuxingSummary } from "./sansai";
import type { WuxingBonus } from "../bazi/types";

/** 五格（天格・人格・地格・外格・総格）。 */
export interface Gokaku {
  /** 天格：姓の合計画数（家系運）。 */
  tenkaku: number;
  /** 人格：姓の末字＋名の頭字（主運・中心的な運）。 */
  jinkaku: number;
  /** 地格：名の合計画数（初年運）。 */
  chikaku: number;
  /** 外格：総格−人格＋霊数補正（社会運）。 */
  gaikaku: number;
  /** 総格：姓名すべての合計画数（総合運）。 */
  soukaku: number;
}

/** 総合ランク（6段階）。大吉 ＞ 吉 ＞ 中吉 ＞ 小吉 ＞ 末吉 ＞ 凶。 */
export type Rank = "大吉" | "吉" | "中吉" | "小吉" | "末吉" | "凶";

/** 名前を構成する1文字。 */
export interface NameChar {
  char: string;
  strokes: number;
  part: "sei" | "mei"; // 姓 / 名
}

/** 各格の詳細（役割・画数・吉凶・意味・成り立ち）。 */
export interface KakuDetail {
  key: KakuKey;
  label: string; // 天格 等
  nickname: string; // やさしい呼び名（例: ルーツ運）
  strokes: number;
  category: FortuneCategory; // 性別適用後
  categoryLabel: string; // 大吉 等
  role: string; // 格の役割
  plain: string; // 一言のやさしい説明
  keyword: string; // 画数の象意
  summary: string; // 画数の短評
  /** この格を構成する文字の、chars 配列におけるインデックス。 */
  members: number[];
  /** 姓または名が1文字で霊数1を補っている場合 true。 */
  reisu?: boolean;
  caution?: string; // 女性注意数などの注記
}

/** 診断結果（API レスポンス本体）。DB には保存しない。 */
export interface DiagnosisResult extends Gokaku {
  /** 姓すべての合計画数（＝ soukaku と同値。表示用の別名）。 */
  strokeTotal: number;
  /** 0〜100 の総合スコア。 */
  score: number;
  /** スコアから導出したランク。 */
  rank: Rank;
  /** 診断に用いた性別。 */
  sex: Sex;
  /** 名前を構成する文字（姓→名の順）。格の成り立ち表示に使う。 */
  chars: NameChar[];
  /** 各格の詳細（天→人→地→外→総の順）。 */
  details: KakuDetail[];
  /** 三才配置（五行の相生・相剋）。 */
  sansai: SansaiResult;
  /** 五行サマリ（四柱推命など他占術との連携用）。 */
  wuxing: WuxingSummary;
  /**
   * 四柱推命による五行ボーナス（F-015）。生年月日の入力があるときだけ付く。
   *
   * 【重要】これは独立した参考情報であり、上の score / rank / 五格には一切影響しない。
   * 共有URL（F-006）は sei/mei/sex のみで再現する設計で、生年月日はURLに載せない。
   * スコアに影響させると本人が見た結果と共有URLの結果が食い違うため。
   */
  wuxingBonus?: WuxingBonus;
}

/** 各文字の画数（姓・名それぞれの配列）。 */
export interface StrokeInput {
  /** 姓の各文字の画数（入力順）。 */
  sei: number[];
  /** 名の各文字の画数（入力順）。 */
  mei: number[];
}

/**
 * 流派インターフェース。
 * 五格計算とスコア算出をまとめて一つの流派として差し替え可能にする。
 */
export interface FortuneMethod {
  /** 流派識別子（例: "kumazaki"）。 */
  readonly id: string;
  /** 各文字の画数配列から五格を計算する。 */
  calcGokaku(input: StrokeInput): Gokaku;
  /** 五格から 0〜100 のスコアを算出する（性別を加味）。 */
  calcScore(gokaku: Gokaku, sex?: Sex): number;
}
