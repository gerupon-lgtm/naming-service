// 姓名判断の型定義と流派インターフェース。
// Phase1 は熊崎式のみをハードコードするが、将来の複数流派対応に備え
// FortuneMethod インターフェース経由で計算ロジックを差し替え可能にする。

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

/** ランク（SS〜C）。 */
export type Rank = "SS" | "S" | "A" | "B" | "C";

/** 診断結果（API レスポンス本体）。DB には保存しない。 */
export interface DiagnosisResult extends Gokaku {
  /** 姓名すべての合計画数（＝ soukaku と同値。表示用の別名）。 */
  strokeTotal: number;
  /** 0〜100 の総合スコア。 */
  score: number;
  /** スコアから導出したランク。 */
  rank: Rank;
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
  /** 五格から 0〜100 のスコアを算出する。 */
  calcScore(gokaku: Gokaku): number;
}
