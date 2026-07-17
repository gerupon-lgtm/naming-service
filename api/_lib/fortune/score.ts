// スコア→ランク変換（T-006）。
// 閾値は CLAUDE.md / 要件定義 v1.7 で確定：
//   SS = 90以上 / S = 80〜89 / A = 65〜79 / B = 50〜64 / C = 49以下
// 実装中に調整可能な設定値として持つ。

import { Rank } from "./types";

/** ランクの下限スコア（この値以上ならそのランク）。降順に評価する。 */
export const RANK_THRESHOLDS: ReadonlyArray<{ rank: Rank; min: number }> = [
  { rank: "SS", min: 90 },
  { rank: "S", min: 80 },
  { rank: "A", min: 65 },
  { rank: "B", min: 50 },
  { rank: "C", min: 0 },
];

/** スコア（0〜100）をランクに変換する。 */
export function scoreToRank(score: number): Rank {
  for (const { rank, min } of RANK_THRESHOLDS) {
    if (score >= min) return rank;
  }
  return "C";
}
