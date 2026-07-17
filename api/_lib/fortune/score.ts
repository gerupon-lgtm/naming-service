// スコア→総合ランク変換（T-006）。
//
// ランクは6段階（上から順に）: 大吉 ＞ 吉 ＞ 中吉 ＞ 小吉 ＞ 末吉 ＞ 凶。
// 各ランクの「下限スコア」を上から順に設定値として持ち、実装中に調整可能とする。
// 生々しい点数の代わりに、この言葉（大吉など）を主表示に使う。

import { Rank } from "./types";

/** ランクの下限スコア（この値以上ならそのランク）。降順に評価する。調整可能な初期値。 */
export const RANK_THRESHOLDS: ReadonlyArray<{ rank: Rank; min: number }> = [
  { rank: "大吉", min: 90 },
  { rank: "吉", min: 76 },
  { rank: "中吉", min: 62 },
  { rank: "小吉", min: 48 },
  { rank: "末吉", min: 34 },
  { rank: "凶", min: 0 },
];

/** スコア（0〜100）を総合ランクに変換する。 */
export function scoreToRank(score: number): Rank {
  for (const { rank, min } of RANK_THRESHOLDS) {
    if (score >= min) return rank;
  }
  return "凶";
}
